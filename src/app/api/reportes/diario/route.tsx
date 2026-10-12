import { WHATSAPP_CUENTA_PARA_META, esMarcaWhatsapp } from "@/lib/gestion-whatsapp";
import { cargarIndicadoresDelDia, indicadoresParaDocumento } from "@/lib/indicadores-comerciales";
import { ETIQUETA_ESTADO_APERTURA, ETIQUETA_TIPO_APERTURA, estadoApertura, type TipoApertura } from "@/lib/aperturas-llamada";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { ReporteDiarioPdf } from "@/lib/pdf/reporte-diario-pdf";
import { cargarPotenciales, lunesSemana, resumirSemana } from "@/lib/potenciales-semana";
import { cargarEventosPostventa, eventosDelDia, pendientesDePostventa, type PendientesPostventa } from "@/lib/agenda-postventa-datos";
import { etiquetaEvento } from "@/lib/calendario-postventa";
import { TITULO_PREVENTIVOS_POR_OFRECER } from "@/lib/preventivo";
import { gestionesPorRuta, type RutaPostventa } from "@/lib/reporte-postventa-rutas";
import { createAdminClient } from "@/lib/supabase/admin";
import { pendientesPropios, presupuestosPropios, ventasPropias } from "@/lib/trabajo-propio";
import { pendientesAnotados, bloquesPendientesAnotados } from "@/lib/pendientes-anotados";

// PDF del cierre del día del comercial. La autorización real la hace la
// función SQL (el propio comercial o backoffice); acá solo se comprueba que
// haya sesión y se arma el documento.
//
// Se lee una sola vez al cargar el módulo, no en cada request.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const fechaParam = url.searchParams.get("fecha");
  const fecha = fechaParam && RE_FECHA.test(fechaParam) ? fechaParam : hoyLima();
  // Sin ?comercial, cada quien baja el suyo: es el caso normal del comercial
  // que cierra su día. Gerencia puede pedir el de otro pasándolo explícito.
  const comercialId = url.searchParams.get("comercial") ?? user.id;

  const { data, error } = await supabase.rpc("reporte_diario_comercial", {
    p_comercial: comercialId,
    p_fecha: fecha,
  });
  if (error) {
    const noAutorizado = /No autorizado/i.test(error.message);
    return NextResponse.json(
      { error: noAutorizado ? "No autorizado" : "No se pudo generar el reporte" },
      { status: noAutorizado ? 403 : 500 },
    );
  }

  const r = data as unknown as Parameters<typeof ReporteDiarioPdf>[0] & { fecha: string };
  // La gestión de WhatsApp, aparte (23-09), y fuera de la meta desde el 30-09.
  // Las marcas salen de la lista de seguimientos y el número se recalcula DE
  // ESA MISMA LISTA: así el total de la sección 1 y el número grande cuadran
  // sin que nadie tenga que restar de cabeza (el reclamo del 25-08).
  const marcas = r.seguimientos.filter((s) => esMarcaWhatsapp(s.tipo, s.nota));
  r.resumen = { ...r.resumen, gestion_whatsapp: marcas.length };
  if (!WHATSAPP_CUENTA_PARA_META && marcas.length > 0) {
    const propias = r.seguimientos.filter((s) => !esMarcaWhatsapp(s.tipo, s.nota));
    r.seguimientos = propias;
    r.resumen = {
      ...r.resumen,
      seguimientos_efectivos: propias.filter((s) => s.efectivo).length,
      intentos_sin_contacto: propias.filter((s) => !s.efectivo).length,
    };
  }

  // WhatsApp de campaña, visitas y videollamadas (ing. Carlos, 30-09: «esos
  // dos puntos tienen que estar en su reporte diario»). Si algo falla, el
  // reporte sale igual sin la sección.
  let indicadores: Parameters<typeof ReporteDiarioPdf>[0]["indicadores"];
  try {
    const eq = await cargarIndicadoresDelDia(supabase, [comercialId], fecha, hoyLima());
    const base = indicadoresParaDocumento(eq, comercialId);
    indicadores = base ? { ...base, marcas: marcas.map((m) => ({ hora: m.hora, cliente: m.cliente, nota: m.nota })) } : undefined;
  } catch {
    indicadores = undefined;
  }

  // La proyección de la semana (ing. Carlos, 27-08). Se calcula ACÁ y no dentro
  // de `reporte_diario_comercial`: esa función ya se redefinió una decena de
  // veces y es la que sostiene el informe que gerencia recibe todos los días.
  // Sumarle un bloque más por una sección nueva es apostar el reporte entero;
  // desde acá, si algo falla, el PDF sale igual sin esa sección.
  let proyeccion;
  try {
    const lunes = lunesSemana(fecha);
    const { potenciales } = await cargarPotenciales(lunes, comercialId);
    proyeccion = resumirSemana(lunes, potenciales);
  } catch {
    proyeccion = undefined;
  }
  // POSTVENTA (Carlos, 21-09, mirando la agenda de Rubí): «así como los
  // comerciales tienen lo proyectado para el día siguiente, que también
  // aparezca: despachos, atenciones técnicas, llamadas… y sus pedidos, para
  // ver los procesos, que salgan sus despachados». Y «otras gestiones», lo
  // que se digita en la bitácora como en Central. Se calcula ACÁ, igual que
  // la proyección, por la misma razón: la función SQL no se toca.
  let rutasPostventa: RutaPostventa[] | undefined;
  let pendientesPostventa: { titulo: string; filas: { cliente: string; detalle: string | null }[] }[] | undefined;
  let tituloPendientes: string | undefined;
  let pendientesAnotadosPdf: { titulo: string; filas: { cliente: string; detalle: string | null }[] }[] | undefined;
  let movimientoDelArea: { titulo: string; hora: string | null }[] | undefined;
  try {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("id, rol, es_postventa, hace_postventa, reporte_solo_lo_propio, reporte_por_rutas")
      .eq("id", comercialId)
      .maybeSingle();
    if (perfil?.es_postventa) {
      const manana = r.planificacion_manana.fecha;
      // SOLO LO PROPIO (buzón, Ariana PV3, 10-10: «el reporte debe reflejar
      // únicamente las gestiones que está realizando Postventa 3»). Sin lo
      // del área ni sus pendientes, que son de las compañeras, y lo que hizo
      // en dos cuadros por ruta. Rubí y Gabriela siguen como pidió Carlos.
      const soloPropio = Boolean(perfil.reporte_solo_lo_propio);
      // PRESUPUESTOS Y VENTAS POR QUIEN LOS HIZO (buzón, Gabriela PV2, 12-10:
      // «en ventas cerradas no le está jalando nada»). La función SQL los
      // cuenta por el dueño del cliente y postventa cotiza y cierra sobre
      // clientes de otras carteras: ver `trabajo-propio.ts`. La ruta ya
      // autorizó con la función (el propio o backoffice).
      try {
        const admin = createAdminClient();
        const { data: tcFila } = await admin.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle();
        const [cots, vts] = await Promise.all([
          presupuestosPropios(admin, comercialId, fecha, fecha),
          ventasPropias(admin, comercialId, fecha, fecha, Number(tcFila?.valor) || 3.75),
        ]);
        r.cotizaciones = cots;
        r.ventas = vts;
        r.resumen = {
          ...r.resumen,
          cotizaciones: cots.length,
          cotizaciones_enviadas: cots.filter((c) => c.enviada).length,
          ventas: vts.length,
          monto_vendido_usd: vts.reduce((t, v) => t + v.monto_usd, 0),
        };
      } catch {
        // Se queda con lo que trajo la función.
      }
      const [eventos, { data: bitacora }, pendientes] = await Promise.all([
        // Reunión 23-09: «ahí está mezclada el de Gabriela con… Rubí». El reporte
        // es de UNA persona: los casos salen solo de su cartera y lo compartido
        // del área se rotula aparte abajo. Los montos siguen tapados igual.
        cargarEventosPostventa(supabase, perfil, fecha, manana, { soloMisCasos: true, sinLlamadas: true }),
        supabase.from("bitacora_dia").select("orden, texto").eq("perfil_id", comercialId).eq("fecha", fecha).order("orden"),
        soloPropio ? null : pendientesDePostventa(supabase),
      ]);
      // «Sus pendientes de ella, no de Rubí» (gerencia, 12-10): quien pidió
      // solo lo suyo ve SUS presupuestos sin salir y SUS seguimientos.
      if (soloPropio) {
        // Los del día del reporte: el del viernes dice lo que quedó pendiente
        // el viernes, no lo de hoy.
        const pasado = fecha < hoyLima();
        pendientesPostventa = await pendientesPropios(createAdminClient(), comercialId, hoyLima(), fecha).catch(() => undefined);
        tituloPendientes = pasado ? "SUS PENDIENTES AL CIERRE DEL DÍA" : "SUS PENDIENTES";
        // La tarjeta «Agenda» de un día pasado, con la misma cuenta que la lista.
        if (pasado && pendientesPostventa) {
          r.agenda = { ...r.agenda, pendiente_hoy: pendientesPostventa[1].filas.length, vencidas: pendientesPostventa[2].filas.length };
        }
      }
      // 5b. PENDIENTES DEL ÁREA (22-09, ítem 6): mismos bloques que el panel
      // «Pendiente por tipo» de la agenda, para que el PDF diga lo mismo.
      const ROTULO: Record<keyof PendientesPostventa, string> = {
        despachosSinFecha: "Despachos sin fecha todavía",
        despachosConFecha: "Con fecha de despacho, todavía en planta (y qué les falta)",
        videollamadas: "Videollamadas de preinstalación por pedir al almacén (Lima)",
        puestasEnMarcha: "Puestas en marcha pendientes",
        atencionesSinProgramar: "Atenciones sin programar",
        preventivosPorVencer: TITULO_PREVENTIVOS_POR_OFRECER,
      };
      if (pendientes) {
        pendientesPostventa = (Object.keys(ROTULO) as (keyof PendientesPostventa)[]).map((clave) => ({
          titulo: ROTULO[clave],
          filas: pendientes[clave].map((f) => ({ cliente: f.cliente, detalle: f.detalle })),
        }));
        tituloPendientes = "PENDIENTES DEL ÁREA (PARA CONOCIMIENTO, NO SON GESTIÓN SUYA)";
      }
      // Los que anotó a mano con su tipo (buzón, Rubí 12-10, 0444): solo en el
      // reporte de hoy, porque de un día pasado no se sabe cuáles seguían abiertos.
      // En su propio apartado, uno por tipo, antes de lo del área (buzón, Rubí
      // 12-10: «que se diferencie cada apartado y que aparezca solo mi gestión»).
      if (fecha >= hoyLima()) {
        const anotados = bloquesPendientesAnotados(await pendientesAnotados(createAdminClient(), comercialId).catch(() => []));
        if (anotados.length > 0) pendientesAnotadosPdf = anotados;
      }
      // LAS PROGRAMADAS, POR DÍA (Carlos, 23-09: «videollamadas de
      // preinstalación agrupadas por fecha: 24, 25, 26… solo las
      // programadas»). Salen de las aperturas al almacén (0281) que siguen
      // abiertas, desde hoy en adelante, un bloque por día.
      const { data: aps } = soloPropio
        ? { data: [] }
        : await supabase
          .from("aperturas_llamada")
          .select("tipo, programada_para, equipos, tomada_at, informe_at, revisada_at, enviada_cliente_at, cuentas(razon_social)")
          .is("anulada_at", null)
          .is("enviada_cliente_at", null)
          .gte("programada_para", `${fecha}T00:00:00-05:00`)
          .order("programada_para")
          .limit(200);
      const porDia = new Map<string, { cliente: string; detalle: string | null }[]>();
      for (const a of (aps ?? []) as unknown as {
        tipo: TipoApertura;
        programada_para: string;
        equipos: string;
        tomada_at: string | null;
        informe_at: string | null;
        revisada_at: string | null;
        enviada_cliente_at: string | null;
        cuentas: { razon_social: string } | null;
      }[]) {
        const d = new Date(a.programada_para);
        const dia = d.toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "2-digit", month: "2-digit" });
        const hora = d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
        porDia.set(dia, [
          ...(porDia.get(dia) ?? []),
          {
            cliente: `${hora} · ${a.cuentas?.razon_social ?? "Cliente"}`,
            detalle: `${ETIQUETA_TIPO_APERTURA[a.tipo]} · ${a.equipos.split("\n")[0]} · ${ETIQUETA_ESTADO_APERTURA[estadoApertura({ ...a, anulada_at: null })]}`,
          },
        ]);
      }
      for (const [dia, filas] of porDia) pendientesPostventa?.push({ titulo: `Programadas para el ${dia}`, filas });
      // Lo del área (despachos, visitas a planta…) no es de quien pidió solo lo suyo.
      const suyo = (e: (typeof eventos)[number]) => !soloPropio || e.origen === "tarea" || e.origen === "caso";
      const propio = (e: (typeof eventos)[number]) => e.origen === "tarea" || e.origen === "caso";
      const aFila = (e: (typeof eventos)[number]) => ({
        hora: e.hora,
        titulo: e.cliente,
        tipo: etiquetaEvento(e.tipo),
        detalle: e.titulo + (e.ubicacion ? ` · ${e.ubicacion}` : ""),
      });
      // Hoy: sus casos, sus tareas y la bitácora, en «actividades
      // complementarias»; lo del circuito del área (despachado, visitado…) va
      // en su apartado, «para conocimiento» (buzón, Rubí 12-10: «que aparezca
      // solo de mi gestión realizada»). Quien pidió solo lo suyo no lo recibe.
      const deHoy = eventosDelDia(eventos, fecha);
      r.complementarias = [
        ...deHoy.filter(propio).map((e) => ({
          hora: e.hora,
          titulo: e.origen === "tarea" ? e.titulo : `${etiquetaEvento(e.tipo)} · ${e.cliente} · ${e.titulo}`,
        })),
        ...(bitacora ?? []).map((b) => ({ hora: null, titulo: b.texto })),
        ...r.complementarias,
      ];
      if (!soloPropio)
        movimientoDelArea = deHoy
          .filter((e) => !propio(e))
          .map((e) => ({ hora: e.hora, titulo: `${etiquetaEvento(e.tipo)} · ${e.cliente} · ${e.titulo}` }));
      r.resumen = { ...r.resumen, complementarias: r.complementarias.length };
      // Mañana: al lado de las gestiones y tareas que ya trae la función SQL.
      // Las tareas propias y los casos de la cartera propia ya vienen de ahí:
      // no se repiten (el calendario trae los casos de toda el área).
      const yaEstan = new Set(r.planificacion_manana.gestiones.map((g) => `${g.hora ?? ""}|${g.cliente}`));
      r.planificacion_manana = {
        ...r.planificacion_manana,
        tareas: [
          ...r.planificacion_manana.tareas,
          ...eventosDelDia(eventos, manana)
            .filter(suyo)
            .filter((e) => e.origen !== "tarea" && !(e.origen === "caso" && yaEstan.has(`${e.hora ?? ""}|${e.cliente}`)))
            .map(aFila),
        ],
      };
      r.agenda = { ...r.agenda, manana: r.planificacion_manana.gestiones.length + r.planificacion_manana.tareas.length };
      // Los dos cuadros por ruta son de Ariana (0431); Gabriela pidió solo lo
      // suyo pero con sus seguimientos en la tabla de siempre (0437).
      if (soloPropio && perfil.reporte_por_rutas) rutasPostventa = await gestionesPorRuta(supabase, comercialId, fecha, r.seguimientos);
    }
  } catch {
    // Sin la agenda del área, pero con reporte.
  }
  const fechaLarga = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const buffer = await renderToBuffer(
    <ReporteDiarioPdf
      logoBuffer={LOGO_BUFFER}
      fecha={fechaLarga}
      fechaCorta={fecha}
      comercial={r.comercial}
      resumen={r.resumen}
      seguimientos={r.seguimientos}
      cotizaciones={r.cotizaciones}
      ventas={r.ventas}
      leads={r.leads}
      complementarias={r.complementarias}
      agenda={r.agenda}
      planificacion_manana={r.planificacion_manana}
      proyeccion={proyeccion}
      pendientesPostventa={pendientesPostventa}
      tituloPendientes={tituloPendientes}
      pendientesAnotados={pendientesAnotadosPdf}
      movimientoDelArea={movimientoDelArea}
      rutasPostventa={rutasPostventa}
      indicadores={indicadores}
    />,
  );

  // Queda grabado, y la última generación del día pisa a la anterior: «la que
  // se genere al cierre del día debería ser la que queda» (Carlos, 28-08). Se
  // guarda DESPUÉS de dibujar el PDF y sin bloquear la respuesta si falla: el
  // reporte que la persona está esperando no se cae porque el registro no pudo
  // escribirse.
  try {
    // Un día PASADO se puede volver a abrir para revisarlo (12-10: «una parte
    // para ver los reportes por día»), pero no pisa el que la persona ya dejó
    // grabado: ese es el que se entregó. Solo se graba si ese día no tenía.
    let yaGrabado = false;
    if (fecha < hoyLima()) {
      const { data: previo } = await supabase
        .from("reportes_diarios")
        .select("id")
        .eq("comercial_id", comercialId)
        .eq("fecha", fecha)
        .maybeSingle();
      yaGrabado = Boolean(previo);
    }
    if (!yaGrabado) await supabase.rpc("guardar_reporte_diario", {
      p_comercial: comercialId,
      p_fecha: fecha,
      p_contenido: { ...r, proyeccion, indicadores, fecha_larga: fechaLarga },
    });
  } catch {
    // Sin registro, pero con reporte. Es el orden correcto de prioridades.
  }

  const nombre = `Reporte ${r.comercial.codigo ?? ""} ${fecha}.pdf`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // inline: se abre en el visor del navegador y desde ahí se descarga o
      // se adjunta al correo, que es el flujo que describió gerencia.
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}
