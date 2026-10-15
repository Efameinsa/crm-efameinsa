import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { asistenteEncendido, clienteClaude, costoUsd, errorEnCastellano, ESFUERZO, MODELO } from "@/lib/asistente/claude";
import { avisoDe, ejecutarHerramienta, herramientasPara, type Evidencia } from "@/lib/asistente/herramientas";
import { bitacorasDe, instruccionesDe, instruccionesFijas } from "@/lib/asistente/instrucciones";
import { alcanceDe, type Quien } from "@/lib/asistente/permisos";
import { AdjuntoInvalido, prepararAdjuntos, revisarAdjuntos } from "@/lib/asistente/adjuntos";
import { cargarHilo, crearConversacion, MAX_PREGUNTAS, preguntasDe, registrar, type Registro, type Turno } from "@/lib/asistente/historial";

/**
 * EL ASISTENTE DEL CRM — para todo el personal, con Claude (14-10-2026).
 *
 * Responde cómo funciona el CRM y en qué estado está algo concreto (un pedido,
 * una cotización, un cliente), consultando las mismas funciones que alimentan
 * las pantallas y con los permisos de quien pregunta (ver lib/asistente).
 *
 * SOLO CONSULTA. No existe un camino de escritura: el modelo únicamente puede
 * pedir las herramientas de herramientas.ts, todas de lectura. Lo único que
 * esta ruta escribe es el historial para la auditoría (0479).
 *
 * LA RESPUESTA LLEGA MIENTRAS SE ESCRIBE. Se devuelve un flujo de líneas JSON:
 *   {"t":"conversacion","id"}      el hilo, para la pregunta siguiente
 *   {"t":"consulta","texto"}       «Revisando el pedido 420-26…»
 *   {"t":"texto","d"}              un pedazo de la respuesta
 *   {"t":"fin","evidencias","ms"}  con qué se armó
 *   {"t":"error","mensaje"}
 * Con el Gemini gratuito la gente miraba tres puntitos durante 40 segundos; acá
 * ve qué se está consultando y la respuesta va apareciendo.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Vueltas de consulta por pregunta. Una pregunta normal usa una o dos. */
const MAX_VUELTAS = 5;
/** Tope de tiempo: pasado esto se corta por las buenas con lo que haya. */
const PRESUPUESTO_MS = 100_000;

/**
 * EL HILO VIEJO VA SIN EL PENSAMIENTO (Santos, 15-10: «¿por qué Efamein no
 * funciona?»). Cada bloque de pensamiento lleva una firma atada a las
 * instrucciones con que se creó; las instrucciones llevan la guía y las
 * bitácoras, que cambian con cada despliegue (y la fecha, a medianoche). La
 * pregunta siguiente de una conversación abierta antes de eso fallaba con 400
 * «The block is bound to a different conversation». El pensamiento de las
 * preguntas ya respondidas no hace falta: se quita y queda solo lo dicho y lo
 * consultado. Dentro de la pregunta en curso sí se conserva (lo exige la API).
 */
function sinPensamiento(turnos: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.BetaMessageParam[] {
  return turnos.map((m) => {
    if (m.role !== "assistant" || typeof m.content === "string") return m;
    const content = m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
    return { ...m, content: content.length ? content : [{ type: "text", text: "—" }] };
  });
}

type Evento =
  | { t: "conversacion"; id: string }
  | { t: "consulta"; texto: string }
  | { t: "texto"; d: string }
  | { t: "fin"; evidencias: { texto: string; resumen: string }[]; ms: number }
  | { t: "error"; mensaje: string };

/**
 * GET ?conversacion=<id>: devuelve la conversación ya hecha, para que la
 * ventana la vuelva a mostrar al recargar la página o tras un despliegue
 * (Santos, 14-10). Solo la de quien la pide; si no es suya, 404.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("conversacion") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Conversación inválida" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const preguntas = await preguntasDe(id, user.id);
  if (!preguntas) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return NextResponse.json({
    mensajes: preguntas.flatMap((p) => [
      { texto: p.pregunta, mio: true, adjuntos: p.adjuntos },
      p.estado === "ok" || p.estado === "corte"
        ? {
            texto: p.respuesta ?? "",
            mio: false,
            evidencias: p.consultas
              .filter((c) => !c.resumen.startsWith("falló"))
              .map((c) => ({ texto: avisoDe(c.herramienta, c.argumentos), resumen: c.resumen })),
          }
        : { texto: p.respuesta || p.error || "Esta pregunta no tuvo respuesta.", mio: false, error: true },
    ]),
  });
}

export async function POST(request: Request) {
  const inicio = Date.now();

  // 1. Quién pregunta. Sin sesión no hay asistente.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("perfiles")
    .select(
      "id, nombre, rol, codigo_comercial, activo, es_prueba, es_postventa, hace_postventa, solo_preventivo, es_soporte, es_operaciones, es_almacen, es_importaciones",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || perfil.activo === false) {
    return NextResponse.json({ error: "Su cuenta no está activa." }, { status: 403 });
  }
  const quien = perfil as unknown as Quien;

  if (!asistenteEncendido()) {
    return NextResponse.json({ error: "El asistente está apagado en este momento." }, { status: 503 });
  }

  // La pregunta llega como formulario cuando trae archivos, y como JSON si no.
  let cuerpo: { pregunta?: string; conversacion?: string | null } | null = null;
  let archivos: File[] = [];
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "No se pudo leer lo que envió. Vuelva a intentar." }, { status: 400 });
    cuerpo = { pregunta: String(form.get("pregunta") ?? ""), conversacion: (form.get("conversacion") as string | null) || null };
    archivos = form.getAll("archivos").filter((a): a is File => typeof a !== "string" && a.size > 0);
  } else {
    cuerpo = (await request.json().catch(() => null)) as typeof cuerpo;
  }
  let pregunta = (cuerpo?.pregunta ?? "").trim().slice(0, 2000);
  if (!pregunta && archivos.length === 0) return NextResponse.json({ error: "Escriba una pregunta" }, { status: 400 });
  if (!pregunta) pregunta = archivos.length === 1 ? "¿Qué me puede decir de este archivo?" : "¿Qué me puede decir de estos archivos?";
  try {
    revisarAdjuntos(archivos);
  } catch (e) {
    if (e instanceof AdjuntoInvalido) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  // 2. El hilo: solo si es de esta persona. Si no, se empieza uno nuevo.
  let hilo = cuerpo?.conversacion ? await cargarHilo(cuerpo.conversacion, quien.id) : null;
  if (hilo && hilo.preguntas >= MAX_PREGUNTAS) {
    return NextResponse.json(
      { error: "Esta conversación ya es muy larga. Toque «Empezar de nuevo» para seguir preguntando." },
      { status: 400 },
    );
  }
  const conversacionId = hilo?.id ?? (await crearConversacion(quien.id, pregunta));
  hilo ??= { id: conversacionId, turnos: [], preguntas: 0 };

  // Los archivos, antes de abrir el flujo: si uno no se puede leer, se avisa
  // con un mensaje claro y no se gasta una pregunta.
  let adjuntos: Awaited<ReturnType<typeof prepararAdjuntos>> = { bloques: [], guardados: [] };
  if (archivos.length) {
    try {
      adjuntos = await prepararAdjuntos(archivos, quien.id, conversacionId);
    } catch (e) {
      if (e instanceof AdjuntoInvalido) return NextResponse.json({ error: e.message }, { status: 400 });
      console.error("asistente: adjuntos:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "No se pudieron subir los archivos. Vuelva a intentar." }, { status: 502 });
    }
  }

  const herramientas = herramientasPara(quien);
  const sistema: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: instruccionesFijas(), cache_control: { type: "ephemeral" } },
  ];
  // Las bitácoras de su nivel, cada una en su bloque (permisos.ts).
  for (const bloque of bitacorasDe(quien)) sistema.push({ type: "text", text: bloque, cache_control: { type: "ephemeral" } });
  sistema.push({ type: "text", text: instruccionesDe(quien) });

  const codificar = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(control) {
      const enviar = (e: Evento) => {
        try {
          control.enqueue(codificar.encode(JSON.stringify(e) + "\n"));
        } catch {
          // El navegador se fue; se sigue para dejar el registro.
        }
      };
      enviar({ t: "conversacion", id: conversacionId });

      // Los archivos van antes del texto: así se lee «mire esto» con el archivo delante.
      const turno: Turno = [
        {
          role: "user",
          content: adjuntos.bloques.length ? [...adjuntos.bloques, { type: "text", text: pregunta }] : pregunta,
        },
      ];
      const mensajes: Anthropic.Beta.BetaMessageParam[] = [...sinPensamiento(hilo.turnos), ...turno];
      const evidencias: Evidencia[] = [];
      const consultas: Registro["consultas"] = [];
      const uso = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0, costo: 0 };
      // De dónde se va el tiempo, vuelta por vuelta: sin esto «tarda mucho» no
      // se puede discutir, solo padecer.
      const vueltas: string[] = [];
      let respuesta = "";
      let msPrimerTexto: number | null = null;
      let estado: Registro["estado"] = "ok";
      let error: string | null = null;

      try {
        for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
          const corriente = clienteClaude().beta.messages.stream(
            {
              model: MODELO,
              max_tokens: 8000,
              output_config: { effort: ESFUERZO },
              // Si los filtros de seguridad de Opus rechazan una pregunta
              // legítima, la API la vuelve a correr en el modelo que
              // Anthropic recomienda para ese caso, dentro de la misma llamada.
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              system: sistema,
              tools: herramientas,
              messages: mensajes,
              // Además del caché de las instrucciones, se cachea el hilo: la
              // segunda vuelta y la pregunta siguiente no lo pagan entero.
              cache_control: { type: "ephemeral" },
            },
            { signal: request.signal },
          );

          let textoDeEstaVuelta = false;
          const tVuelta = Date.now();
          let tPrimerEvento: number | null = null;
          let tPrimerTexto: number | null = null;
          let tUltimoTexto: number | null = null;
          corriente.on("streamEvent", () => {
            tPrimerEvento ??= Date.now();
          });
          corriente.on("text", (d) => {
            if (!textoDeEstaVuelta && respuesta) {
              respuesta += "\n\n";
              enviar({ t: "texto", d: "\n\n" });
            }
            textoDeEstaVuelta = true;
            msPrimerTexto ??= Date.now() - inicio;
            tPrimerTexto ??= Date.now();
            tUltimoTexto = Date.now();
            respuesta += d;
            enviar({ t: "texto", d });
          });

          const mensaje = await corriente.finalMessage();
          vueltas.push(
            `v${vuelta + 1}: ${((Date.now() - tVuelta) / 1000).toFixed(1)}s (1.er evento ${tPrimerEvento ? ((tPrimerEvento - tVuelta) / 1000).toFixed(1) : "—"}s, texto ${tPrimerTexto ? ((tPrimerTexto - tVuelta) / 1000).toFixed(1) + "→" + (((tUltimoTexto ?? tPrimerTexto) - tVuelta) / 1000).toFixed(1) : "—"}s, ${mensaje.usage.output_tokens} tok)`,
          );
          uso.entrada += mensaje.usage.input_tokens;
          uso.salida += mensaje.usage.output_tokens;
          uso.cacheLectura += mensaje.usage.cache_read_input_tokens ?? 0;
          uso.cacheEscritura += mensaje.usage.cache_creation_input_tokens ?? 0;
          uso.costo += costoUsd(mensaje.usage);

          if (mensaje.stop_reason === "refusal") {
            estado = "rechazo";
            const aviso = "No puedo responder esa pregunta. Pruebe a formularla de otra manera.";
            const sep = respuesta ? "\n\n" : "";
            respuesta += sep + aviso;
            enviar({ t: "texto", d: sep + aviso });
            break;
          }

          const asistente: Anthropic.Beta.BetaMessageParam = { role: "assistant", content: mensaje.content };
          mensajes.push(asistente);
          turno.push(asistente);

          const pedidos = mensaje.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (mensaje.stop_reason !== "tool_use" || pedidos.length === 0) break;

          if (Date.now() - inicio > PRESUPUESTO_MS || vuelta === MAX_VUELTAS - 1) {
            // Una consulta pedida sin su resultado deja el hilo roto: se
            // contesta igual, diciendo que no se alcanzó a consultar.
            const cortes: Anthropic.Beta.BetaToolResultBlockParam[] = pedidos.map((p) => ({
              type: "tool_result",
              tool_use_id: p.id,
              content: "No se alcanzó a consultar: la pregunta llevaba demasiado tiempo.",
              is_error: true,
            }));
            turno.push({ role: "user", content: cortes });
            estado = "corte";
            const aviso =
              "La consulta se está demorando más de lo normal y la corté para no dejarlo esperando. Pregúnteme algo más concreto: un número de documento, un cliente o un pedido.";
            const sep = respuesta ? "\n\n" : "";
            respuesta += sep + aviso;
            enviar({ t: "texto", d: sep + aviso });
            break;
          }

          // Las consultas de una vuelta van todas a la vez.
          for (const p of pedidos) enviar({ t: "consulta", texto: avisoDe(p.name, p.input as Record<string, unknown>) });
          const resultados = await Promise.all(
            pedidos.map(async (p): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              const t = Date.now();
              const args = (p.input ?? {}) as Record<string, unknown>;
              try {
                const ev = await ejecutarHerramienta(p.name, args, quien);
                evidencias.push(ev);
                consultas.push({ herramienta: p.name, argumentos: args, resumen: ev.resumen, ms: Date.now() - t });
                return { type: "tool_result", tool_use_id: p.id, content: JSON.stringify(ev.datos ?? null) };
              } catch (e) {
                const m = e instanceof Error ? e.message : String(e);
                console.error(`asistente: ${p.name} falló:`, m);
                consultas.push({ herramienta: p.name, argumentos: args, resumen: `falló: ${m}`, ms: Date.now() - t });
                return {
                  type: "tool_result",
                  tool_use_id: p.id,
                  content: "La consulta falló en el CRM. Dígale a la persona que no pudo consultarse y que lo intente de nuevo.",
                  is_error: true,
                };
              }
            }),
          );
          // Después de una consulta, Opus escribe la respuesta entera y la manda
          // de una vez (medido el 14-10: ~9 s y llega en bloque). Que la
          // burbuja diga en qué está, en vez de quedarse en «Revisando…».
          enviar({ t: "consulta", texto: "Armando la respuesta" });
          const respuestaConsultas: Anthropic.Beta.BetaMessageParam = { role: "user", content: resultados };
          mensajes.push(respuestaConsultas);
          turno.push(respuestaConsultas);
        }

        if (!respuesta.trim()) {
          respuesta = "No pude armar una respuesta. Pruebe a preguntarlo de otra manera.";
          enviar({ t: "texto", d: respuesta });
        }
        // Al navegador va en palabras —qué revisó y qué encontró—, sin el
        // nombre interno de la consulta ni los datos crudos.
        enviar({
          t: "fin",
          evidencias: evidencias.map((e) => ({ texto: avisoDe(e.herramienta, e.argumentos), resumen: e.resumen })),
          ms: Date.now() - inicio,
        });
      } catch (e) {
        const abortada = request.signal.aborted;
        estado = abortada ? "corte" : "error";
        error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        console.error("asistente:", error);
        if (!abortada) enviar({ t: "error", mensaje: errorEnCastellano(e) });
      } finally {
        const total = Date.now() - inicio;
        console.log(
          `asistente: ${(total / 1000).toFixed(1)}s (primer texto ${msPrimerTexto != null ? (msPrimerTexto / 1000).toFixed(1) + "s" : "—"}) · ` +
            `${consultas.length} consulta(s) · US$ ${uso.costo.toFixed(4)} · ${estado} · ${vueltas.join(" · ")}`,
        );
        await registrar({
          conversacionId,
          usuarioId: quien.id,
          rol: String(quien.rol),
          alcance: alcanceDe(quien),
          pregunta,
          adjuntos: adjuntos.guardados,
          respuesta: respuesta || null,
          estado,
          error,
          consultas,
          // Solo un turno completo y sano entra al hilo de la próxima pregunta.
          turno: estado === "ok" ? turno : null,
          modelo: MODELO,
          uso,
          msPrimerTexto,
          msTotal: total,
        });
        try {
          control.close();
        } catch {
          // ya cerrado
        }
      }
    },
  });

  return new Response(flujo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Que ningún intermediario junte la respuesta antes de mandarla.
      "X-Accel-Buffering": "no",
    },
  });
}
