import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import {
  armarIndustriales,
  armarLg,
  disponibleDe,
  marcaDe,
  type FilaStockGeneral,
} from "@/lib/stock-general";

// «RESUMEN GENERAL DE STOCK» en el formato de Importaciones (reunión
// Santos–Lesly 22-10-2026, con las cuatro fotos del informe impreso como
// modelo). Dos documentos: EQUIPOS INDUSTRIALES (por proveedor: Alliance, GMP,
// Sailstar…; dentro por tipo; cada máquina con su serie; subtotal por tipo y
// TOTAL EQUIPOS por proveedor) y EQUIPOS LG (consolidado por modelo, con sus
// totales, y la exhibición aparte). Nunca lleva costos.
//
// Trampa de react-pdf (21-10): con cientos de filas, cualquier `render` en el
// pie fijo revienta («unsupported number»). El pie va sin número de página.

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#8F8A87";
const CABECERA = "#D9D5D2";
const SUBCABECERA = "#F1EEEC";

const s = StyleSheet.create({
  pagina: { paddingTop: 24, paddingBottom: 30, paddingHorizontal: 26, fontSize: 7.5, lineHeight: 1.3, color: CARBON, fontFamily: "Helvetica" },
  cabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: GRANATE, paddingBottom: 6, marginBottom: 8 },
  logo: { width: 100 },
  tituloDoc: { fontSize: 12, lineHeight: 1.25, fontFamily: "Helvetica-Bold", textAlign: "center" },
  subDoc: { fontSize: 7.5, color: GRIS, textAlign: "center", marginTop: 1 },
  derecha: { textAlign: "right", fontSize: 7, color: GRIS, width: 150 },
  // Título por proveedor, como el de la hoja impresa («RESUMEN GENERAL DE STOCK ALLIANCE»)
  tituloBloque: { marginTop: 6, borderWidth: 1, borderColor: CARBON, paddingVertical: 4, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11 },
  seccion: { marginTop: 6, backgroundColor: CABECERA, borderWidth: 0.75, borderColor: BORDE, paddingVertical: 2.5, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 8 },
  th: { flexDirection: "row", borderLeftWidth: 0.75, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: BORDE, backgroundColor: SUBCABECERA },
  thTxt: { fontFamily: "Helvetica-Bold", fontSize: 7, padding: 2.5, borderRightWidth: 0.5, borderRightColor: BORDE, textAlign: "center" },
  fila: { flexDirection: "row", borderLeftWidth: 0.75, borderRightWidth: 0.75, borderBottomWidth: 0.5, borderColor: BORDE },
  celda: { padding: 2.5, borderRightWidth: 0.5, borderRightColor: BORDE, justifyContent: "center" },
  centrado: { textAlign: "center" },
  negrita: { fontFamily: "Helvetica-Bold" },
  chico: { fontSize: 6.3, color: GRIS },
  subtotal: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 6, paddingVertical: 2.5, paddingRight: 4, borderLeftWidth: 0.75, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: BORDE, fontFamily: "Helvetica-Bold" },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, borderWidth: 1, borderColor: CARBON, paddingVertical: 4, paddingHorizontal: 8, fontFamily: "Helvetica-Bold", fontSize: 9 },
  granTotal: { marginTop: 12, borderWidth: 1.5, borderColor: GRANATE, paddingVertical: 5, paddingHorizontal: 8, flexDirection: "row", justifyContent: "space-between", fontFamily: "Helvetica-Bold", fontSize: 10 },
  aviso: { marginTop: 10, borderWidth: 0.75, borderColor: "#B45309", backgroundColor: "#FFF6DB", padding: 8, fontSize: 8 },
  pie: { position: "absolute", bottom: 12, left: 26, right: 26, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: BORDE, paddingTop: 3 },
  pieTexto: { fontSize: 6.5, color: GRIS },
});

// A4 vertical: ~543 pt útiles.
// Carlos (22-10): «que se numere, de todas maneras».
const COL = { n: 20, codigo: 46, modelo: 64, equipo: 212, stock: 32, marca: 50, serie: 72, disp: 47 };
const COL_LG = { n: 18, modelo: 96, equipo: 329, stock: 40, marca: 60 };

/** Importaciones escribe sin espacios («SECADORA.APIL.ELECT.MOD…»): se dan puntos de corte. */
function cortable(t: string | null | undefined, max = 24): string {
  return String(t ?? "")
    .split(" ")
    .map((w) => (w.length > max - 2 ? w.replace(/([.,/])(?=\S)/g, "$1 ") : w))
    .map((w) => w.split(" ").map((x) => (x.length > max ? x.match(new RegExp(`.{1,${max}}`, "g"))!.join(" ") : x)).join(" "))
    .join(" ");
}

export interface StockGeneralPdfProps {
  logoBuffer: Buffer;
  /** El logo de Open es más alto que el de Efameinsa: cada uno con su ancho. */
  logoAncho?: number;
  doc: "industriales" | "lg";
  filas: FilaStockGeneral[];
  /** «al 22/10/2026» */
  fecha: string;
  generado: string;
  /** De dónde salió: el almacén (con el Excel que lo cargó) o una carga en revisión. */
  origen: string;
  vistaPrevia: boolean;
  avisos: string[];
  /**
   * CONSOLIDADO (Santos 23-10): un solo PDF con una sección por empresa, primero Open y
   * luego Efameinsa; cada una arranca en página nueva con su logo y su total.
   */
  secciones?: { logoBuffer: Buffer; logoAncho?: number; origen: string; filas: FilaStockGeneral[]; avisos: string[] }[];
}

function Cabecera({ logoBuffer, logoAncho, doc, fecha, generado, origen, vistaPrevia }: Omit<StockGeneralPdfProps, "filas" | "avisos">) {
  return (
    <View style={s.cabecera} fixed>
      <Image src={logoBuffer} style={[s.logo, logoAncho ? { width: logoAncho } : {}]} />
      <View>
        <Text style={s.tituloDoc}>RESUMEN GENERAL DE STOCK</Text>
        <Text style={s.subDoc}>{doc === "lg" ? "EQUIPOS LG" : "EQUIPOS INDUSTRIALES"} · al {fecha}</Text>
      </View>
      <View style={s.derecha}>
        <Text>{generado}</Text>
        <Text>{vistaPrevia ? "VISTA PREVIA — aún no está en el almacén" : "Generado por el CRM desde el almacén"}</Text>
        <Text>{origen}</Text>
      </View>
    </View>
  );
}

function Avisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <View style={s.aviso}>
      {avisos.map((a, i) => (
        <Text key={i}>{a}</Text>
      ))}
    </View>
  );
}

function Pie({ doc, generado }: { doc: string; generado: string }) {
  return (
    <View style={s.pie} fixed>
      <Text style={s.pieTexto}>CRM Efameinsa · Resumen general de stock · {doc === "lg" ? "LG" : "industriales"} · sin costos</Text>
      <Text style={s.pieTexto}>{generado}</Text>
    </View>
  );
}

function Industriales({ filas }: { filas: FilaStockGeneral[] }) {
  const { bloques, total } = armarIndustriales(filas);
  if (bloques.length === 0) {
    return (
      <View style={s.aviso}>
        <Text>No hay equipos industriales disponibles en el almacén.</Text>
        <Text>El almacén se llena desde «Stock y códigos»: Lesly sube el Excel de stock de Importaciones y pulsa «Subir al almacén».</Text>
      </View>
    );
  }
  return (
    <View>
      {bloques.map((b, ib) => (
        <View key={b.proveedor} break={ib > 0}>
          <Text style={s.tituloBloque}>RESUMEN GENERAL DE STOCK {b.proveedor}</Text>
          {b.secciones.map((sec) => (
            <View key={sec.titulo}>
              <View wrap={false}>
                <Text style={s.seccion}>{sec.titulo}</Text>
                <View style={s.th}>
                  <Text style={[s.thTxt, { width: COL.n }]}>N.º</Text>
                  <Text style={[s.thTxt, { width: COL.codigo }]}>CÓDIGO</Text>
                  <Text style={[s.thTxt, { width: COL.modelo }]}>MOD.</Text>
                  <Text style={[s.thTxt, { width: COL.equipo }]}>EQUIPO</Text>
                  <Text style={[s.thTxt, { width: COL.stock }]}>STOCK</Text>
                  <Text style={[s.thTxt, { width: COL.marca }]}>MARCA</Text>
                  <Text style={[s.thTxt, { width: COL.serie }]}>SERIE</Text>
                  <Text style={[s.thTxt, { width: COL.disp, borderRightWidth: 0 }]}>DISPONIBLE</Text>
                </View>
              </View>
              {sec.filas.map((f, i) => (
                <View key={`${f.serie ?? f.codigo}-${i}`} style={s.fila} wrap={false}>
                  <View style={[s.celda, { width: COL.n }]}>
                    <Text style={[s.centrado, s.chico]}>{i + 1}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.codigo }]}>
                    <Text style={s.centrado}>{f.item ?? "—"}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.modelo }]}>
                    <Text style={[s.centrado, s.negrita]}>{cortable(f.modelo, 11)}</Text>
                    {f.codigo && <Text style={[s.chico, s.centrado]}>{f.codigo}</Text>}
                  </View>
                  <View style={[s.celda, { width: COL.equipo }]}>
                    <Text>{cortable(f.descripcion)}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.stock }]}>
                    <Text style={s.centrado}>{f.serie ? 1 : f.cantidad}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.marca }]}>
                    <Text style={s.centrado}>{marcaDe(f)}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.serie }]}>
                    <Text style={s.centrado}>{f.serie ? cortable(f.serie) : "sin serie"}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.disp, borderRightWidth: 0 }]}>
                    <Text style={[s.centrado, s.negrita]}>{disponibleDe(f)}</Text>
                  </View>
                </View>
              ))}
              <View style={s.subtotal} wrap={false}>
                <Text>{sec.total}</Text>
                <Text style={{ color: GRIS, fontFamily: "Helvetica" }}>
                  {sec.titulo.toLowerCase()} · {b.proveedor}
                </Text>
              </View>
            </View>
          ))}
          <View style={s.total} wrap={false}>
            <Text>TOTAL EQUIPOS {b.proveedor}</Text>
            <Text>{b.total}</Text>
          </View>
        </View>
      ))}
      <View style={s.granTotal} wrap={false}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text>TOTAL EQUIPOS INDUSTRIALES</Text>
          <Text style={[s.chico, { marginTop: 2 }]}>{bloques.map((b) => `${b.proveedor} ${b.total}`).join(" · ")}</Text>
        </View>
        <Text>{total}</Text>
      </View>
    </View>
  );
}

function Lg({ filas }: { filas: FilaStockGeneral[] }) {
  const { secciones, total } = armarLg(filas);
  if (secciones.length === 0) {
    return (
      <View style={s.aviso}>
        <Text>No hay equipos LG disponibles en el almacén.</Text>
        <Text>El almacén se llena desde «Stock y códigos»: Lesly sube el Excel de stock de Importaciones y pulsa «Subir al almacén».</Text>
      </View>
    );
  }
  // Numeración corrida (1, 2, 3…) a través de las secciones, como en la hoja impresa.
  const inicio: number[] = [];
  let acumulado = 0;
  for (const sec of secciones) {
    inicio.push(acumulado);
    acumulado += sec.modelos.length;
  }
  return (
    <View>
      <Text style={s.tituloBloque}>RESUMEN GENERAL DE STOCK LG</Text>
      {secciones.map((sec, is) => (
        <View key={sec.titulo}>
          <View wrap={false}>
            <Text style={s.seccion}>{sec.titulo}</Text>
            <View style={s.th}>
              <Text style={[s.thTxt, { width: COL_LG.n }]}>N.º</Text>
              <Text style={[s.thTxt, { width: COL_LG.modelo }]}>MODELO</Text>
              <Text style={[s.thTxt, { width: COL_LG.equipo }]}>EQUIPO</Text>
              <Text style={[s.thTxt, { width: COL_LG.stock }]}>STOCK</Text>
              <Text style={[s.thTxt, { width: COL_LG.marca, borderRightWidth: 0 }]}>MARCA</Text>
            </View>
          </View>
          {sec.modelos.map((m, im) => {
            const esExhib = sec.titulo.startsWith("EXHIBICIÓN");
            return (
              <View key={`${sec.titulo}-${m.codigo ?? m.modelo}`} style={s.fila} wrap={false}>
                <View style={[s.celda, { width: COL_LG.n }]}>
                  <Text style={s.centrado}>{inicio[is] + im + 1}</Text>
                </View>
                <View style={[s.celda, { width: COL_LG.modelo }]}>
                  <Text style={[s.centrado, s.negrita]}>{m.modelo}</Text>
                  {m.codigo && <Text style={[s.chico, s.centrado]}>{m.codigo}</Text>}
                </View>
                <View style={[s.celda, { width: COL_LG.equipo }]}>
                  <Text>{cortable(m.descripcion)}</Text>
                  {esExhib && m.series.length > 0 && <Text style={s.chico}>S: {m.series.join(" / ")}</Text>}
                </View>
                <View style={[s.celda, { width: COL_LG.stock }]}>
                  <Text style={[s.centrado, s.negrita]}>{m.stock}</Text>
                </View>
                <View style={[s.celda, { width: COL_LG.marca, borderRightWidth: 0 }]}>
                  <Text style={s.centrado}>LG</Text>
                </View>
              </View>
            );
          })}
          <View style={s.subtotal} wrap={false}>
            <Text>{sec.total}</Text>
            <Text style={{ color: GRIS, fontFamily: "Helvetica" }}>{sec.titulo.toLowerCase()}</Text>
          </View>
        </View>
      ))}
      <View style={s.granTotal} wrap={false}>
        <Text>TOTAL EQUIPOS LG</Text>
        <Text>{total}</Text>
      </View>
    </View>
  );
}

export function StockGeneralPdf(props: StockGeneralPdfProps) {
  const { doc, filas, avisos, generado, secciones } = props;
  if (secciones?.length) {
    return (
      <Document title={`Resumen general de stock ${doc === "lg" ? "LG" : "industriales"} · consolidado`} author="CRM Efameinsa">
        {secciones.map((sec, i) => (
          <Page key={i} size="A4" style={s.pagina}>
            <Cabecera {...props} logoBuffer={sec.logoBuffer} logoAncho={sec.logoAncho} origen={sec.origen} />
            <Avisos avisos={sec.avisos} />
            {doc === "lg" ? <Lg filas={sec.filas} /> : <Industriales filas={sec.filas} />}
            <Pie doc={doc} generado={generado} />
          </Page>
        ))}
      </Document>
    );
  }
  return (
    <Document title={`Resumen general de stock ${doc === "lg" ? "LG" : "industriales"}`} author="CRM Efameinsa">
      <Page size="A4" style={s.pagina}>
        <Cabecera {...props} />
        <Avisos avisos={avisos} />
        {doc === "lg" ? <Lg filas={filas} /> : <Industriales filas={filas} />}
        <Pie doc={doc} generado={generado} />
      </Page>
    </Document>
  );
}
