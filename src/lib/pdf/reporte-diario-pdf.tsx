import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

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

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const VERDE = "#1E7F4F";
const BORDE = "#D8D4D3";
const FILA_GRIS = "#F4F2F1";

export interface ReporteDiarioProps {
  logoBuffer: Buffer;
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
  };
  seguimientos: {
    hora: string | null;
    cliente: string;
    tipo: string;
    nota: string | null;
    resultado: string | null;
    efectivo: boolean;
  }[];
  cotizaciones: { codigo: string | null; cliente: string; total: number; moneda: string; enviada: boolean; aprobacion: string }[];
  ventas: { cliente: string; monto: number; moneda: string }[];
  leads: { codigo: string | null; nombre: string; canal: string; hora: string | null }[];
  complementarias: { titulo: string; hora: string | null }[];
  agenda: { pendiente_hoy: number; vencidas: number; manana: number };
  /** Reunión 25-08 (ing. Carlos): el reporte debe mostrar QUÉ hay planificado
   *  para el día siguiente, no solo cuántos — «para ver cómo se están
   *  gestionando». */
  planificacion_manana: {
    fecha: string;
    gestiones: { cliente: string; accion: string | null; hora: string | null; etapa: string }[];
    tareas: { titulo: string; hora: string | null }[];
  };
}

// Márgenes: el ing. Carlos, 24-08, sobre este reporte impreso — el texto salía
// apretado y llegando al borde. 32 pt son 11 mm, por debajo del margen que
// muchas impresoras láser no pueden imprimir (suelen reservar ~13 mm), así que
// la última columna se recortaba en papel aunque en pantalla se viera entera.
// 40 pt ≈ 14 mm entra en cualquier impresora, y el interlineado da aire a las
// filas sin sumar páginas.
const e = StyleSheet.create({
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
  tarjetaValor: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tarjetaSub: { fontSize: 6.5, color: GRIS, marginTop: 1 },

  seccion: { marginTop: 10 },
  seccionCabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: GRANATE, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 2 },
  seccionTitulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF", letterSpacing: 0.3 },
  seccionTotal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },

  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDE, paddingVertical: 4.5, paddingHorizontal: 5 },
  filaAlterna: { backgroundColor: FILA_GRIS },
  th: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: BORDE },
  thTexto: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  vacio: { fontSize: 8, color: GRIS, fontStyle: "italic", paddingVertical: 7, paddingHorizontal: 5 },

  pie: { position: "absolute", bottom: 26, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: BORDE, paddingTop: 5 },
  pieTexto: { fontSize: 6.5, color: GRIS },
});

const TIPO: Record<string, string> = {
  llamada: "Llamada", whatsapp: "WhatsApp", email: "Correo", visita: "Visita", showroom: "Showroom",
};
const ETAPA: Record<string, string> = {
  asignada: "Recibido", filtrada: "Filtrado", cotizada: "Cotizado",
  seguimiento: "Seguimiento", potencial: "Negociación",
};
const CANAL: Record<string, string> = {
  whatsapp: "WhatsApp", llamada: "Llamada", formulario_web: "Web", facebook: "Facebook",
  instagram: "Instagram", email: "Correo", presencial: "Presencial", referido: "Referido", otro: "Otro",
};
const corta = (s: string | null, n: number) => (!s ? "—" : s.length > n ? `${s.slice(0, n - 1)}…` : s);
const dinero = (m: number, mon: string) => `${mon === "PEN" ? "S/" : "US$"} ${Math.round(m).toLocaleString("es-PE")}`;

function Seccion({ titulo, total, children }: { titulo: string; total: string | number; children: React.ReactNode }) {
  return (
    <View style={e.seccion} wrap={false}>
      <View style={e.seccionCabecera}>
        <Text style={e.seccionTitulo}>{titulo}</Text>
        <Text style={e.seccionTotal}>TOTAL: {total}</Text>
      </View>
      {children}
    </View>
  );
}

function Tarjeta({ etiqueta, valor, sub }: { etiqueta: string; valor: string; sub?: string }) {
  return (
    <View style={e.tarjeta}>
      <Text style={e.tarjetaEtiqueta}>{etiqueta}</Text>
      <Text style={e.tarjetaValor}>{valor}</Text>
      {sub ? <Text style={e.tarjetaSub}>{sub}</Text> : null}
    </View>
  );
}

export function ReporteDiarioPdf({
  logoBuffer, fecha, comercial, resumen, seguimientos, cotizaciones, ventas, leads, complementarias, agenda, planificacion_manana,
}: ReporteDiarioProps) {
  const pct = resumen.meta_seguimientos > 0
    ? Math.min((resumen.seguimientos_efectivos / resumen.meta_seguimientos) * 100, 100)
    : 0;
  const cumple = resumen.seguimientos_efectivos >= resumen.meta_seguimientos;

  return (
    <Document title={`Reporte diario ${comercial.codigo ?? ""} ${fecha}`} author="CRM Efameinsa">
      <Page size="A4" style={e.pagina}>
        <View style={e.cabecera}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
          <Image style={e.logo} src={logoBuffer} />
          <View style={e.tituloBloque}>
            <Text style={e.titulo}>REPORTE DIARIO DE GESTIÓN</Text>
            <Text style={e.subtitulo}>{fecha}</Text>
            <Text style={e.comercial}>
              {comercial.codigo ? `${comercial.codigo} · ` : ""}
              {comercial.nombre}
            </Text>
          </View>
        </View>

        {/* Avance hacia la meta: lo primero que se ve. */}
        <View style={e.metaCaja}>
          <View style={e.metaFila}>
            <Text style={e.metaEtiqueta}>Seguimientos efectivos del día</Text>
            <Text style={[e.metaNumero, { color: cumple ? VERDE : GRANATE }]}>
              {resumen.seguimientos_efectivos} / {resumen.meta_seguimientos}
            </Text>
          </View>
          <View style={e.barraFondo}>
            <View style={[e.barraRelleno, { width: `${pct}%`, backgroundColor: cumple ? VERDE : GRANATE }]} />
          </View>
          <Text style={{ fontSize: 7, color: GRIS, marginTop: 4 }}>
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
        </View>

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
          ) : (
            seguimientos.map((s, i) => (
              <View key={i} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "7%" }}>{s.hora ?? "—"}</Text>
                <Text style={{ width: "27%", paddingRight: 6 }}>{corta(s.cliente, 34)}</Text>
                <Text style={{ width: "10%" }}>{TIPO[s.tipo] ?? s.tipo}</Text>
                <Text style={{ width: "17%", color: s.efectivo ? CARBON : GRIS }}>
                  {s.resultado ?? (s.efectivo ? "Contactado" : "No contestó")}
                </Text>
                <Text style={{ width: "39%", color: GRIS }}>{corta(s.nota, 120)}</Text>
              </View>
            ))
          )}
        </Seccion>

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
              <View key={i} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "14%" }}>{c.codigo ?? "Borrador"}</Text>
                {/* paddingRight: sin él, un nombre largo llega hasta el borde
                    de su celda y queda pegado a "Estado" — se leía
                    "…LAVANDERIAS CLEANEnviado". */}
                <Text style={{ width: "46%", paddingRight: 6 }}>{corta(c.cliente, 52)}</Text>
                <Text style={{ width: "20%", color: GRIS }}>
                  {c.aprobacion === "pendiente_gerencia" ? "Por aprobar" : c.enviada ? "Enviado" : "Borrador"}
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
              <View key={i} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
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
            leads.map((l, i) => (
              <View key={i} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "12%" }}>{l.hora ?? "—"}</Text>
                <Text style={{ width: "16%", color: GRIS }}>{l.codigo ?? "—"}</Text>
                <Text style={{ width: "54%", paddingRight: 6 }}>{corta(l.nombre, 56)}</Text>
                <Text style={{ width: "18%", color: GRIS }}>{CANAL[l.canal] ?? l.canal}</Text>
              </View>
            ))
          )}
        </Seccion>

        <Seccion titulo="5. ACTIVIDADES COMPLEMENTARIAS" total={complementarias.length}>
          {complementarias.length === 0 ? (
            <Text style={e.vacio}>
              Sin actividades complementarias registradas (capacitaciones, visitas de campo, reuniones).
            </Text>
          ) : (
            complementarias.map((a, i) => (
              <View key={i} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                <Text style={{ width: "12%" }}>{a.hora ?? "—"}</Text>
                <Text style={{ width: "88%" }}>{corta(a.titulo, 110)}</Text>
              </View>
            ))
          )}
        </Seccion>

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
                <View key={`g${i}`} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "8%" }}>{g.hora ?? "—"}</Text>
                  <Text style={{ width: "42%", paddingRight: 6 }}>{corta(g.cliente, 48)}</Text>
                  <Text style={{ width: "14%", color: GRIS }}>{ETAPA[g.etapa] ?? g.etapa}</Text>
                  <Text style={{ width: "36%", color: GRIS }}>{g.accion ? corta(g.accion, 60) : "Seguimiento programado"}</Text>
                </View>
              ))}
              {planificacion_manana.tareas.map((t, i) => (
                <View key={`t${i}`} style={[e.fila, ...((planificacion_manana.gestiones.length + i) % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "8%" }}>{t.hora ?? "—"}</Text>
                  <Text style={{ width: "42%", paddingRight: 6 }}>{corta(t.titulo, 48)}</Text>
                  <Text style={{ width: "14%", color: GRIS }}>Tarea</Text>
                  <Text style={{ width: "36%", color: GRIS }}>Actividad propia de agenda</Text>
                </View>
              ))}
            </>
          )}
        </Seccion>

        <View style={e.pie} fixed>
          <Text style={e.pieTexto}>Generado automáticamente por el CRM de Efameinsa</Text>
          <Text style={e.pieTexto} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
