import type { createClient } from "@/lib/supabase/server";
import { totalConIgv } from "@/lib/monto-cotizacion";
import { etiquetaTipoServicio } from "@/lib/postventa";
import type { CambioSolicitud, EventoTimeline } from "@/components/crm/linea-tiempo-cuenta";
import { firmarAdjuntosDeLeads } from "@/lib/adjuntos-lead";
import type { AdjuntoLead } from "@/lib/validaciones/lead";
import type { ExpedienteArchivado } from "@/lib/asi-se-quedo";
import { requerirPerfil } from "@/lib/auth";

// Se muestran las 300 actividades más recientes por cuenta — de sobra para el
// volumen real del piloto (~50 gestiones/día por comercial); si algún día se
// supera, la expansión del cliente (LineaTiempoCuenta) igual funciona sobre
// lo que llega, solo dejaría de ser "el historial completo".
const LIMITE_ACTIVIDADES = 300;

function etiquetaCotizacion(estado: string, estadoAprobacion: string): { label: string; color: "ambar" | "verde" | "rojo" } {
  if (estadoAprobacion === "pendiente_gerencia") return { label: "pendiente de aprobación", color: "ambar" };
  if (estadoAprobacion === "rechazada_gerencia") return { label: "rechazada", color: "rojo" };
  if (estado === "enviada") return { label: "enviada", color: "verde" };
  if (estado === "aceptada") return { label: "aceptada", color: "verde" };
  return { label: "creada", color: "verde" };
}

interface Item {
  cantidad: number;
  /** null cuando la historia se mira sin montos (postventa, 0221). */
  precio_unitario: number | null;
  productos: { marca: string; modelo: string; nombre: string } | null;
}

// Las filas tal como llegan de la base. Se nombran porque hay DOS caminos que
// las traen —las consultas con RLS y `historial_cuenta_para_postventa`— y los
// dos tienen que entregar la misma forma para que la cronología sea una sola.
interface FilaOportunidad { id: string; origen: string | null }
interface FilaCotHist {
  id: string; codigo: string | null; correlativo: number | null; anio: number | null; serie: string | null;
  fecha: string | null; monto_sin_igv: number | null; items: string[] | null; n_equipos: number | null; pdf_path: string | null;
  /** Solo en el paquete de postventa (0319): hay documento, pero la ruta no viaja. */
  tiene_pdf?: boolean;
}
interface FilaActividad {
  id: string; tipo: string; nota: string | null; realizada_at: string; oportunidad_id: string;
  adjuntos?: { path: string; nombre: string }[] | null;
  proxima_accion: string | null; proxima_accion_at: string | null; proxima_accion_hora: string | null;
  catalogo_resultados_gestion: { codigo: string; nombre: string } | null;
  /** Quién la registró (Carlos, 22-09: «necesitamos saber quién está registrando esas gestiones»). */
  perfiles?: { nombre: string; codigo_comercial: string | null } | null;
}
interface FilaCotizacion {
  id: string; codigo: string | null; estado: string; estado_aprobacion: string;
  total: number | null; moneda: string; created_at: string; oportunidad_id: string;
}
interface FilaVenta {
  id: string; fecha_venta: string; monto_total: number | null; moneda: string; oportunidad_id: string;
  cotizacion_id: string | null; referencia_historica: string | null; equipo_historico: string | null;
  anulada_at: string | null; cotizaciones: { codigo: string | null; serie: string; cotizacion_items: Item[] } | null;
}

export interface VentaConDetalle {
  id: string;
  fecha_venta: string;
  /** null cuando la historia se mira sin montos (postventa, 0221). */
  monto_total: number | null;
  moneda: string;
  oportunidad_id: string;
  // Nro de presupuesto del Excel histórico ("1505-24") cuando la venta no
  // tiene cotización real en el sistema (migración 0027).
  referencia_historica: string | null;
  equipo_historico: string | null;
  cotizaciones: { codigo: string | null; serie: string; cotizacion_items: Item[] } | null;
  // El presupuesto del archivo del que salió esta venta, encontrado por su Nº.
  // Trae los equipos que se cotizaron —el dato que la hoja de ventas casi
  // nunca registró (solo 39 de 626 ventas traen `equipo_historico`, mientras
  // que 4.493 de 5.559 cotizaciones sí listan los equipos)— y la ruta para
  // abrir el documento.
  documentoArchivo: { id: string; items: string[]; tienePdf: boolean } | null;
}

export interface HistorialCuentaResultado {
  eventos: EventoTimeline[];
  ventasConDetalle: VentaConDetalle[];
  /**
   * Los expedientes del cliente que están en «Histórico», con lo que quedó
   * agendado al archivarse. Alimentan «Así se quedó» (30-09): el expediente
   * nuevo enseña el archivo sin reactivarlo ni contarlo como trabajo.
   */
  archivados: ExpedienteArchivado[];
}

// Fusiona actividades + cotizaciones + ventas de TODAS las oportunidades de
// una cuenta en una sola cronología — usado por la ficha del cliente
// (comercial y gerencia) y por el detalle de oportunidad, que ahora muestra
// la historia COMPLETA del cliente, no solo la de esa oportunidad.
export async function cargarHistorialCuenta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cuentaId: string,
  opciones: {
    /**
     * POSTVENTA MIRA LA HISTORIA SIN CIFRAS (0221). Ariana, 11-09, con HOTEL
     * ROUTE 66 desde su cuenta de postventa: «no encuentra información de sus
     * ventas». Estaban —dos ventas y dos presupuestos, en expedientes de C5—
     * pero las políticas solo le abren al área lo que tiene tipo_postventa, y
     * la ficha le salía vacía donde al comercial le sale llena. Con esto la
     * historia viene por la función de la base, que devuelve todo menos los
     * montos, que es exactamente el corte que pidió Carlos el 10-09.
     */
    sinMontos?: boolean;
  } = {},
): Promise<HistorialCuentaResultado> {
  // El paquete sin cifras, cuando corresponde. Una sola ida y vuelta en vez de
  // cinco, y ninguna política que abrir.
  const paquete = opciones.sinMontos
    ? ((await supabase.rpc("historial_cuenta_para_postventa", { p_cuenta: cuentaId })).data as null | {
        oportunidades: FilaOportunidad[];
        actividades: FilaActividad[];
        cotizaciones: FilaCotizacion[];
        cot_historicas: FilaCotHist[];
        ventas: FilaVenta[];
      })
    : null;

  const oportunidades = paquete
    ? paquete.oportunidades
    : ((await supabase.from("oportunidades").select("id, origen").eq("cuenta_id", cuentaId)).data as FilaOportunidad[] | null);
  const opIds = (oportunidades ?? []).map((o) => o.id);
  // Las oportunidades que vinieron del Excel son un cascarón: la creó el
  // importador para poder colgar la venta, y su pantalla no tiene etapa que
  // mover, ni próxima acción, ni cotizaciones que enviar — solo repite esta
  // misma historia del cliente. Enlazar hacia ahí deja al comercial en una
  // vista que parece la misma. Solo se navega a las que son un sitio de
  // trabajo de verdad.
  const opsConTrabajo = new Set(
    (oportunidades ?? []).filter((o) => o.origen !== "historico_excel").map((o) => o.id),
  );
  const aDonde = (id: string | null) => (id && opsConTrabajo.has(id) ? id : null);

  // EL TIPO DE CADA EXPEDIENTE Y EL CONTACTO QUE LO ORIGINÓ (gerencia, 28-09).
  // Van aparte porque el paquete sin cifras de postventa no los trae; la RLS
  // deja ver los de postventa a toda el área (0317) y los comerciales a su
  // dueño — lo que no se alcanza a ver sale como «comercial».
  // Por cuenta y no con `.in(ids)`: un cliente con decenas de expedientes
  // revienta la URL (trampa conocida).
  const { data: opsTipo } = await supabase
    .from("oportunidades")
    .select("id, tipo_postventa, lead_id, etapa, proxima_accion, proxima_accion_at")
    .eq("cuenta_id", cuentaId);
  const archivados: ExpedienteArchivado[] = (opsTipo ?? [])
    .filter((o) => o.etapa === "historico")
    .map((o) => ({
      id: o.id as string,
      proxima_accion: (o.proxima_accion as string | null) ?? null,
      proxima_accion_at: (o.proxima_accion_at as string | null) ?? null,
    }));
  const idsArchivados = new Set(archivados.map((a) => a.id));
  const tipoDe = new Map<string, string | null>((opsTipo ?? []).map((o) => [o.id as string, (o.tipo_postventa as string | null) ?? null]));
  const delExpediente = (opId: string | null | undefined) =>
    opId
      ? { expediente: opId, expedienteTipo: tipoDe.get(opId) ?? null, expedienteArchivado: idsArchivados.has(opId) }
      : { expediente: null, expedienteTipo: null, expedienteArchivado: false };
  const leadOriginal = new Map<string, string>(
    (opsTipo ?? []).filter((o) => o.lead_id).map((o) => [o.lead_id as string, o.id as string]),
  );
  type FilaLead = {
    id: string; codigo: string | null; canal: string; mensaje: string | null; recibido_at: string | null; created_at: string;
    nombre_contacto: string | null; telefono: string | null; email: string | null; oportunidad_id: string | null;
    adjuntos: AdjuntoLead[] | null; perfiles: { nombre: string; codigo_comercial: string | null } | null;
    estado: string; recibido_por: string | null; razon_social: string | null; num_doc: string | null;
  };
  const camposLead =
    "id, codigo, canal, mensaje, recibido_at, created_at, nombre_contacto, telefono, email, oportunidad_id, adjuntos, estado, recibido_por, razon_social, num_doc, perfiles:recibido_por(nombre, codigo_comercial)";
  const opsDelCliente = new Set(opIds);
  const { data: leadsCuenta } = opIds.length
    ? await supabase.from("leads").select(camposLead).eq("cuenta_id", cuentaId).limit(200)
    : { data: [] };
  const leadsDelCliente = new Map<string, FilaLead>();
  for (const l of (leadsCuenta ?? []) as unknown as FilaLead[])
    if (leadOriginal.has(l.id) || (l.oportunidad_id && opsDelCliente.has(l.oportunidad_id))) leadsDelCliente.set(l.id, l);
  // LO QUE SE CORRIGIÓ DE CADA SOLICITUD, y si quien mira puede corregirla
  // (0354, Rubí 30-09). La marca «editado» sale siempre: es lo que evita que
  // se reescriba sin que se note.
  const cambiosPorLead = await cargarCambiosDeSolicitudes(supabase, [...leadsDelCliente.keys()]);
  const quienMira = await requerirPerfil();
  const puedeCorregir = (l: FilaLead) =>
    (l.estado === "pendiente_triaje" || l.estado === "asignado") &&
    (["central", "gerencia", "admin"].includes(quienMira.rol) || l.recibido_por === quienMira.id);
  const adjuntosPorLead = await firmarAdjuntosDeLeads(
    supabase as never,
    [...leadsDelCliente.values()].map((l) => ({ id: l.id, adjuntos: l.adjuntos })),
  );

  // Cotizaciones que la empresa emitió ANTES del CRM (tabla
  // cotizaciones_historicas, 2.644 documentos de las unidades S: y T:).
  // Cuelgan de la cuenta y no de una oportunidad, porque en su momento no
  // existían las oportunidades: por eso se consultan aparte y no por opIds.
  const cotHistoricas = paquete
    ? paquete.cot_historicas
    : ((
        await supabase
          .from("cotizaciones_historicas")
          .select("id, codigo, correlativo, anio, serie, fecha, monto_sin_igv, items, n_equipos, pdf_path")
          .eq("cuenta_id", cuentaId)
          .order("fecha", { ascending: false })
          .limit(100)
      ).data as FilaCotHist[] | null);

  // Lo que hizo postventa con este cliente: servicios (los 605 informes
  // importados de R:\ y los pedidos del CRM) y atenciones. El comercial lo ve
  // en la misma cronología, porque mantenimiento lo venden los dos.
  const [{ data: servicios }, { data: atenciones }, { data: informesTecnicos }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("id, fecha_confirmacion, tipo_servicio, equipo, monto, moneda, completado, created_at, oportunidad_id, perfiles!servicios_postventa_responsable_id_fkey(nombre)")
      .eq("cuenta_id", cuentaId)
      .order("fecha_confirmacion", { ascending: false, nullsFirst: false })
      .limit(60),
    supabase
      .from("atenciones")
      .select("id, tipo, etapa, equipo_texto, detalle, registrado_at, created_at, cerrado_at, oportunidad_id, perfiles!atenciones_tomada_por_fkey(nombre)")
      .eq("cuenta_id", cuentaId)
      .order("created_at", { ascending: false })
      .limit(60),
    // LOS INFORMES TÉCNICOS (28-09): el que el almacén registra al atender una
    // llamada derivada no tiene máquina, y no salía en ninguna parte de la
    // ficha (Rubí, con KARINA SAAVEDRA HOSPEDAJE, informe 004-2026).
    supabase
      .from("informes_servicio")
      .select("id, correlativo, anio, tipo, modalidad, ejecutado_at, emitido_at, tecnico, equipo_texto, detalle, es_prueba, servicio_id")
      .eq("cuenta_id", cuentaId)
      .order("ejecutado_at", { ascending: false })
      .limit(60),
  ]);

  const [{ data: actividades }, { data: cotizaciones }, { data: ventas }] = (paquete
    ? [{ data: paquete.actividades }, { data: paquete.cotizaciones }, { data: paquete.ventas }]
    : opIds.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("actividades")
            .select(
              "id, tipo, nota, realizada_at, oportunidad_id, adjuntos, proxima_accion, proxima_accion_at, proxima_accion_hora, catalogo_resultados_gestion(codigo, nombre), perfiles:realizada_por(nombre, codigo_comercial)",
            )
            .in("oportunidad_id", opIds)
            .order("realizada_at", { ascending: false })
            .limit(LIMITE_ACTIVIDADES),
          supabase
            .from("cotizaciones")
            .select("id, codigo, estado, estado_aprobacion, total, moneda, created_at, oportunidad_id")
            .in("oportunidad_id", opIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("ventas")
            .select(
              "id, fecha_venta, monto_total, moneda, oportunidad_id, cotizacion_id, referencia_historica, equipo_historico, anulada_at, cotizaciones(codigo, serie, cotizacion_items(cantidad, precio_unitario, productos(marca, modelo, nombre)))",
            )
            .in("oportunidad_id", opIds)
            .order("fecha_venta", { ascending: false }),
        ])) as [{ data: FilaActividad[] | null }, { data: FilaCotizacion[] | null }, { data: FilaVenta[] | null }];

  // LO QUE COTIZÓ POSTVENTA SE VE CON SU TOTAL (Santos, 28-09): el paquete sin
  // cifras (0221) tapa todas las cotizaciones; las de expedientes de postventa
  // se leen aparte (la RLS se las abre al área) y llevan su monto.
  const totalPostventa = new Map<string, number | null>();
  if (paquete) {
    const ids = (cotizaciones ?? []).filter((c) => tipoDe.get(c.oportunidad_id)).map((c) => c.id);
    if (ids.length) {
      const { data: conTotal } = await supabase.from("cotizaciones").select("id, total").in("id", ids.slice(0, 150));
      for (const c of conTotal ?? []) totalPostventa.set(c.id as string, c.total != null ? Number(c.total) : null);
    }
  }

  // URLs firmadas para los adjuntos (bucket privado): una sola llamada batch.
  type AdjuntoMeta = { path: string; nombre: string };
  const todasLasRutas = (actividades ?? []).flatMap((a) => ((a as { adjuntos?: AdjuntoMeta[] }).adjuntos ?? []).map((x) => x.path));
  const urlPorRuta = new Map<string, string>();
  if (todasLasRutas.length) {
    const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(todasLasRutas, 3600);
    for (const f of firmadas ?? []) if (f.signedUrl && f.path) urlPorRuta.set(f.path, f.signedUrl);
  }

  // Nº de presupuesto → documento del archivo, para poder enlazar cada venta
  // histórica con la cotización de la que salió, y de paso saber QUÉ EQUIPOS
  // llevaba. Si el mismo Nº aparece dos veces —pasa cuando el comercial tecleó
  // mal el número dentro del documento y dos clientes distintos comparten
  // código— se queda el que tiene PDF: es el único que se puede abrir.
  const documentoPorCodigo = new Map<string, { id: string; items: string[]; tienePdf: boolean }>();
  for (const c of cotHistoricas ?? []) {
    if (!c.codigo) continue;
    const previo = documentoPorCodigo.get(c.codigo);
    // Con PDF gana: es el único que se puede abrir.
    const tienePdf = Boolean(c.pdf_path || c.tiene_pdf);
    if (!previo || (!previo.tienePdf && tienePdf)) documentoPorCodigo.set(c.codigo, { id: c.id, items: c.items ?? [], tienePdf });
  }

  const TIPO_ATENCION: Record<string, string> = { problema_tecnico: "Problema técnico", solicitud_repuesto: "Repuesto" };
  const eventos: EventoTimeline[] = [
    ...(servicios ?? []).map((sv): EventoTimeline => ({
      tipo: "servicio",
      id: `servicio-${sv.id}`,
      fecha: (sv.fecha_confirmacion as string | null) ?? (sv.created_at as string),
      titulo: `Servicio de postventa: ${(sv.tipo_servicio as string | null) ?? "servicio"}${sv.completado ? " (completado)" : ""}`,
      detalle: (sv.equipo as string | null)?.split("\n")[0]?.slice(0, 140) ?? null,
      quien: (sv.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
      href: `/postventa/pedidos/${sv.id}`,
      oportunidadId: null,
      ...delExpediente(sv.oportunidad_id as string | null),
      monto: sv.monto != null ? Number(sv.monto) : null,
      moneda: (sv.moneda as string | null) ?? null,
    })),
    ...(informesTecnicos ?? []).map((inf): EventoTimeline => ({
      tipo: "servicio",
      id: `informe-${inf.id}`,
      fecha: inf.ejecutado_at as string,
      titulo: `Informe técnico: ${etiquetaTipoServicio(inf.tipo as string)}${
        inf.correlativo != null ? ` N.º ${inf.es_prueba ? "PRUEBA " : ""}${String(inf.correlativo).padStart(3, "0")}-${inf.anio}` : " (borrador)"
      }${inf.modalidad === "videollamada" ? " · videollamada" : ""}`,
      detalle: [(inf.equipo_texto as string | null)?.split("\n")[0], inf.detalle as string | null].filter(Boolean).join(" · ").slice(0, 160) || null,
      quien: (inf.tecnico as string | null) ?? null,
      href: `/postventa/informes/${inf.id}`,
      oportunidadId: null,
    })),
    ...(atenciones ?? []).map((at): EventoTimeline => ({
      tipo: "servicio",
      id: `atencion-${at.id}`,
      fecha: (at.registrado_at as string | null) ?? (at.created_at as string),
      titulo: `Atención de postventa: ${TIPO_ATENCION[at.tipo as string] ?? at.tipo}${at.cerrado_at ? " (cerrada)" : ` · ${at.etapa}`}`,
      detalle: [(at.equipo_texto as string | null), (at.detalle as string | null)].filter(Boolean).join(" · ").slice(0, 160) || null,
      quien: (at.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
      href: `/postventa/atenciones/${at.id}`,
      oportunidadId: null,
      ...delExpediente(at.oportunidad_id as string | null),
    })),
    ...(actividades ?? []).map((a): EventoTimeline => {
      const resultado = a.catalogo_resultados_gestion as unknown as { codigo: string; nombre: string } | null;
      return {
        tipo: "actividad",
        id: a.id,
        fecha: a.realizada_at,
        oportunidadId: aDonde(a.oportunidad_id),
        ...delExpediente(a.oportunidad_id),
        tipoActividad: a.tipo,
        nota: a.nota,
        resultado,
        quien: a.perfiles ? `${a.perfiles.codigo_comercial ? `${a.perfiles.codigo_comercial} · ` : ""}${a.perfiles.nombre}` : null,
        proximaAccion: a.proxima_accion,
        proximaAccionAt: a.proxima_accion_at,
        proximaAccionHora: a.proxima_accion_hora ? String(a.proxima_accion_hora).slice(0, 5) : null,
        adjuntos: ((a as { adjuntos?: { path: string; nombre: string }[] }).adjuntos ?? [])
          .map((x) => ({ nombre: x.nombre, url: urlPorRuta.get(x.path) ?? "" }))
          .filter((x) => x.url),
      };
    }),
    ...(cotizaciones ?? []).map((c): EventoTimeline => {
      const { label, color } = etiquetaCotizacion(c.estado, c.estado_aprobacion);
      return {
        tipo: "cotizacion",
        id: c.id,
        fecha: c.created_at,
        oportunidadId: aDonde(c.oportunidad_id),
        ...delExpediente(c.oportunidad_id),
        codigo: c.codigo,
        estadoLabel: label,
        color,
        // Con IGV, como en el cotizador y el PDF (UX, 08-09). null cuando la
        // historia se mira sin cifras.
        monto: totalPostventa.has(c.id)
          ? (totalPostventa.get(c.id) != null ? totalConIgv(totalPostventa.get(c.id)!) : null)
          : c.total != null ? totalConIgv(c.total) : null,
        montoReservado: Boolean(paquete) && !totalPostventa.has(c.id),
        moneda: c.moneda,
        // A propósito SIN pdfUrl: la cotización del CRM vive en su oportunidad,
        // donde además de bajar el PDF se la envía, se la duplica y se registra
        // la venta. Repetir acá solo una de esas acciones haría creer que la
        // cronología es el lugar donde se opera, y escondería el resto. La fila
        // ya lleva el enlace a la oportunidad.
        // EXCEPTO para postventa (gerencia, 28-09): el expediente del
        // comercial no se le abre, y tiene que poder ver qué se le cotizó al
        // cliente. El PDF le sale con los números tapados.
        pdfUrl: paquete ? `/api/cotizaciones/${c.id}/pdf` : undefined,
      };
    }),
    ...(cotHistoricas ?? []).map((c): EventoTimeline => ({
      tipo: "cotizacion",
      id: c.id,
      // `fecha` es columna date: se le pone mediodía para que ordenar por
      // instante no la corra al día anterior (lección de lib/fechas.ts).
      fecha: c.fecha ? `${c.fecha}T12:00:00` : new Date(0).toISOString(),
      oportunidadId: null,
      codigo: c.codigo ?? (c.correlativo ? `${c.correlativo}-${String(c.anio ?? "").slice(2)}` : null),
      estadoLabel: `${c.serie === "OPEN" ? "Open Investments" : "Efameinsa"} · del archivo`,
      color: "neutro",
      monto: c.monto_sin_igv,
      montoReservado: Boolean(paquete),
      moneda: "USD",
      // El enlace es a una ruta del servidor, no al bucket: la URL firmada se
      // pide recién al hacer clic (vence en minutos) y así la política de
      // cartera decide en ese momento. Sin pdf_path el documento aún no está
      // subido o solo existe en .doc, y entonces no se ofrece nada.
      pdfUrl: c.pdf_path || c.tiene_pdf ? `/api/cotizaciones-historicas/${c.id}/pdf` : null,
    })),
    ...(ventas ?? []).map((v): EventoTimeline => {
      // "Venta cerrada — USD 9.618" a secas deja al comercial preguntándose de
      // qué cotización salió. Las ventas importadas del Excel traen el Nº de
      // presupuesto en `referencia_historica`, y ese documento suele estar en
      // el archivo de la misma cuenta: se enlaza para poder abrirlo.
      const documento = v.referencia_historica ? documentoPorCodigo.get(v.referencia_historica) : undefined;
      return {
        tipo: "venta",
        id: v.id,
        // `fecha_venta` es columna date: se le pone mediodía por la misma
        // razón que a la cotización histórica de arriba — sin esto,
        // fechaLima() la corre un día atrás (medianoche UTC es la tarde
        // anterior en Lima). Reportado el 26-08: una venta de HOY salía
        // fechada ayer en el historial del cliente.
        fecha: `${v.fecha_venta}T12:00:00`,
        oportunidadId: aDonde(v.oportunidad_id),
        ...delExpediente(v.oportunidad_id),
        monto: v.monto_total,
        moneda: v.moneda,
        anulada: v.anulada_at != null,
        presupuesto: v.referencia_historica,
        pdfUrl: documento?.tienePdf ? `/api/cotizaciones-historicas/${documento.id}/pdf` : null,
      };
    }),
    ...[...leadsDelCliente.values()].map((l): EventoTimeline => {
      const opId = leadOriginal.get(l.id) ?? l.oportunidad_id;
      return {
        tipo: "solicitud",
        id: `solicitud-${l.id}`,
        fecha: l.recibido_at ?? l.created_at,
        oportunidadId: aDonde(opId),
        ...delExpediente(opId),
        mensaje: l.mensaje,
        canal: l.canal,
        codigo: l.codigo,
        quien: l.perfiles ? `${l.perfiles.codigo_comercial ? `${l.perfiles.codigo_comercial} · ` : ""}${l.perfiles.nombre}` : null,
        dejo: [l.nombre_contacto, l.telefono, l.email].filter(Boolean).join(" · ") || null,
        adjuntos: (adjuntosPorLead.get(l.id) ?? []).map((a) => ({ nombre: a.nombre, url: a.url })),
        volvio: !leadOriginal.has(l.id),
        leadId: l.id,
        puedeCorregir: puedeCorregir(l),
        cambios: cambiosPorLead.get(l.id) ?? [],
        // Con qué arranca la búsqueda de «era de otro cliente»: el dominio del
        // correo (si no es de un correo gratuito), el RUC o la razón social.
        sugerenciaFicha: sugerenciaParaBuscar(l),
        fichaActual: l.razon_social,
        cuentaActualId: cuentaId,
      };
    }),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const ventasConDetalle = (ventas ?? []).map((v) => ({
    ...v,
    documentoArchivo: (v.referencia_historica ? documentoPorCodigo.get(v.referencia_historica) : undefined) ?? null,
  })) as unknown as VentaConDetalle[];

  return { eventos, ventasConDetalle, archivados };
}

const CORREOS_GRATUITOS = /@(gmail|hotmail|outlook|yahoo|live|icloud)\./i;

function sugerenciaParaBuscar(l: { email: string | null; num_doc: string | null; razon_social: string | null }): string | null {
  if (l.email && !CORREOS_GRATUITOS.test(l.email)) return l.email.split("@")[1] ?? null;
  if (l.num_doc && l.num_doc.replace(/\D/g, "").length === 11) return l.num_doc;
  return null;
}

/**
 * El historial de cambios de varias solicitudes. En tandas: un `.in` con
 * cientos de ids revienta la URL (trampa conocida del CRM y del nginx local).
 */
async function cargarCambiosDeSolicitudes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, CambioSolicitud[]>> {
  const porLead = new Map<string, CambioSolicitud[]>();
  for (let i = 0; i < ids.length; i += 40) {
    const { data } = await supabase
      .from("lead_solicitud_cambios")
      .select(
        "lead_id, tipo, antes, despues, motivo, hecho_at, autorizo, quien:perfiles!lead_solicitud_cambios_hecho_por_fkey(nombre, codigo_comercial)",
      )
      .in("lead_id", ids.slice(i, i + 40))
      .order("hecho_at", { ascending: false });
    for (const c of (data ?? []) as unknown as {
      lead_id: string; tipo: "texto" | "ficha"; antes: string | null; despues: string | null; motivo: string | null;
      hecho_at: string; autorizo: string | null; quien: { nombre: string; codigo_comercial: string | null } | null;
    }[]) {
      const lista = porLead.get(c.lead_id) ?? [];
      lista.push({
        tipo: c.tipo,
        antes: c.antes,
        despues: c.despues,
        motivo: c.motivo,
        at: c.hecho_at,
        conCodigo: c.autorizo != null,
        quien: c.quien ? `${c.quien.codigo_comercial ? `${c.quien.codigo_comercial} · ` : ""}${c.quien.nombre}` : null,
      });
      porLead.set(c.lead_id, lista);
    }
  }
  return porLead;
}
