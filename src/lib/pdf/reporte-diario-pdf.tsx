import { WHATSAPP_CUENTA_PARA_META } from "@/lib/gestion-whatsapp";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import type { ProyeccionSemana } from "@/lib/potenciales-semana";
import type { IndicadoresDocumento } from "@/lib/indicadores-comerciales";
import { BloqueIndicadoresPdf } from "@/lib/pdf/indicadores-pdf";
import { PanelPostventaPdf, COLOR_LINEA } from "@/lib/pdf/panel-postventa-pdf";
import { LINEAS, type Linea, type PanelPostventa } from "@/lib/panel-postventa";
import { PanoramaPendientesPdf } from "@/lib/pdf/panorama-pendientes-pdf";
import { LoQueFaltaPdf } from "@/lib/pdf/lo-que-falta-pdf";
import type { SeccionQueFalta } from "@/lib/lo-que-falta-por-paso";
import type { PanoramaPendientes } from "@/lib/panorama-pendientes";
import type { ProblemasTecnicos } from "@/lib/problemas-tecnicos-reporte";
import type { RepuestosDelReporte, RepuestoFila } from "@/lib/repuestos-reporte";
import type { GrupoPedidos, Urgente } from "@/lib/resumen-postventa";

// Sin cortar palabras con guion («TUR-ISTICA»): en una tabla se lee mejor la palabra entera.
Font.registerHyphenationCallback((palabra) => [palabra]);

// Reporte diario de gestión del comercial. Reemplaza la agenda que hoy se
// arma a mano en Excel y se exporta a PDF (ejemplo del ing. Carlos:
// "C5 AGENDA 03-08-26 Katerine Tello.pdf").
//
// DECISIONES DE MAQUETACIÓN, y por qué:
//  · El original es una exportación de Excel: columnas estrechas, texto
//    cortado a media palabra y los totales perdidos al final de cada bloque.
//    Aquí el resumen va PRIMERO y en grande — Carlos lo abre para saber en
//    diez segundos si el comercial trabajó, no para leer 24 filas.
//  · El avance hacia la meta es una BARRA, no un velocímetro circular: en
//    papel, y sobre todo impreso en blanco y negro, una barra con su "11/30"
//    al lado se lee de un vistazo y no depende del color.
//  · Cada sección arranca con su total a la derecha del título, como en el
//    formato que ya usan: es el número que copian al correo.
//  · Las notas de gestión se recortan a ~120 caracteres. El reporte es para
//    supervisar la jornada; el detalle completo vive en el CRM.
// Helvetica = fuente base de @react-pdf sin incrustar TTF (equivalente a Arial).

export const GRANATE = "#7E1210";
export const CARBON = "#2C2E35";
export const GRIS = "#6B6B6B";
export const VERDE = "#1E7F4F";
const BORDE = "#D8D4D3";
const FILA_GRIS = "#F4F2F1";

export interface ReporteDiarioProps {
  /** YYYY-MM-DD, para el pie de página. */
  fechaCorta?: string;
  logoBuffer: Buffer;
  /** La proyección de la semana (ing. Carlos, 27-08). Opcional: si un día no
   *  se puede calcular, el reporte sale igual sin esa sección. */
  proyeccion?: ProyeccionSemana;
  fecha: string; // "jueves, 20 de agosto de 2026"
  comercial: { nombre: string; codigo: string | null };
  resumen: {
    meta_seguimientos: number;
    seguimientos_efectivos: number;
    intentos_sin_contacto: number;
    cotizaciones: number;
    cotizaciones_enviadas: number;
    ventas: number;
    monto_vendido_usd: number;
    leads_recibidos: number;
    complementarias: number;
    /** Marcas de WhatsApp de un botón (23-09): su propia barra, sin meta todavía. */
    gestion_whatsapp?: number;
  };
  seguimientos: {
    hora: string | null;
    cliente: string;
    tipo: string;
    nota: string | null;
    resultado: string | null;
    efectivo: boolean;
    /** Postventa (13-10): la línea del expediente, para agrupar la sección 1. */
    linea?: Linea;
  }[];
  /** `estado_texto` lo trae postventa (12-10): «En gerencia», «Observado por gerencia»… */
  cotizaciones: { codigo: string | null; cliente: string; total: number; moneda: string; enviada: boolean; aprobacion: string; estado_texto?: string }[];
  ventas: { cliente: string; monto: number; moneda: string }[];
  /** `estado`: en qué quedó y quién lo atendió (Santos 16-10, Vidawasi). */
  leads: { codigo: string | null; nombre: string; canal: string; hora: string | null; estado?: string | null }[];
  complementarias: { titulo: string; hora: string | null }[];
  agenda: { pendiente_hoy: number; vencidas: number; manana: number };
  /** Reunión 25-08 (ing. Carlos): el reporte debe mostrar QUÉ hay planificado
   *  para el día siguiente, no solo cuántos — «para ver cómo se están
   *  gestionando». */
  planificacion_manana: {
    fecha: string;
    gestiones: { cliente: string; accion: string | null; hora: string | null; etapa: string }[];
    /** `tipo` y `detalle` los trae postventa (21-09): «Despacho», «Puesta en marcha»… y con quién. */
    tareas: { titulo: string; hora: string | null; tipo?: string | null; detalle?: string | null }[];
  };
  /**
   * PENDIENTES DEL ÁREA, POR TIPO (22-09, ítem 6): lo que `pendientesDePostventa`
   * calcula sin fecha de por medio — un despacho sin programar, una atención
   * sin agendar. Solo llega para perfiles de postventa; ausente, no sale la
   * sección.
   */
  pendientesPostventa?: {
    titulo: string;
    filas: { cliente: string; detalle: string | null }[];
  }[];
  /**
   * LO PROPIO, POR RUTA (buzón, Ariana PV3, 10-10): la regularización de los
   * pedidos de equipos y el mantenimiento y los repuestos, en cuadros aparte.
   * Si llega, reemplaza la tabla de la sección 1 (los seguimientos van en el
   * cuadro de su ruta) y no sale lo del área.
   */
  /** Rótulo de la sección de pendientes, sin número; sin él, «PENDIENTES DEL ÁREA». */
  tituloPendientes?: string;
  /**
   * Lo que la persona anotó a mano, un bloque por tipo (0444, 0449). Va en su
   * propio apartado, antes de lo del área (buzón, Rubí 12-10: «que se
   * diferencie cada apartado y que aparezca solo de mi gestión realizada»).
   */
  pendientesAnotados?: { titulo: string; filas: { cliente: string; detalle: string | null }[] }[];
  /** Lo del circuito del área en el día (despachos, visitas a planta…): aparte de su gestión. */
  movimientoDelArea?: { titulo: string; hora: string | null }[];
  rutasPostventa?: {
    titulo: string;
    filas: { hora: string | null; cliente: string; detalle: string | null }[];
  }[];
  /**
   * WhatsApp de campaña, visitas y videollamadas (ing. Carlos, 30-09: «esos
   * dos puntos tienen que estar en su reporte diario»). Opcional: si no se
   * pudo calcular, el reporte sale igual.
   */
  /** La hoja de gráficos de postventa (Santos, 13-10). Si llega, va primero. */
  panelPostventa?: PanelPostventa;
  /** «Lo que falta gestionar» (Santos, 13-10): su hoja, después del panel. */
  panorama?: PanoramaPendientes;
  /** Los pedidos abiertos del área por paso, con detalle (Santos, 13-10): su hoja, después de «Lo que falta gestionar». */
  loQueFalta?: { abiertos: number; historia: number; secciones: SeccionQueFalta[] };
  /** «Problemas técnicos y su estado» (Santos, 16-10): su hoja, antes de los pedidos. */
  problemasTecnicos?: ProblemasTecnicos;
  /** «Solicitudes de repuesto · abiertas y cerradas» (reunión 16-10 17:57). */
  repuestos?: RepuestosDelReporte;
  /** Los pedidos, uno por fila con su siguiente paso, agrupados por a quién le toca (Santos 16-10). */
  pedidosPorResponsable?: GrupoPedidos[];
  /** Lo urgente, en orden, para la primera hoja (Santos 16-10). */
  urgentes?: Urgente[];
  indicadores?: IndicadoresDocumento & {
    /** Las marcas de un botón en los chats: salen de la lista de seguimientos y van aparte. */
    marcas: { hora: string | null; cliente: string; nota: string | null }[];
  };
}


// Márgenes: el ing. Carlos, 24-08, sobre este reporte impreso — el texto salía
// apretado y llegando al borde. 32 pt son 11 mm, por debajo del margen que
// muchas impresoras láser no pueden imprimir (suelen reservar ~13 mm), así que
// la última columna se recortaba en papel aunque en pantalla se viera entera.
// 40 pt ≈ 14 mm entra en cualquier impresora, y el interlineado da aire a las
// filas sin sumar páginas.
export const e = StyleSheet.create({
  pagina: {
    paddingTop: 32,
    paddingBottom: 52,
    paddingHorizontal: 40,
    fontSize: 8.5,
    lineHeight: 1.35,
    color: CARBON,
    fontFamily: "Helvetica",
  },
  cabecera: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  logo: { width: 132 },
  tituloBloque: { alignItems: "flex-end" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GRANATE },
  subtitulo: { fontSize: 9, color: GRIS, marginTop: 2 },
  comercial: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },

  metaCaja: { borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 10, marginBottom: 10 },
  metaFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  metaEtiqueta: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  metaNumero: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  barraFondo: { height: 11, backgroundColor: "#E8E5E4", borderRadius: 3, flexDirection: "row" },
  barraRelleno: { height: 11, borderRadius: 3 },

  tarjetas: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tarjeta: { flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 7 },
  tarjetaEtiqueta: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3 },
  tarjetaValor: { fontSize: 14, lineHeight: 1, height: 16, fontFamily: "Helvetica-Bold", marginTop: 2, marginBottom: 2 },
  tarjetaSub: { fontSize: 6.5, color: GRIS, marginTop: 1 },

  seccion: { marginTop: 10 },
  seccionCabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: GRANATE, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 2 },
  seccionTitulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF", letterSpacing: 0.3 },
  seccionTotal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },

  subtitulo2: { paddingTop: 6, paddingBottom: 2, paddingHorizontal: 5 },
  subtitulo2Texto: { fontSize: 7, fontFamily: "Helvetica-Bold", color: GRANATE, letterSpacing: 0.2 },

  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDE, paddingVertical: 4.5, paddingHorizontal: 5 },
  filaAlterna: { backgroundColor: FILA_GRIS },
  th: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: BORDE },
  thTexto: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  vacio: { fontSize: 8, color: GRIS, fontStyle: "italic", paddingVertical: 7, paddingHorizontal: 5 },

  pie: { position: "absolute", bottom: 26, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: BORDE, paddingTop: 5 },
  pieTexto: { fontSize: 6.5, color: GRIS },
});

const hoyIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export const TIPO: Record<string, string> = {
  llamada: "Llamada", whatsapp: "WhatsApp", email: "Correo", visita: "Visita", showroom: "Visita a planta",
  reunion_online: "Videollamada",
};
const ETAPA: Record<string, string> = {
  asignada: "Recibido", filtrada: "Filtrado", cotizada: "Cotizado",
  seguimiento: "Seguimiento", potencial: "Negociación",
};
const CANAL: Record<string, string> = {
  whatsapp: "WhatsApp", llamada: "Llamada", formulario_web: "Web", facebook: "Facebook",
  instagram: "Instagram", email: "Correo", presencial: "Presencial", referido: "Referido", otro: "Otro",
};
// Cómo llegó el cliente, dicho como lo que es (Vidawasi 16-10: «Llamada» a secas parecía una gestión).
const CANAL_CLIENTE: Record<string, string> = {
  whatsapp: "WhatsApp del cliente", llamada: "El cliente llamó", formulario_web: "Formulario web", email: "Correo del cliente",
  presencial: "Vino a la oficina", referido: "Referido",
};

// ── POSTVENTA, CON BUENAS PRÁCTICAS (Santos 16-10: «¿es la mejor forma de ver
// las cosas?») ──────────────────────────────────────────────────────────────
// Un solo código de color en las hojas de postventa: granate = le toca a
// usted, ámbar = espera a otra área o al cliente, verde = cerrado. La
// antigüedad (días) va en su columna, alineada a la derecha, porque es lo que
// dice qué urge. Los textos que llegan EN MAYÚSCULAS se pasan a oración.
const TONO = {
  accion: { texto: GRANATE, fondo: "#F6E7E6", etiqueta: "Le toca a usted" },
  espera: { texto: "#8A5A00", fondo: "#FBF0DC", etiqueta: "Espera a otra área o al cliente" },
  cerrado: { texto: VERDE, fondo: "#E3F2EA", etiqueta: "Cerrado" },
} as const;
type TonoPv = keyof typeof TONO;

/** «EL CLIENTE LO MANDO ARREGLAR…» → «El cliente lo mando arreglar…». Lo que ya viene en minúsculas se respeta. */
const enOracion = (t: string | null) => {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (!letras || letras !== letras.toUpperCase()) return s;
  const bajo = s.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
};

function Chip({ tono, texto }: { tono: TonoPv; texto: string }) {
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: TONO[tono].fondo, borderRadius: 2, paddingVertical: 1.5, paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 7, color: TONO[tono].texto, fontFamily: "Helvetica-Bold" }}>{texto}</Text>
    </View>
  );
}

function Leyenda() {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginTop: 4, marginBottom: 2 }}>
      {(Object.keys(TONO) as TonoPv[]).map((t) => (
        <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View style={{ width: 7, height: 7, borderRadius: 1, backgroundColor: TONO[t].texto }} />
          <Text style={{ fontSize: 6.5, color: GRIS }}>{TONO[t].etiqueta}</Text>
        </View>
      ))}
    </View>
  );
}

function Encabezados({ columnas }: { columnas: [string, string, ("left" | "right")?][] }) {
  return (
    <View style={e.th}>
      {columnas.map(([t, w, a]) => (
        <Text key={t} style={[e.thTexto, { width: w, textAlign: a ?? "left" }]}>{t}</Text>
      ))}
    </View>
  );
}

const tonoRepuesto = (f: RepuestoFila): TonoPv => (!f.abierto ? "cerrado" : f.estado.startsWith("Cotizado") ? "espera" : "accion");

/** HOJA 1: lo que gerencia pregunta cada día, con su respuesta, y lo urgente en orden. */
function ResumenPostventaPdf({
  problemas,
  repuestos,
  cotizaciones,
  porSalir,
  pedidos,
  urgentes,
}: {
  problemas: ProblemasTecnicos;
  repuestos: RepuestosDelReporte;
  cotizaciones: ReporteDiarioProps["cotizaciones"];
  porSalir: number | null;
  pedidos: GrupoPedidos[];
  urgentes: Urgente[];
}) {
  const urgentesPt = problemas.filas.filter((p) => p.urgente).length;
  const sinGestion = repuestos.abiertas.filter((r) => r.estado.startsWith("Sin gestión")).length;
  const totalPedidos = pedidos.reduce((t, g) => t + g.pedidos.length, 0);
  const suyos = pedidos.find((g) => g.esPostventa)?.pedidos.length ?? 0;
  const enviadas = cotizaciones.filter((c) => c.enviada).length;
  const tarjetas: { titulo: string; valor: number; lineas: string[]; color: string }[] = [
    {
      titulo: "¿Qué problemas técnicos hay por resolver?",
      valor: problemas.abiertos,
      lineas: [`${urgentesPt} urgente${urgentesPt === 1 ? "" : "s"}`, `${problemas.cerradosHoy} resuelto${problemas.cerradosHoy === 1 ? "" : "s"} este día`],
      color: urgentesPt ? GRANATE : CARBON,
    },
    {
      titulo: "¿Qué repuestos se pidieron y cómo van?",
      valor: repuestos.abiertas.length,
      lineas: [`${sinGestion} sin gestión todavía · ${repuestos.nuevasHoy} llegaron este día`, `${repuestos.cerradas.length} cerrada${repuestos.cerradas.length === 1 ? "" : "s"} este día`],
      color: sinGestion ? GRANATE : CARBON,
    },
    {
      titulo: "¿Qué cotizaciones hizo?",
      valor: cotizaciones.length,
      lineas: [`${enviadas} enviada${enviadas === 1 ? "" : "s"} al cliente`, porSalir == null ? "" : `${porSalir} armada${porSalir === 1 ? "" : "s"} sin enviar todavía`].filter(Boolean),
      color: CARBON,
    },
    {
      titulo: "¿Cómo van sus pedidos?",
      valor: totalPedidos,
      lineas: [`${suyos} le toca${suyos === 1 ? "" : "n"} a usted ahora`, `${totalPedidos - suyos} esperan a otra área o al cliente`],
      color: suyos ? GRANATE : CARBON,
    },
  ];
  return (
    <View>
      <Text style={{ fontSize: 7.5, color: GRIS, marginBottom: 8 }}>
        Las cuatro preguntas de cada día, con su respuesta. Lo urgente va debajo, en el orden en que conviene atenderlo; el detalle está en las hojas siguientes.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        {tarjetas.map((t) => (
          <View key={t.titulo} style={{ width: "48.5%", borderWidth: 1, borderColor: BORDE, borderLeftWidth: 3, borderLeftColor: t.color, borderRadius: 4, padding: 9 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: CARBON }}>{t.titulo}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4 }}>
              <Text style={{ fontSize: 24, lineHeight: 1, height: 26, fontFamily: "Helvetica-Bold", color: t.color, marginRight: 8 }}>{t.valor}</Text>
              <View style={{ marginBottom: 2 }}>
                {t.lineas.map((l) => (
                  <Text key={l} style={{ fontSize: 7.5, color: GRIS }}>{l}</Text>
                ))}
              </View>
            </View>
          </View>
        ))}
      </View>
      <Seccion titulo="LO URGENTE, EN ORDEN" total={urgentes.length}>
        {urgentes.length === 0 ? (
          <Text style={e.vacio}>Nada urgente: no hay problemas técnicos urgentes, repuestos sin gestión, seguimientos vencidos ni pedidos que le toquen.</Text>
        ) : (
          <>
            <Encabezados columnas={[["#", "5%"], ["Qué es", "18%"], ["Cliente", "35%"], ["Qué hacer", "33%"], ["Días", "9%", "right"]]} />
            {urgentes.map((u, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "5%", color: GRIS }}>{i + 1}</Text>
                <Text style={{ width: "18%", fontFamily: "Helvetica-Bold", color: GRANATE }}>{u.tipo}</Text>
                <Text style={{ width: "35%", paddingRight: 6 }}>{corta(u.cliente, 48)}</Text>
                <Text style={{ width: "33%", paddingRight: 6 }}>{corta(enOracion(u.que), 60)}</Text>
                <Text style={{ width: "9%", textAlign: "right", fontFamily: "Helvetica-Bold", color: u.dias != null && u.dias > 7 ? GRANATE : CARBON }}>
                  {u.dias == null ? "—" : `${u.dias} d`}
                </Text>
              </View>
            ))}
          </>
        )}
      </Seccion>
      <Leyenda />
    </View>
  );
}

/** HOJA: problemas técnicos y solicitudes de repuesto, juntos (cada uno ocupaba una hoja casi vacía). */
function CasosYSolicitudesPdf({ problemas, repuestos }: { problemas?: ProblemasTecnicos; repuestos?: RepuestosDelReporte }) {
  return (
    <View>
      <Text style={{ fontSize: 7.5, color: GRIS, marginBottom: 2 }}>
        Primero lo abierto, de lo urgente y lo más antiguo a lo más nuevo; al final, lo cerrado este día con su motivo. «Días» = desde que llegó. Estado al generar el reporte.
      </Text>
      <Leyenda />
      {problemas && (
        <Seccion titulo={`PROBLEMAS TÉCNICOS · ${problemas.abiertos} ${problemas.abiertos === 1 ? "ABIERTO" : "ABIERTOS"} · ${problemas.cerradosHoy} ${problemas.cerradosHoy === 1 ? "CERRADO" : "CERRADOS"} HOY`} total={problemas.filas.length}>
          {problemas.porEtapa.length > 0 && (
            <Text style={{ fontSize: 7, color: GRIS, paddingHorizontal: 5, paddingTop: 4 }}>
              Abiertos por paso: {problemas.porEtapa.map((x) => `${x.etapa} ${x.total}`).join(" · ")}
            </Text>
          )}
          {problemas.filas.length === 0 ? (
            <Text style={e.vacio}>No lleva problemas técnicos abiertos ni cerró ninguno este día.</Text>
          ) : (
            <>
              <Encabezados columnas={[["Cliente y equipo", "36%"], ["Paso", "13%"], ["Qué falta", "29%"], ["Le toca", "14%"], ["Días", "8%", "right"]]} />
              {problemas.filas.map((f, i) => {
                const tono: TonoPv = f.cerradoHoy ? "cerrado" : f.leToca === "Postventa" ? "accion" : "espera";
                return (
                  <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                    <View style={{ width: "36%", paddingRight: 6 }}>
                      <Text>{corta(f.cliente, 44)}</Text>
                      {f.tipo || f.equipo ? <Text style={{ fontSize: 7, color: GRIS }}>{corta([f.tipo, f.equipo].filter(Boolean).join(" · "), 60)}</Text> : null}
                    </View>
                    <View style={{ width: "13%" }}>
                      <Chip tono={tono} texto={f.etapa} />
                    </View>
                    <View style={{ width: "29%", paddingRight: 6 }}>
                      <Text style={{ color: tono === "accion" && f.urgente ? GRANATE : CARBON, fontFamily: f.urgente ? "Helvetica-Bold" : "Helvetica" }}>{f.falta}</Text>
                      {f.motivo ? <Text style={{ fontSize: 7, color: GRIS }}>{corta(enOracion(f.motivo), 140)}</Text> : null}
                    </View>
                    <Text style={{ width: "14%", color: GRIS }}>{f.leToca}</Text>
                    <Text style={{ width: "8%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>{f.dias}</Text>
                  </View>
                );
              })}
            </>
          )}
        </Seccion>
      )}
      {repuestos && (
        <Seccion
          titulo={`SOLICITUDES DE REPUESTO · ${repuestos.abiertas.length} ${repuestos.abiertas.length === 1 ? "ABIERTA" : "ABIERTAS"} · ${repuestos.cerradas.length} ${repuestos.cerradas.length === 1 ? "CERRADA" : "CERRADAS"} HOY`}
          total={repuestos.abiertas.length + repuestos.cerradas.length}
        >
          {repuestos.abiertas.length + repuestos.cerradas.length === 0 ? (
            <Text style={e.vacio}>No tiene solicitudes de repuesto abiertas ni cerró ninguna este día.</Text>
          ) : (
            <>
              <Encabezados columnas={[["Llegó", "9%"], ["Cliente y qué pidió", "55%"], ["Estado", "28%"], ["Días", "8%", "right"]]} />
              {[...[...repuestos.abiertas].sort((a, b) => b.dias - a.dias), ...repuestos.cerradas].map((f, i) => (
                <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "9%", fontFamily: f.nuevo ? "Helvetica-Bold" : "Helvetica" }}>{f.recibido}</Text>
                  <View style={{ width: "55%", paddingRight: 6 }}>
                    <Text>{corta(f.cliente, 60)}</Text>
                    {f.pedido ? <Text style={{ fontSize: 7, color: GRIS }}>{corta(enOracion(f.pedido), 120)}</Text> : null}
                  </View>
                  <View style={{ width: "28%", paddingRight: 4 }}>
                    <Chip tono={tonoRepuesto(f)} texto={f.estado} />
                    {f.motivo ? <Text style={{ fontSize: 7, color: GRIS, marginTop: 1 }}>{corta(enOracion(f.motivo), 110)}</Text> : null}
                  </View>
                  <Text style={{ width: "8%", textAlign: "right", fontFamily: "Helvetica-Bold", color: f.abierto && f.dias > 7 ? GRANATE : CARBON }}>{f.dias}</Text>
                </View>
              ))}
            </>
          )}
        </Seccion>
      )}
    </View>
  );
}

/** HOJA: un pedido por fila, con su siguiente paso, agrupados por a quién le toca. */
function PedidosPorResponsablePdf({ grupos }: { grupos: GrupoPedidos[] }) {
  const total = grupos.reduce((t, g) => t + g.pedidos.length, 0);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 4 }}>
        <Text style={{ fontSize: 22, lineHeight: 1, height: 24, fontFamily: "Helvetica-Bold", color: GRANATE, marginRight: 6 }}>{total}</Text>
        <Text style={{ fontSize: 9, color: CARBON, marginBottom: 3 }}>pedidos abiertos en los que usted trabajó</Text>
      </View>
      <Text style={{ fontSize: 7.5, color: GRIS, marginBottom: 2 }}>
        Uno por fila, con el paso que sigue y a quién le toca; primero lo que le toca a usted. Son los pedidos en los que firmó algún paso o gestionó al cliente en los últimos 90 días. La lista de toda el área, paso por paso, está en la agenda y en Control.
      </Text>
      <Leyenda />
      {total === 0 && <Text style={e.vacio}>No tiene pedidos abiertos.</Text>}
      {grupos.map((g) => (
        <Seccion key={g.responsable} titulo={`LE TOCA A ${g.responsable.toUpperCase()}`} total={g.pedidos.length}>
          <Encabezados columnas={[["#", "5%"], ["Cliente y equipo", "45%"], ["Siguiente paso", "50%"]]} />
          {g.pedidos.map((p, i) => (
            <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
              <Text style={{ width: "5%", color: GRIS }}>{i + 1}</Text>
              <View style={{ width: "45%", paddingRight: 6 }}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{corta(p.cliente, 50)}</Text>
                <Text style={{ fontSize: 7, color: GRIS }}>{corta(p.equipo, 70)}</Text>
              </View>
              <View style={{ width: "50%" }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
                  <Chip tono={g.esPostventa ? "accion" : "espera"} texto={p.paso} />
                  {p.avisos.map((a) => (
                    <Text key={a} style={{ fontSize: 6.5, color: GRANATE, borderWidth: 0.5, borderColor: GRANATE, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 }}>{a}</Text>
                  ))}
                </View>
                {p.detalle ? <Text style={{ fontSize: 7, color: GRIS, marginTop: 1 }}>{corta(p.detalle, 150)}</Text> : null}
              </View>
            </View>
          ))}
        </Seccion>
      ))}
    </View>
  );
}

// Los saltos de línea se aplanan (buzón, Gabriela 12-10): una nota que es un
// correo pegado entero, con decenas de renglones en blanco, hacía una fila
// altísima y react-pdf reventaba («unsupported number») al caer en el corte de
// página. En una celda de tabla se lee mejor de corrido.
export const corta = (s: string | null, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return !t ? "—" : t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
export const dinero = (m: number, mon: string) => `${mon === "PEN" ? "S/" : "US$"} ${Math.round(m).toLocaleString("es-PE")}`;

/** Un apartado de pendientes en bloques con subtítulo (los del área, los propios, los anotados). */
function BloquesPendientes({
  titulo,
  bloques,
  vacio,
}: {
  titulo: string;
  bloques: { titulo: string; filas: { cliente: string; detalle: string | null }[] }[];
  vacio: string;
}) {
  // La cabecera va DENTRO del primer bloque (que no se parte): así no
  // queda sola al pie de una hoja con su contenido en la siguiente.
  const cabecera = (
    <View style={e.seccionCabecera}>
      <Text style={e.seccionTitulo}>{titulo}</Text>
      <Text style={e.seccionTotal}>TOTAL: {bloques.reduce((t, b) => t + b.filas.length, 0)}</Text>
    </View>
  );
  const conFilas = bloques.filter((b) => b.filas.length > 0);
  return (
    <View style={e.seccion}>
      {conFilas.length === 0 ? (
        <View wrap={false}>
          {cabecera}
          <Text style={e.vacio}>{vacio}</Text>
        </View>
      ) : (
        conFilas.map((b, k) => (
          <View key={b.titulo} wrap={false}>
            {k === 0 && cabecera}
            <View style={e.subtitulo2}>
              <Text style={e.subtitulo2Texto}>{b.titulo.toUpperCase()} ({b.filas.length})</Text>
            </View>
            {b.filas.slice(0, 10).map((f, i) => (
              <View key={i} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "38%", paddingRight: 6 }}>{corta(f.cliente, 42)}</Text>
                <Text style={{ width: "62%", color: GRIS }}>{f.detalle ? corta(f.detalle, 70) : "—"}</Text>
              </View>
            ))}
            {b.filas.length > 10 && <Text style={[e.vacio, { paddingVertical: 3 }]}>y {b.filas.length - 10} más</Text>}
          </View>
        ))
      )}
    </View>
  );
}

export function Seccion({ titulo, total, children }: { titulo: string; total: string | number; children: React.ReactNode }) {
  // La sección SÍ puede partirse entre páginas. Con wrap={false} el día de 19
  // seguimientos de Katerine (25-08) superaba el alto de la hoja y react-pdf
  // recortaba las filas por dentro — se leía media nota y nada más. El corte
  // se prohíbe POR FILA (cada fila lleva wrap={false}), y minPresenceAhead
  // evita que la cabecera granate quede sola al pie de la página.
  return (
    <View style={e.seccion}>
      <View style={e.seccionCabecera} minPresenceAhead={40}>
        <Text style={e.seccionTitulo}>{titulo}</Text>
        <Text style={e.seccionTotal}>TOTAL: {total}</Text>
      </View>
      {children}
    </View>
  );
}

export function Tarjeta({ etiqueta, valor, sub }: { etiqueta: string; valor: string; sub?: string }) {
  return (
    <View style={e.tarjeta}>
      <Text style={e.tarjetaEtiqueta}>{etiqueta}</Text>
      <Text style={e.tarjetaValor}>{valor}</Text>
      {sub ? <Text style={e.tarjetaSub}>{sub}</Text> : null}
    </View>
  );
}

export function ReporteDiarioPdf({
  logoBuffer, fecha, fechaCorta, comercial, resumen, seguimientos, cotizaciones, ventas, leads, complementarias, agenda, planificacion_manana, proyeccion,
  pendientesPostventa, tituloPendientes, pendientesAnotados, movimientoDelArea, rutasPostventa, indicadores, panelPostventa, panorama, loQueFalta, problemasTecnicos, repuestos, pedidosPorResponsable, urgentes,
}: ReporteDiarioProps) {
  const pct = resumen.meta_seguimientos > 0
    ? Math.min((resumen.seguimientos_efectivos / resumen.meta_seguimientos) * 100, 100)
    : 0;
  const cumple = resumen.seguimientos_efectivos >= resumen.meta_seguimientos;
  const cabecera = (titulo: string) => (
    <View style={e.cabecera}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
      <Image style={e.logo} src={logoBuffer} />
      <View style={e.tituloBloque}>
        <Text style={e.titulo}>{titulo}</Text>
        <Text style={e.subtitulo}>{fecha}</Text>
        <Text style={e.comercial}>
          {comercial.codigo ? `${comercial.codigo} · ` : ""}
          {comercial.nombre}
        </Text>
      </View>
    </View>
  );
  // Pie fijo sin «Página X de Y»: con el número dinámico (`render`)
  // react-pdf lo desacomodaba en reportes de varias páginas (el del
  // viernes 09-10 de Gabriela: sin pie en 1-4 y arriba en 5-6).
  const pie = (
    <View style={e.pie} fixed>
      <Text style={e.pieTexto}>Generado automáticamente por el CRM de Efameinsa</Text>
      <Text style={e.pieTexto}>
        {comercial.codigo ? `${comercial.codigo} · ` : ""}
        {fechaCorta ? `${fechaCorta.slice(8, 10)}/${fechaCorta.slice(5, 7)}/${fechaCorta.slice(0, 4)}` : fecha}
      </Text>
    </View>
  );
  const filaSeguimiento = (s: ReporteDiarioProps["seguimientos"][number], i: number) => (
    <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
      <Text style={{ width: "7%" }}>{s.hora ?? "—"}</Text>
      <Text style={{ width: "27%", paddingRight: 6 }}>{corta(s.cliente, 70)}</Text>
      <Text style={{ width: "10%" }}>{TIPO[s.tipo] ?? s.tipo}</Text>
      <Text style={{ width: "17%", color: s.efectivo ? CARBON : GRIS }}>
        {s.resultado ?? (s.efectivo ? "Contactado" : "No contestó")}
      </Text>
      {/* 400 y no 120: el reporte se usa para LEER la gestión, no
          solo para contarla («no se puede ver lo que sigue»,
          25-08). Ahora que la fila crece y la sección salta de
          página, la nota entra completa en la práctica. */}
      <Text style={{ width: "39%", color: GRIS }}>{corta(s.nota, 400)}</Text>
    </View>
  );
  const porLinea = seguimientos.some((s) => s.linea);

  return (
    <Document title={`Reporte diario ${comercial.codigo ?? ""} ${fecha}`} author="CRM Efameinsa">
      {/* POSTVENTA: la hoja de gráficos primero, para ver de una vista cómo va
          cada gestión (Santos, 13-10); el detalle sigue en la hoja siguiente. */}
      {/* POSTVENTA, de lo general al detalle (Santos 16-10, «con buenas
          prácticas»): primero lo que gerencia pregunta y lo urgente; después
          el panel, los casos y repuestos, lo que falta gestionar y los
          pedidos; al final, el detalle de cada gestión. */}
      {problemasTecnicos && repuestos && (
        <Page size="A4" style={e.pagina}>
          {cabecera("RESUMEN DEL DÍA · LO QUE GERENCIA PREGUNTA")}
          <ResumenPostventaPdf
            problemas={problemasTecnicos}
            repuestos={repuestos}
            cotizaciones={cotizaciones}
            porSalir={panorama?.presupuestos.length ?? null}
            pedidos={pedidosPorResponsable ?? []}
            urgentes={urgentes ?? []}
          />
          {pie}
        </Page>
      )}
      {panelPostventa && (
        <Page size="A4" style={e.pagina}>
          {cabecera("PANEL DEL DÍA · SU GESTIÓN")}
          <PanelPostventaPdf panel={panelPostventa} resumen={resumen} />
          {pie}
        </Page>
      )}
      {(problemasTecnicos || repuestos) && (
        <Page size="A4" style={e.pagina}>
          {cabecera("PROBLEMAS TÉCNICOS Y REPUESTOS")}
          <CasosYSolicitudesPdf problemas={problemasTecnicos} repuestos={repuestos} />
          {pie}
        </Page>
      )}
      {panorama && (
        <Page size="A4" style={e.pagina}>
          {cabecera(fechaCorta && fechaCorta < hoyIso() ? "LO QUE FALTABA GESTIONAR AL CIERRE" : "LO QUE FALTA GESTIONAR")}
          <PanoramaPendientesPdf p={panorama} esHoy={!fechaCorta || fechaCorta >= hoyIso()} />
          {pie}
        </Page>
      )}
      {pedidosPorResponsable ? (
        <Page size="A4" style={e.pagina}>
          {cabecera("SUS PEDIDOS ABIERTOS · SIGUIENTE PASO")}
          <PedidosPorResponsablePdf grupos={pedidosPorResponsable} />
          {pie}
        </Page>
      ) : loQueFalta ? (
        <Page size="A4" style={e.pagina}>
          {cabecera("SUS PEDIDOS ABIERTOS · LO QUE FALTA, PASO POR PASO")}
          <LoQueFaltaPdf abiertos={loQueFalta.abiertos} historia={loQueFalta.historia} secciones={loQueFalta.secciones} />
          {pie}
        </Page>
      ) : null}
      <Page size="A4" style={e.pagina}>
        {cabecera(panelPostventa ? "REPORTE DIARIO · DETALLE" : "REPORTE DIARIO DE GESTIÓN")}

        {/* Avance hacia la meta: lo primero que se ve. */}
        <View style={e.metaCaja}>
          <View style={e.metaFila}>
            <Text style={e.metaEtiqueta}>
              {WHATSAPP_CUENTA_PARA_META ? "Seguimientos efectivos del día" : "Gestiones efectivas del día (sin WhatsApp de campaña)"}
            </Text>
            <Text style={[e.metaNumero, { color: cumple ? VERDE : GRANATE }]}>
              {resumen.seguimientos_efectivos} / {resumen.meta_seguimientos}
            </Text>
          </View>
          <View style={e.barraFondo}>
            <View style={[e.barraRelleno, { width: `${pct}%`, backgroundColor: cumple ? VERDE : GRANATE }]} />
          </View>
          {/* marginTop 10, no 4: la barra pintaba encima de esta leyenda
              (reportado 25-08 con el reporte de Katerine). */}
          <Text style={{ fontSize: 7, color: GRIS, marginTop: 10 }}>
            {cumple
              ? "Meta diaria cumplida."
              : `Faltan ${resumen.meta_seguimientos - resumen.seguimientos_efectivos} para la meta.`}
            {resumen.intentos_sin_contacto > 0
              ? `  Además, ${resumen.intentos_sin_contacto} intento${resumen.intentos_sin_contacto === 1 ? "" : "s"} sin contacto (no contestó).`
              : ""}
            {resumen.complementarias > 0
              ? `  ${resumen.complementarias} actividad${resumen.complementarias === 1 ? "" : "es"} complementaria${resumen.complementarias === 1 ? "" : "s"} registrada${resumen.complementarias === 1 ? "" : "s"}.`
              : ""}
          </Text>
          {/* LA OTRA BARRA (Santos, 23-09): mientras las marcas sumaban,
              se dibujaban aparte. Desde el 30-09 no suman y su medida es el
              indicador de WhatsApp de campaña, más abajo. */}
          {WHATSAPP_CUENTA_PARA_META && (resumen.gestion_whatsapp ?? 0) > 0 && (
            <Text style={{ fontSize: 7, color: GRIS, marginTop: 4 }}>
              {`Incluye ${resumen.gestion_whatsapp} marca${resumen.gestion_whatsapp === 1 ? "" : "s"} de WhatsApp (botones en los chats).`}
            </Text>
          )}
        </View>

        {/* INDICADORES (30-09): cada uno por su lado. */}
        {indicadores && <BloqueIndicadoresPdf ind={indicadores} rotuloWhatsapp="WhatsApp de campaña · hoy" rotuloPeriodo="semana" anterior="la semana pasada" />}

        <View style={e.tarjetas}>
          <Tarjeta etiqueta="Leads recibidos" valor={String(resumen.leads_recibidos)} sub="derivados por Central" />
          <Tarjeta
            etiqueta="Presupuestos"
            valor={String(resumen.cotizaciones)}
            sub={`${resumen.cotizaciones_enviadas} enviado${resumen.cotizaciones_enviadas === 1 ? "" : "s"}`}
          />
          <Tarjeta
            etiqueta="Ventas cerradas"
            valor={String(resumen.ventas)}
            sub={resumen.ventas > 0 ? `US$ ${Math.round(resumen.monto_vendido_usd).toLocaleString("es-PE")}` : "—"}
          />
          <Tarjeta
            etiqueta="Agenda"
            valor={String(agenda.pendiente_hoy)}
            sub={`pendientes hoy · ${agenda.vencidas} vencidas · ${agenda.manana} mañana`}
          />
        </View>

        {rutasPostventa ? (
          <Seccion titulo="1. GESTIONES DEL DÍA, POR RUTA" total={rutasPostventa.reduce((t, b) => t + b.filas.length, 0)}>
            {rutasPostventa.map((b) => (
              <View key={b.titulo}>
                <View style={e.subtitulo2}>
                  <Text style={e.subtitulo2Texto}>{b.titulo.toUpperCase()} ({b.filas.length})</Text>
                </View>
                <View style={e.th}>
                  <Text style={[e.thTexto, { width: "7%" }]}>Hora</Text>
                  <Text style={[e.thTexto, { width: "30%" }]}>Cliente</Text>
                  <Text style={[e.thTexto, { width: "63%" }]}>Gestión</Text>
                </View>
                {b.filas.length === 0 ? (
                  <Text style={e.vacio}>Sin gestiones de esta ruta este día.</Text>
                ) : (
                  b.filas.map((f, i) => (
                    <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                      <Text style={{ width: "7%" }}>{f.hora ?? "—"}</Text>
                      <Text style={{ width: "30%", paddingRight: 6 }}>{corta(f.cliente, 70)}</Text>
                      <Text style={{ width: "63%", color: GRIS }}>{corta(f.detalle, 400)}</Text>
                    </View>
                  ))
                )}
              </View>
            ))}
          </Seccion>
        ) : (
        <Seccion titulo="1. SEGUIMIENTOS REALIZADOS" total={seguimientos.length}>
          <View style={e.th}>
            <Text style={[e.thTexto, { width: "7%" }]}>Hora</Text>
            <Text style={[e.thTexto, { width: "27%" }]}>Cliente</Text>
            <Text style={[e.thTexto, { width: "10%" }]}>Vía</Text>
            <Text style={[e.thTexto, { width: "17%" }]}>Resultado</Text>
            <Text style={[e.thTexto, { width: "39%" }]}>Detalle</Text>
          </View>
          {seguimientos.length === 0 ? (
            <Text style={e.vacio}>Sin seguimientos registrados este día.</Text>
          ) : porLinea ? (
            // Postventa: un bloque por línea (repuestos, mantenimiento…), con su color.
            LINEAS.map((l) => {
              const filas = seguimientos.filter((s) => (s.linea ?? "otros") === l.clave);
              if (filas.length === 0) return null;
              return (
                <View key={l.clave}>
                  <View style={[e.subtitulo2, { flexDirection: "row", alignItems: "center" }]} minPresenceAhead={30}>
                    <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: COLOR_LINEA[l.clave], marginRight: 4 }} />
                    <Text style={e.subtitulo2Texto}>{l.titulo.toUpperCase()} ({filas.length})</Text>
                  </View>
                  {filas.map(filaSeguimiento)}
                </View>
              );
            })
          ) : (
            seguimientos.map(filaSeguimiento)
          )}
        </Seccion>
        )}

        {/* Las marcas de WhatsApp, aparte de los seguimientos (30-09): se
            ven, pero no inflan el total de la sección 1. */}
        {indicadores && indicadores.marcas.length > 0 && (
          <Seccion titulo="1b. WHATSAPP DE CAMPAÑA (APARTE, NO SUMA A LA META)" total={indicadores.marcas.length}>
            {indicadores.marcas.map((m, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "7%" }}>{m.hora ?? "—"}</Text>
                <Text style={{ width: "37%", paddingRight: 6 }}>{corta(m.cliente, 70)}</Text>
                <Text style={{ width: "56%", color: GRIS }}>{corta(m.nota, 200)}</Text>
              </View>
            ))}
          </Seccion>
        )}

        <Seccion
          titulo="2. PRESUPUESTOS DEL DÍA"
          total={`${cotizaciones.length}  (enviados: ${resumen.cotizaciones_enviadas})`}
        >
          <View style={e.th}>
            <Text style={[e.thTexto, { width: "14%" }]}>N°</Text>
            <Text style={[e.thTexto, { width: "46%" }]}>Cliente</Text>
            <Text style={[e.thTexto, { width: "20%" }]}>Estado</Text>
            <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Monto</Text>
          </View>
          {cotizaciones.length === 0 ? (
            <Text style={e.vacio}>Sin presupuestos generados este día.</Text>
          ) : (
            cotizaciones.map((c, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "14%" }}>{c.codigo ?? "Borrador"}</Text>
                {/* paddingRight: sin él, un nombre largo llega hasta el borde
                    de su celda y queda pegado a "Estado" — se leía
                    "…LAVANDERIAS CLEANEnviado". */}
                <Text style={{ width: "46%", paddingRight: 6 }}>{corta(c.cliente, 52)}</Text>
                <Text style={{ width: "20%", color: GRIS }}>
                  {c.estado_texto ?? (c.aprobacion === "pendiente_gerencia" ? "Por aprobar" : c.enviada ? "Enviado" : "Borrador")}
                </Text>
                <Text style={{ width: "20%", textAlign: "right" }}>{dinero(c.total, c.moneda)}</Text>
              </View>
            ))
          )}
        </Seccion>

        <Seccion titulo="3. VENTAS CERRADAS" total={ventas.length}>
          {ventas.length === 0 ? (
            <Text style={e.vacio}>Sin ventas cerradas este día.</Text>
          ) : (
            ventas.map((v, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "75%", paddingRight: 6 }}>{corta(v.cliente, 78)}</Text>
                <Text style={{ width: "25%", textAlign: "right", fontFamily: "Helvetica-Bold", color: VERDE }}>
                  {dinero(v.monto, v.moneda)}
                </Text>
              </View>
            ))
          )}
        </Seccion>

        <Seccion titulo="4. LEADS RECIBIDOS DE CENTRAL" total={leads.length}>
          {leads.length === 0 ? (
            <Text style={e.vacio}>Central no derivó contactos este día.</Text>
          ) : (
            <>
              {/* Vidawasi, 16-10: «Llamada» se leía como una gestión de quien recibe el lead. */}
              <Text style={{ fontSize: 7, color: GRIS, paddingHorizontal: 5, paddingVertical: 3 }}>
                «Entró por» es cómo se comunicó el cliente con Central, no una gestión suya: sus gestiones están en la sección 1.
              </Text>
              <View style={[e.fila, { borderBottomColor: GRIS }]}>
                {["Derivado", "Código", "Cliente", "Entró por", "En qué quedó"].map((t, k) => (
                  <Text key={t} style={{ width: ["10%", "13%", "35%", "16%", "26%"][k], fontSize: 7, fontFamily: "Helvetica-Bold", color: GRIS }}>{t}</Text>
                ))}
              </View>
              {leads.map((l, i) => (
                <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "10%" }}>{l.hora ?? "—"}</Text>
                  <Text style={{ width: "13%", color: GRIS }}>{l.codigo ?? "—"}</Text>
                  <Text style={{ width: "35%", paddingRight: 6 }}>{corta(l.nombre, 40)}</Text>
                  <Text style={{ width: "16%", color: GRIS }}>{CANAL_CLIENTE[l.canal] ?? CANAL[l.canal] ?? l.canal}</Text>
                  <Text style={{ width: "26%", color: l.estado?.startsWith("Lo atendió") ? GRANATE : CARBON }}>{l.estado ?? "—"}</Text>
                </View>
              ))}
            </>
          )}
        </Seccion>

        <Seccion titulo="5. ACTIVIDADES COMPLEMENTARIAS" total={complementarias.length}>
          {complementarias.length === 0 ? (
            <Text style={e.vacio}>
              Sin actividades complementarias registradas (capacitaciones, visitas de campo, reuniones).
            </Text>
          ) : (
            complementarias.map((a, i) => (
              <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "12%" }}>{a.hora ?? "—"}</Text>
                <Text style={{ width: "88%" }}>{corta(a.titulo, 110)}</Text>
              </View>
            ))
          )}
        </Seccion>

        {/* Los apartados «5b, 5c…» llevan su letra en el orden en que salen: sin saltos. */}
        {(() => {
          const letras = "bcdef";
          let n = 0;
          const apartados: React.ReactNode[] = [];
          if (pendientesAnotados && pendientesAnotados.length > 0)
            apartados.push(
              <BloquesPendientes
                key="anotados"
                titulo={`5${letras[n++]}. SUS PENDIENTES ANOTADOS, POR TIPO`}
                bloques={pendientesAnotados}
                vacio=""
              />,
            );
          if (movimientoDelArea && movimientoDelArea.length > 0)
            apartados.push(
              <Seccion
                key="area"
                titulo={`5${letras[n++]}. MOVIMIENTO DEL ÁREA HOY (PARA CONOCIMIENTO, NO ES GESTIÓN SUYA)`}
                total={movimientoDelArea.length}
              >
                {movimientoDelArea.map((a, i) => (
                  <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                    <Text style={{ width: "12%" }}>{a.hora ?? "—"}</Text>
                    <Text style={{ width: "88%", color: GRIS }}>{corta(a.titulo, 110)}</Text>
                  </View>
                ))}
              </Seccion>,
            );
          if (pendientesPostventa)
            apartados.push(
              <BloquesPendientes
                key="pendientes"
                titulo={`5${letras[n++]}. ${tituloPendientes ?? "PENDIENTES DEL ÁREA"}`}
                bloques={pendientesPostventa}
                vacio="Sin pendientes por tipo: al día en despachos, videollamadas, puestas en marcha, atenciones y preventivos."
              />,
            );
          return apartados;
        })()}

        <Seccion
          titulo="6. PLANIFICACIÓN DEL DÍA SIGUIENTE"
          total={planificacion_manana.gestiones.length + planificacion_manana.tareas.length}
        >
          {planificacion_manana.gestiones.length + planificacion_manana.tareas.length === 0 ? (
            <Text style={e.vacio}>Sin gestiones programadas para el día siguiente.</Text>
          ) : (
            <>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "8%" }]}>Hora</Text>
                <Text style={[e.thTexto, { width: "42%" }]}>Cliente / tarea</Text>
                <Text style={[e.thTexto, { width: "14%" }]}>Etapa</Text>
                <Text style={[e.thTexto, { width: "36%" }]}>Qué se planificó</Text>
              </View>
              {planificacion_manana.gestiones.map((g, i) => (
                <View key={`g${i}`} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "8%" }}>{g.hora ?? "—"}</Text>
                  <Text style={{ width: "42%", paddingRight: 6 }}>{corta(g.cliente, 48)}</Text>
                  <Text style={{ width: "14%", color: GRIS }}>{ETAPA[g.etapa] ?? g.etapa}</Text>
                  <Text style={{ width: "36%", color: GRIS }}>{g.accion ? corta(g.accion, 60) : "Seguimiento programado"}</Text>
                </View>
              ))}
              {planificacion_manana.tareas.map((t, i) => (
                <View key={`t${i}`} wrap={false} style={[e.fila, ...((planificacion_manana.gestiones.length + i) % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "8%" }}>{t.hora ?? "—"}</Text>
                  <Text style={{ width: "42%", paddingRight: 6 }}>{corta(t.titulo, 48)}</Text>
                  <Text style={{ width: "14%", color: GRIS }}>{t.tipo ?? "Tarea"}</Text>
                  <Text style={{ width: "36%", color: GRIS }}>{t.detalle ? corta(t.detalle, 60) : "Actividad propia de agenda"}</Text>
                </View>
              ))}
            </>
          )}
        </Seccion>

        {/* Pedido del ing. Carlos, 27-08: «en su reporte diario se debería
            mostrar acá abajo un resumen… el lunes aparece el cliente A, el
            cliente B, acá 10.000, acá 20… y al final de la semana el total que
            debería vender». Va al final porque no es lo que HIZO hoy —eso son
            las seis secciones de arriba— sino contra qué se mide la semana.
            El sábado, ese total es el que se contrasta con lo vendido. */}
        {proyeccion && (
          <Seccion titulo="7. PROYECCIÓN DE LA SEMANA" total={proyeccion.dias.reduce((s, d) => s + d.clientes.length, 0)}>
            {proyeccion.totalSemana === 0 && proyeccion.porUbicar.length === 0 ? (
              <Text style={e.vacio}>Sin oportunidades proyectadas para esta semana.</Text>
            ) : (
              <>
                <View style={e.th}>
                  <Text style={[e.thTexto, { width: "12%" }]}>Día</Text>
                  <Text style={[e.thTexto, { width: "58%" }]}>Cliente</Text>
                  <Text style={[e.thTexto, { width: "15%" }]}>Presupuesto</Text>
                  <Text style={[e.thTexto, { width: "15%", textAlign: "right" }]}>Monto US$</Text>
                </View>

                {proyeccion.dias.map((d) =>
                  d.clientes.length === 0 ? null : (
                    <View key={d.iso} wrap={false}>
                      {d.clientes.map((c, i) => (
                        <View key={`${d.iso}-${i}`} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                          <Text style={{ width: "12%", color: GRIS }}>{i === 0 ? d.etiqueta : ""}</Text>
                          <Text style={{ width: "58%", paddingRight: 6 }}>{corta(c.cliente, 58)}</Text>
                          <Text style={{ width: "15%", color: GRIS }}>{c.presupuesto ?? "—"}</Text>
                          <Text style={{ width: "15%", textAlign: "right" }}>
                            {Math.round(c.monto).toLocaleString("es-PE")}
                          </Text>
                        </View>
                      ))}
                      <View style={e.fila}>
                        <Text style={{ width: "70%", textAlign: "right", color: GRIS, paddingRight: 6 }}>
                          Total {d.etiqueta}
                        </Text>
                        <Text style={{ width: "30%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>
                          US$ {Math.round(d.total).toLocaleString("es-PE")}
                        </Text>
                      </View>
                    </View>
                  ),
                )}

                <View style={[e.fila, { borderTopWidth: 1, borderTopColor: GRANATE, marginTop: 3 }]} wrap={false}>
                  <Text style={{ width: "70%", textAlign: "right", fontFamily: "Helvetica-Bold", paddingRight: 6 }}>
                    PROYECTADO DE LA SEMANA
                  </Text>
                  <Text style={{ width: "30%", textAlign: "right", fontFamily: "Helvetica-Bold", color: GRANATE }}>
                    US$ {Math.round(proyeccion.totalSemana).toLocaleString("es-PE")}
                  </Text>
                </View>

                {/* Lo que está en negociación pero sin fecha. Se muestra aparte
                    y NO suma al proyectado: si sumara, el número de la semana
                    diría algo que el comercial no se comprometió a cerrar. */}
                {proyeccion.porUbicar.length > 0 && (
                  <Text style={[e.vacio, { marginTop: 4 }]}>
                    Además, {proyeccion.porUbicar.length} oportunidad(es) en negociación por US${" "}
                    {Math.round(proyeccion.totalPorUbicar).toLocaleString("es-PE")} siguen SIN fecha de cierre: hay que
                    ubicarlas en un día o moverlas de etapa.
                  </Text>
                )}
              </>
            )}
          </Seccion>
        )}

        {pie}
      </Page>
    </Document>
  );
}
