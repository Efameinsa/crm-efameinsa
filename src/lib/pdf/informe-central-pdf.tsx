import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// Informe del día de Central, para enviar a gerencia.
//
// Calcado del documento que Alondra venía armando a mano en Word (AGENDA
// ALONDRA PALMA.pdf, 22-08): mismo título, mismas secciones y el mismo orden,
// porque gerencia lo lee todos los días y busca cada dato en su sitio.
//
// Diferencia con el original: las secciones 2 a 5 ya no se copian del ERP —
// salen de lo que quedó registrado al trabajar. Solo la primera se escribe.
// Helvetica = fuente base de @react-pdf sin incrustar TTF (equivale a Arial).

const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#B9B4B2";
const GRANATE = "#7E1210";
const FILA_GRIS = "#EDEAE9";

export interface ContactoInformePdf {
  codigo: string | null;
  canal: string;
  area: string;
  nombre: string | null;
  razon_social: string | null;
  telefono: string | null;
  solicita: string | null;
  hora: string;
  asignado_a: string | null;
  codigo_comercial: string | null;
}

export interface PresupuestoInformePdf {
  codigo: string | null;
  serie: string;
  cliente: string | null;
  comercial: string | null;
  codigo_comercial: string | null;
  total: number;
  moneda: string;
}

export interface InformeCentralPdfProps {
  logoBuffer: Buffer;
  responsable: string;
  fechaLarga: string;
  actividades: string[];
  contactos: ContactoInformePdf[];
  presupuestos: PresupuestoInformePdf[];
  totales: { contactos: number; derivados: number; presupuestos: number; sin_asignar: number };
}

const e = StyleSheet.create({
  page: {
    paddingTop: 86,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: CARBON,
    lineHeight: 1.4,
  },
  membrete: { position: "absolute", top: 24, left: 44, right: 44 },
  membreteFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  logo: { width: 128 },
  membreteSub: { fontSize: 7.5, color: GRIS, marginTop: 2 },
  membreteLinea: { borderBottomWidth: 1.2, borderBottomColor: GRANATE, marginTop: 5 },

  pie: { position: "absolute", top: 800, left: 44, right: 44, borderTopWidth: 0.8, borderTopColor: BORDE, paddingTop: 5 },
  pieFila: { flexDirection: "row", justifyContent: "space-between" },
  pieTexto: { fontSize: 7.5, color: GRIS },

  titulo: { textAlign: "center", fontSize: 12, fontFamily: "Helvetica-Bold", textDecoration: "underline", marginBottom: 4 },
  subtitulo: { textAlign: "center", fontSize: 9, color: GRIS, marginBottom: 14 },

  resumenFila: { flexDirection: "row", gap: 8, marginBottom: 16 },
  resumenCaja: { flex: 1, borderWidth: 0.8, borderColor: BORDE, padding: 6 },
  resumenEtiqueta: { fontSize: 6.5, color: GRIS, textTransform: "uppercase" },
  resumenValor: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 1 },

  seccion: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  vacio: { fontSize: 8.5, color: GRIS, fontStyle: "italic" },

  itemFila: { flexDirection: "row", marginBottom: 2 },
  itemNumero: { width: 16, fontFamily: "Helvetica-Bold" },
  itemTexto: { flex: 1, textAlign: "justify" },

  tabla: { borderWidth: 0.8, borderColor: CARBON },
  thFila: { flexDirection: "row", backgroundColor: CARBON },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#FFFFFF", paddingVertical: 3.5, paddingHorizontal: 4 },
  tdFila: { flexDirection: "row", borderTopWidth: 0.6, borderTopColor: BORDE },
  td: { fontSize: 7.5, paddingVertical: 3.5, paddingHorizontal: 4 },
  zebra: { backgroundColor: FILA_GRIS },

  solicita: { fontSize: 7, color: GRIS, paddingHorizontal: 4, paddingBottom: 3.5 },

  serieTitulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
  firma: { marginTop: 26, borderTopWidth: 0.8, borderTopColor: BORDE, paddingTop: 5, width: 200 },
});

const ETIQUETA_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  formulario_web: "Web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Correo",
  presencial: "Presencial",
  referido: "Referido",
  otro: "Otro",
};

const ETIQUETA_AREA: Record<string, string> = {
  comercial: "Comercial",
  servicio_tecnico: "Servicio técnico",
  postventa: "Postventa",
  rrhh: "RR. HH.",
  proveedores: "Proveedores",
  administracion: "Administración",
  otros: "Otros",
};

export function InformeCentralPdf({
  logoBuffer,
  responsable,
  fechaLarga,
  actividades,
  contactos,
  presupuestos,
  totales,
}: InformeCentralPdfProps) {
  const porSerie = (s: string) => presupuestos.filter((p) => p.serie === s);

  return (
    <Document title={`Informe del día · ${responsable} · ${fechaLarga}`} author={responsable}>
      <Page size="A4" style={e.page}>
        <View style={e.membrete} fixed>
          <View style={e.membreteFila}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> */}
            <Image src={logoBuffer} style={e.logo} />
            <Text style={e.membreteSub}>Central de contactos</Text>
          </View>
          <View style={e.membreteLinea} />
        </View>

        {/* Anclado con `top`, no con `bottom`: en esta versión de @react-pdf un
            bloque fixed con `bottom` se descarta sin error cuando su contenido
            necesita layout en fila, y el PDF sale sin pie. */}
        <View style={e.pie} fixed>
          <View style={e.pieFila}>
            <Text style={e.pieTexto}>Corporación Efameinsa e Ingeniería S.A.</Text>
            <Text
              style={e.pieTexto}
              render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
            />
          </View>
        </View>

        <Text style={e.titulo}>INFORME DEL DÍA</Text>
        <Text style={e.subtitulo}>
          {responsable} · {fechaLarga}
        </Text>

        <View style={e.resumenFila}>
          {[
            ["Contactos", totales.contactos],
            ["Derivados", totales.derivados],
            ["Presupuestos", totales.presupuestos],
            ["Sin asignar", totales.sin_asignar],
          ].map(([et, v]) => (
            <View key={et as string} style={e.resumenCaja}>
              <Text style={e.resumenEtiqueta}>{et}</Text>
              <Text style={e.resumenValor}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={e.seccion}>1. ACTIVIDADES REALIZADAS</Text>
        {actividades.length === 0 ? (
          <Text style={e.vacio}>Sin actividades anotadas.</Text>
        ) : (
          actividades.map((a, i) => (
            <View key={i} style={e.itemFila}>
              <Text style={e.itemNumero}>{i + 1}.</Text>
              <Text style={e.itemTexto}>{a}</Text>
            </View>
          ))
        )}

        <Text style={e.seccion}>2. CONTACTOS REGISTRADOS</Text>
        {contactos.length === 0 ? (
          <Text style={e.vacio}>No entró ningún contacto este día.</Text>
        ) : (
          <View style={e.tabla}>
            <View style={e.thFila} fixed>
              <Text style={[e.th, { width: "13%" }]}>N.º</Text>
              <Text style={[e.th, { width: "10%" }]}>Hora</Text>
              <Text style={[e.th, { width: "11%" }]}>Vía</Text>
              <Text style={[e.th, { width: "32%" }]}>Contacto</Text>
              <Text style={[e.th, { width: "16%" }]}>Área</Text>
              <Text style={[e.th, { width: "18%" }]}>Derivado a</Text>
            </View>
            {contactos.map((c, i) => (
              <View key={c.codigo ?? i} wrap={false}>
                <View style={[e.tdFila, ...(i % 2 ? [e.zebra] : [])]}>
                  <Text style={[e.td, { width: "13%" }]}>{c.codigo ?? "Borrador"}</Text>
                  <Text style={[e.td, { width: "10%" }]}>{c.hora}</Text>
                  <Text style={[e.td, { width: "11%" }]}>{ETIQUETA_CANAL[c.canal] ?? c.canal}</Text>
                  <Text style={[e.td, { width: "32%" }]}>
                    {c.nombre ?? "—"}
                    {c.razon_social ? ` · ${c.razon_social}` : ""}
                    {c.telefono ? ` · ${c.telefono}` : ""}
                  </Text>
                  <Text style={[e.td, { width: "16%" }]}>{ETIQUETA_AREA[c.area] ?? c.area}</Text>
                  <Text style={[e.td, { width: "18%" }]}>
                    {c.asignado_a
                      ? `${c.codigo_comercial ?? ""} ${c.asignado_a}`.trim()
                      : c.area === "comercial"
                        ? "Pendiente"
                        : "Otra área"}
                  </Text>
                </View>
                {c.solicita && (
                  <View style={i % 2 ? e.zebra : undefined}>
                    <Text style={e.solicita}>Solicita: {c.solicita.replace(/\s+/g, " ")}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <Text style={e.seccion}>3. PRESUPUESTOS DEL DÍA</Text>
        {presupuestos.length === 0 ? (
          <Text style={e.vacio}>No se emitieron presupuestos este día.</Text>
        ) : (
          (["EFAMEINSA", "OPEN"] as const).map((serie) => {
            const filas = porSerie(serie);
            if (filas.length === 0) return null;
            return (
              <View key={serie}>
                <Text style={e.serieTitulo}>
                  {serie === "OPEN" ? "OPEN INVESTMENTS S.A.C" : "EFAMEINSA S.A."} — {filas.length}
                </Text>
                <View style={e.tabla}>
                  <View style={e.thFila}>
                    <Text style={[e.th, { width: "18%" }]}>N.º</Text>
                    <Text style={[e.th, { width: "44%" }]}>Cliente</Text>
                    <Text style={[e.th, { width: "20%" }]}>Comercial</Text>
                    <Text style={[e.th, { width: "18%", textAlign: "right" }]}>Monto</Text>
                  </View>
                  {filas.map((p, i) => (
                    <View key={p.codigo ?? i} style={[e.tdFila, ...(i % 2 ? [e.zebra] : [])]}>
                      <Text style={[e.td, { width: "18%" }]}>{p.codigo ?? "borrador"}</Text>
                      <Text style={[e.td, { width: "44%" }]}>{p.cliente ?? "—"}</Text>
                      <Text style={[e.td, { width: "20%" }]}>{p.codigo_comercial ?? p.comercial ?? "—"}</Text>
                      <Text style={[e.td, { width: "18%", textAlign: "right" }]}>
                        {p.moneda} {Number(p.total).toLocaleString("es-PE")}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}

        <View style={e.firma}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{responsable}</Text>
          <Text style={{ fontSize: 8, color: GRIS }}>Central de contactos</Text>
        </View>
      </Page>
    </Document>
  );
}
