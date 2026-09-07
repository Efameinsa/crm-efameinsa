import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { DECLARACIONES, ejecutarHerramienta, asistenteEncendido, type Evidencia } from "@/lib/asistente/herramientas";

/**
 * EL ASISTENTE DE GERENCIA — piloto.
 *
 * Responde preguntas sobre el CRM consultando las mismas funciones que
 * alimentan las pantallas: clientes, cotizaciones, cierres de venta, gestiones
 * de los comerciales y catálogo de equipos con precios y stock.
 *
 * SOLO CONSULTA. Esto no se apoya en que el modelo se porte bien: no existe un
 * camino de escritura. El modelo únicamente puede invocar las herramientas
 * declaradas en herramientas.ts, todas de lectura, y no hay consulta libre a la
 * base. Aunque le pidan «anulá el cierre 014», no tiene con qué.
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN EL NAVEGADOR. La llave de Google no puede viajar al
 * navegador —quedaría a la vista de cualquiera— y las consultas tienen que
 * correr con la sesión de quien pregunta para que las políticas de la base
 * filtren. Las dos cosas obligan a que esto sea servidor.
 *
 * QUÉ VE GOOGLE. La pregunta, las instrucciones, y los datos que devuelven las
 * herramientas. Esto último importa y hay que decirlo: en el nivel gratuito de
 * AI Studio, Google usa ese contenido para mejorar sus productos y revisores
 * humanos pueden leerlo. Es un piloto y la decisión es de gerencia; si se
 * queda, va nivel pago.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * EL PRESUPUESTO DE TIEMPO. Vercel corta la función a los 60 s y devuelve un
 * 504 crudo: el gerente ve «no carga» y no hay forma de explicarle nada, porque
 * la plataforma mata el proceso antes de que podamos responder.
 *
 * Pasó el 07-09 con «ver presupuestos». Una pregunta vaga hace que el modelo
 * salga a buscar varias veces, y en la capa gratuita cada vuelta cuesta entre
 * 20 y 40 s. Tres vueltas ya se pasan.
 *
 * Así que antes de pedir otra vuelta se mira el reloj. Si no alcanza, se corta
 * por las buenas y se devuelve lo que haya con una explicación honesta — mucho
 * mejor que un error del navegador. Con la capa pagada las respuestas bajan a
 * segundos y esto no se activa nunca.
 */
const PRESUPUESTO_MS = 45_000;

/**
 * DOS MODELOS, NO UNO. En el nivel gratuito cada modelo trae su propia cuota de
 * 20 pedidos por día, y una sola pregunta gasta entre 2 y 4 (uno por cada vuelta
 * de consulta al CRM). Con un modelo solo, el chat se apaga a la quinta o sexta
 * pregunta —y si eso pasa en medio de una reunión, el piloto queda mal—. Así
 * que cuando el primero se queda sin cuota se pasa al segundo, que tiene la
 * suya. Se puede cambiar la lista con GOOGLE_AI_MODELOS.
 */
const MODELOS = (process.env.GOOGLE_AI_MODELOS ?? "gemini-3.8-flash,gemini-3.6-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MAX_VUELTAS = 3;

/** Si Google dice que no queda cuota. Lo demás es un error de verdad. */
function esFaltaDeCuota(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes("429") || /quota|rate limit/i.test(m);
}

/**
 * QUÉ MODELO SE QUEDÓ SIN CUOTA. Sin esto, cada pregunta volvía a golpear al
 * modelo agotado antes de pasar al de respaldo: unos segundos perdidos en cada
 * una, y quien pregunta está en una reunión. Se olvida a los diez minutos, así
 * que si la cuota vuelve (o era un tope por minuto y no por día), se reintenta
 * solo. Vive en memoria del proceso: al reiniciar arranca limpio, que es lo
 * correcto.
 */
const agotados = new Map<string, number>();
const OLVIDO_MS = 10 * 60 * 1000;

function tieneCuota(modelo: string): boolean {
  const hasta = agotados.get(modelo);
  if (hasta == null) return true;
  if (Date.now() > hasta) {
    agotados.delete(modelo);
    return true;
  }
  return false;
}

/**
 * Las instrucciones. Están escritas contra los errores que este sistema ya
 * cometió, no contra errores imaginarios.
 */
const INSTRUCCIONES = `Sos el asistente del CRM de Efameinsa, una empresa peruana que vende, instala y mantiene equipos de lavandería industrial. Le respondés a la gerencia comercial.

REGLA PRIMERA, POR ENCIMA DE TODAS: no inventás datos. Cada cifra, nombre, fecha o estado que digas tiene que venir de una herramienta que llamaste en esta conversación. Si no tenés la herramienta para responder algo, decilo: «eso no lo puedo consultar todavía». Nunca completes con lo que te parece probable. Una cifra inventada dicha con seguridad en una reunión es peor que no responder.

CÓMO RESPONDER
- En español peruano, directo y corto. Quien pregunta está en una reunión.
- La respuesta primero, la explicación después.
- Los montos en dólares con separador de miles: US$ 14.981.
- Cuando menciones un cliente, decí de qué comercial es. Es la mitad de lo que se pregunta.
- Nada de listas largas si alcanza una frase.

LO QUE TENÉS QUE SABER DEL NEGOCIO
- Los comerciales tienen código: C1 es Brenda Taboada, C4 es Ariana Flores, C5 es Katerine Tello.
- La empresa factura con dos razones sociales: EFAMEINSA y OPEN INVESTMENTS. Cada una numera sus documentos por separado, así que un mismo número puede existir dos veces.
- Un presupuesto se llama «Presu_562-26»; un cierre de venta, «014-2026»; un contacto de Central, «PRO-09158».
- Hay dos orígenes de cotizaciones: las del CRM y las del archivo histórico. Las dos son reales.
- Anular no es borrar: un documento anulado conserva su número pero no cuenta para las métricas.
- La meta de venta es US$ 32.000 por semana por comercial; la de gestiones, 35 por día; la de cotizaciones, 50 por semana.

SI LA PREGUNTA ES VAGA, PREGUNTÁ ANTES DE BUSCAR
«Ver presupuestos», «los clientes» o «cómo vamos» no alcanzan para consultar nada útil: el CRM tiene miles de documentos y no sabés cuál quiere. En ese caso NO llames ninguna herramienta. Contestá en una línea pidiendo lo que falta: de qué comercial, de qué semana, o el número del documento. Es más rápido y más útil que traer una lista de mil filas. Buscá solo cuando la pregunta ya trae con qué acotar.

CUÁNDO ADVERTIR EN VEZ DE SOLO RESPONDER
Si una herramienta te devuelve un campo «aviso», repetilo: son casos donde el número es cierto pero se lee mal. Por ejemplo, alguien que vendió US$ 14.981 contra una proyección de US$ 1.772 aparece «a favor», y en realidad quedó lejos de su meta de US$ 32.000 — lo que pasa es que no puso fechas de cierre.

SOS SOLO DE CONSULTA. NO MODIFICÁS NADA
Respondés preguntas sobre el CRM y nada más. No registrás gestiones, no creás ni editás cotizaciones, no emitís ni anulás cierres, no cambiás precios, no borrás nada, no asignás clientes. Tampoco podrías aunque quisieras: no tenés ninguna herramienta que escriba. Si te piden «anulá esto», «cambiá aquello» o «registrá esto», contestá que vos solo consultás e indicá en qué pantalla del CRM se hace.

LO QUE NO TE TOCA
Preguntas como «¿por qué no le cotizaste?» son para la persona, no para vos. Podés dar el dato que las sostiene, pero no juzgues a nadie ni inventes explicaciones sobre por qué alguien hizo o no hizo algo.

SOBRE EQUIPOS Y STOCK
Los precios que devolvés son los vigentes del catálogo, en dólares y por nivel. Con la disponibilidad hay que tener cuidado: hay dos cifras distintas y prometer una máquina que no está es un problema real. Decí siempre de cuál hablás y sugerí confirmarla con Operaciones.`;

/**
 * Google contesta en inglés y con enlaces a su documentación. Eso, proyectado
 * en una reunión, no le dice nada a quien pregunta: hay que contarle qué pasó
 * y qué hacer. El mensaje original queda en el log del servidor.
 */
function enCastellano(mensaje: string): string {
  if (mensaje.includes("429") || /quota|rate limit/i.test(mensaje)) {
    const espera = /retry in ([\d.]+)s/i.exec(mensaje);
    const segundos = espera ? Math.ceil(Number(espera[1])) : null;
    return segundos
      ? `Se llenó la cuota gratuita de consultas de Google. Vuelva a preguntar en ${segundos} segundos.`
      : "Se llenó la cuota gratuita de consultas de Google. Espere un minuto y vuelva a preguntar.";
  }
  if (/API key|API_KEY_INVALID|401|403/i.test(mensaje)) {
    return "La llave de Google no es válida o venció. Hay que revisarla en la configuración.";
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(mensaje)) {
    return "No se pudo hablar con Google. Vuelva a intentar.";
  }
  return `No se pudo consultar: ${mensaje}`;
}

export async function POST(request: Request) {
  // 1. Quién pregunta. Sin sesión no hay asistente.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("rol, nombre").eq("id", user.id).maybeSingle();
  if (!perfil || !["gerencia", "admin"].includes(String(perfil.rol))) {
    return NextResponse.json({ error: "El asistente es de gerencia" }, { status: 403 });
  }

  if (!asistenteEncendido()) {
    return NextResponse.json(
      { error: "El asistente está apagado en este momento." },
      { status: 503 },
    );
  }
  const clave = process.env.GOOGLE_AI_API_KEY as string;

  const { pregunta, anterior, modelo: modeloAnterior } = (await request.json()) as {
    pregunta: string;
    anterior?: string;
    modelo?: string;
  };
  if (!pregunta?.trim()) return NextResponse.json({ error: "Escriba una pregunta" }, { status: 400 });

  const ia = new GoogleGenAI({ apiKey: clave });
  const evidencias: Evidencia[] = [];
  // De dónde se va el tiempo. Se mide siempre y se escribe una línea al final:
  // sin esto, «tarda mucho» no se puede discutir, solo padecer.
  const reloj = { inicio: Date.now(), google: 0, crm: 0, llamadas: 0, consultas: 0 };

  try {
    // EL HILO LO GUARDA GOOGLE, no nosotros. Cada respuesta trae el id de la
    // interacción; la próxima pregunta lo manda de vuelta en `anterior` y la
    // conversación sigue. Además de ser más simple que rearmar el historial,
    // evita reenviar todo lo conversado en cada pregunta — que es justo lo que
    // encarece este tipo de chat.
    // Se prueban los modelos en orden hasta que uno tenga cuota. El hilo solo
    // se continúa si lo sigue atendiendo el mismo modelo que lo empezó; al
    // cambiar de modelo se arranca conversación nueva, que es preferible a
    // mandarle un id que quizá no reconozca.
    let modeloUsado = "";
    let interaccion = null;
    let ultimoError: unknown = null;
    // Si todos están marcados como agotados se prueban igual: la marca es una
    // sospecha con fecha de vencimiento, no una verdad.
    const candidatos = MODELOS.filter(tieneCuota);
    for (const modelo of candidatos.length > 0 ? candidatos : MODELOS) {
      const t = Date.now();
      try {
        interaccion = await ia.interactions.create({
          model: modelo,
          input: pregunta.trim(),
          tools: DECLARACIONES,
          system_instruction: INSTRUCCIONES,
          ...(anterior && modeloAnterior === modelo ? { previous_interaction_id: anterior } : {}),
        });
        reloj.google += Date.now() - t;
        reloj.llamadas++;
        modeloUsado = modelo;
        break;
      } catch (e) {
        reloj.google += Date.now() - t;
        reloj.llamadas++;
        if (!esFaltaDeCuota(e)) throw e;
        console.warn(`asistente: ${modelo} sin cuota, probando el siguiente`);
        agotados.set(modelo, Date.now() + OLVIDO_MS);
        ultimoError = e;
      }
    }
    if (!interaccion) throw ultimoError;

    // Mientras pida datos, se los damos. Con tope: si a la quinta vuelta sigue
    // pidiendo, algo anda mal y es mejor cortar que gastar de más.
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const llamadas = (interaccion.steps ?? []).filter((s) => s.type === "function_call");
      if (llamadas.length === 0) break;

      if (Date.now() - reloj.inicio > PRESUPUESTO_MS) {
        console.warn(`asistente: sin tiempo tras ${evidencias.length} consulta(s), se corta`);
        return NextResponse.json({
          respuesta:
            evidencias.length > 0
              ? `La consulta se está demorando más de lo normal y la corté para no dejarlo esperando. Alcancé a consultar: ${evidencias.map((e) => e.resumen).join("; ")}. Puede ver el detalle abajo, o preguntarme algo más concreto —un comercial, una semana o un número de documento— que sale al toque.`
              : "La consulta se está demorando más de lo normal. Pregúnteme algo más concreto: un comercial, una semana o un número de documento.",
          evidencias,
          interaccion: interaccion.id,
          modelo: modeloUsado,
        });
      }

      const resultados = [];
      for (const ll of llamadas) {
        const paso = ll as { id?: string; name?: string; arguments?: Record<string, unknown> };
        const tCrm = Date.now();
        const ev = await ejecutarHerramienta(paso.name ?? "", paso.arguments ?? {});
        reloj.crm += Date.now() - tCrm;
        reloj.consultas++;
        evidencias.push(ev);
        resultados.push({
          type: "function_result" as const,
          call_id: paso.id ?? "",
          name: paso.name,
          result: JSON.stringify(ev.datos),
        });
      }

      const tSig = Date.now();
      interaccion = await ia.interactions.create({
        model: modeloUsado,
        input: resultados,
        tools: DECLARACIONES,
        system_instruction: INSTRUCCIONES,
        previous_interaction_id: interaccion.id,
      });
      reloj.google += Date.now() - tSig;
      reloj.llamadas++;
    }

    const total = Date.now() - reloj.inicio;
    console.log(
      `asistente: ${(total / 1000).toFixed(1)}s total = ${(reloj.google / 1000).toFixed(1)}s Google (${reloj.llamadas} llamadas) + ` +
        `${(reloj.crm / 1000).toFixed(1)}s CRM (${reloj.consultas} consultas) + ${((total - reloj.google - reloj.crm) / 1000).toFixed(1)}s nuestro`,
    );

    return NextResponse.json({
      respuesta: interaccion.output_text ?? "No pude armar una respuesta.",
      // Con qué la armó. Es lo que impide que una cifra equivocada pase por
      // buena: siempre se puede abrir y mirar de dónde salió.
      evidencias,
      interaccion: interaccion.id,
      modelo: modeloUsado,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("asistente:", mensaje);
    return NextResponse.json({ error: enCastellano(mensaje) }, { status: 502 });
  }
}
