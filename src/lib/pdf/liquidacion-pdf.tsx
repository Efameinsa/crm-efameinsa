import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { IDENTIDAD_SERIE } from "./series";
import type { Liquidacion } from "@/lib/liquidacion-automatica";

// LA LIQUIDACIÓN QUE ARMA EL CRM (0534, reunión 17-10 con Jhon). Calca la
// plantilla de Excel de Finanzas (OPERACION CONTADO NORMAL / CON ANTICIPO Y
// LETRAS / CON COMISIONES / DE DETRACCION): carta al cliente, renglones con
// sus series, subtotal-IGV-total, los pagos con su operación, el saldo, el
// rótulo de la operación y las notas. Las letras, en su cuadro al final.

const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#B9B4B2";
const FILA_GRIS = "#EDEAE9";

const e = StyleSheet.create({
  pagina: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 42, fontSize: 9, lineHeight: 1.35, color: CARBON, fontFamily: "Helvetica" },
  cabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, paddingBottom: 8, marginBottom: 12 },
  logo: { width: 120 },
  wordmark: { fontSize: 16, lineHeight: 1.2, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  cabDer: { textAlign: "right", fontSize: 8.5 },
  titulo: { fontSize: 13, lineHeight: 1.25, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  carta: { marginBottom: 2 },
  negrita: { fontFamily: "Helvetica-Bold" },
  tabla: { marginTop: 10, borderWidth: 1, borderColor: "#8A8480" },
  th: { flexDirection: "row", backgroundColor: FILA_GRIS, borderBottomWidth: 1, borderBottomColor: "#8A8480" },
  thTexto: { fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4 },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDE },
  td: { fontSize: 8.5, padding: 4 },
  cCant: { width: 36, textAlign: "center" },
  cDesc: { flex: 1 },
  cPre: { width: 78, textAlign: "right" },
  cImp: { width: 82, textAlign: "right" },
  totales: { alignSelf: "flex-end", width: 250, marginTop: 6 },
  totFila: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  pagos: { marginTop: 12, borderWidth: 1, borderColor: "#8A8480" },
  pagoFila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDE },
  rotulo: { marginTop: 12, fontSize: 11, fontFamily: "Helvetica-Bold" },
  h2: { marginTop: 12, fontSize: 8.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", borderBottomWidth: 1, borderBottomColor: BORDE, paddingBottom: 2 },
  nota: { marginTop: 2, fontSize: 8.5 },
  pie: { position: "absolute", bottom: 20, left: 42, right: 42, fontSize: 7, color: GRIS, textAlign: "center" },
});

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const fechaCarta = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `Lima, ${d} de ${MESES[m - 1]} del ${a}`;
};
const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${a}`;
};

export function LiquidacionPdf({ l, logoBuffer, vistaPrevia }: { l: Liquidacion; logoBuffer: Buffer; vistaPrevia?: boolean }) {
  const b = l.base;
  const id = IDENTIDAD_SERIE[b.empresa];
  const simbolo = b.moneda === "PEN" ? "S/" : "$";
  const m = (n: number) => `${simbolo} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <Document title={`Liquidación ${l.numero} · ${b.pedido} · ${b.cliente}`}>
      <Page size="A4" style={e.pagina}>
        <View style={[e.cabecera, { borderBottomColor: id.acento }]}>
          {id.usaLogo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoBuffer} style={e.logo} />
          ) : (
            <Text style={[e.wordmark, { color: id.acento }]}>{id.nombreLegal}</Text>
          )}
          <View style={e.cabDer}>
            <Text style={[e.titulo, { color: id.acento }]}>LIQUIDACIÓN N.º {l.numero}</Text>
            <Text>Pedido {b.pedido}</Text>
            {vistaPrevia && <Text style={{ color: "#B42318", fontFamily: "Helvetica-Bold" }}>VISTA PREVIA · SIN VALIDAR</Text>}
          </View>
        </View>

        <Text style={e.carta}>{fechaCarta(l.fecha)}</Text>
        <Text style={[e.carta, { marginTop: 6 }]}>Sres.:</Text>
        <Text style={[e.carta, e.negrita]}>{b.cliente}</Text>
        {b.clienteDoc && <Text style={e.carta}>{b.clienteDoc.length === 8 ? "DNI" : "RUC"}: {b.clienteDoc}</Text>}
        <Text style={[e.carta, { marginTop: 6 }]}>Presente.-</Text>
        <Text style={{ marginTop: 6 }}>
          Por medio de la presente, estamos enviando la siguiente liquidación: <Text style={e.negrita}>{b.pedido}</Text>
        </Text>

        <View style={e.tabla}>
          <View style={e.th}>
            <Text style={[e.thTexto, e.cCant]}>CANT</Text>
            <Text style={[e.thTexto, e.cDesc]}>{b.esServicio ? "DESCRIPCIÓN" : "DETALLE DE EQUIPO"}</Text>
            <Text style={[e.thTexto, e.cPre]}>PRECIO UNIT.</Text>
            <Text style={[e.thTexto, e.cImp]}>IMPORTE {simbolo}</Text>
          </View>
          {b.renglones.map((r, i) => (
            <View key={i} style={e.fila} wrap={false}>
              <Text style={[e.td, e.cCant]}>{r.cantidad}</Text>
              <Text style={[e.td, e.cDesc]}>{r.descripcion}</Text>
              <Text style={[e.td, e.cPre]}>{m(r.precioUnitario)}</Text>
              <Text style={[e.td, e.cImp]}>{m(r.importe)}</Text>
            </View>
          ))}
          {b.series.length > 0 && (
            <View style={[e.fila, { borderBottomWidth: 0 }]}>
              <Text style={[e.td, e.cCant]} />
              <Text style={[e.td, e.cDesc, { color: GRIS }]}>{b.series.join("\n")}</Text>
            </View>
          )}
        </View>

        <View style={e.totales}>
          <View style={e.totFila}><Text>SUB TOTAL</Text><Text>{m(b.subtotal)}</Text></View>
          <View style={e.totFila}><Text>IGV 18 %</Text><Text>{m(b.igv)}</Text></View>
          <View style={[e.totFila, { borderTopWidth: 1, borderTopColor: CARBON }]}><Text style={e.negrita}>TOTAL</Text><Text style={e.negrita}>{m(b.total)}</Text></View>
        </View>

        <View style={e.pagos} wrap={false}>
          <View style={e.th}>
            <Text style={[e.thTexto, { width: 90 }]}>CONCEPTO</Text>
            <Text style={[e.thTexto, { flex: 1 }]}>DETALLE (FECHA, BANCO, OPERACIÓN, FACTURA)</Text>
            <Text style={[e.thTexto, e.cImp]}>MONTO</Text>
          </View>
          <View style={e.pagoFila}>
            <Text style={[e.td, { width: 90 }, e.negrita]}>TOTAL</Text>
            <Text style={[e.td, { flex: 1 }]} />
            <Text style={[e.td, e.cImp, e.negrita]}>{m(b.total)}</Text>
          </View>
          {l.filas.length === 0 && (
            <View style={e.pagoFila}>
              <Text style={[e.td, { width: 90 }]}>ABONO</Text>
              <Text style={[e.td, { flex: 1, color: GRIS }]}>PDTE ABONO</Text>
              <Text style={[e.td, e.cImp]}>{m(0)}</Text>
            </View>
          )}
          {l.filas.map((f, i) => (
            <View key={i} style={e.pagoFila}>
              <Text style={[e.td, { width: 90 }]}>{f.etiqueta}</Text>
              <Text style={[e.td, { flex: 1 }]}>{f.detalle}</Text>
              <Text style={[e.td, e.cImp, f.monto > 0 ? { color: "#B42318" } : {}]}>{f.monto < 0 ? `- ${m(-f.monto)}` : `+ ${m(f.monto)}`}</Text>
            </View>
          ))}
          <View style={[e.pagoFila, { backgroundColor: FILA_GRIS, borderBottomWidth: 0 }]}>
            <Text style={[e.td, { width: 90 }, e.negrita]}>TOTAL SALDO</Text>
            <Text style={[e.td, { flex: 1 }]}>{l.comisionPendiente > 0 ? `Incluye ${m(l.comisionPendiente)} de comisión: la cobra el comercial` : ""}</Text>
            <Text style={[e.td, e.cImp, e.negrita]}>{m(l.saldo)}</Text>
          </View>
        </View>

        <Text style={[e.rotulo, { color: id.acento }]}>{l.rotulo}</Text>

        {l.letras.length > 0 && (
          <View wrap={false}>
            <Text style={e.h2}>Cuadro de letras</Text>
            <View style={[e.tabla, { marginTop: 4 }]}>
              <View style={e.th}>
                {["N.º", "GIRO", "VENCE", "DÍAS", "MONTO", "ESTADO"].map((t) => (
                  <Text key={t} style={[e.thTexto, { flex: 1, textAlign: "center" }]}>{t}</Text>
                ))}
              </View>
              {l.letras.map((x) => (
                <View key={x.n} style={e.fila}>
                  <Text style={[e.td, { flex: 1, textAlign: "center" }]}>{x.n}</Text>
                  <Text style={[e.td, { flex: 1, textAlign: "center" }]}>{fechaCorta(x.giro)}</Text>
                  <Text style={[e.td, { flex: 1, textAlign: "center" }]}>{fechaCorta(x.vence)}</Text>
                  <Text style={[e.td, { flex: 1, textAlign: "center" }]}>{x.dias}</Text>
                  <Text style={[e.td, { flex: 1, textAlign: "right" }]}>{m(x.monto)}</Text>
                  <Text style={[e.td, { flex: 1, textAlign: "center" }]}>PDTE</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={e.h2}>Nota</Text>
        {l.notas.map((n, i) => (
          <Text key={i} style={e.nota}>- {n}</Text>
        ))}

        <Text style={e.pie} fixed>
          {id.nombreLegal} · Liquidación generada por el CRM con los abonos confirmados por Finanzas
        </Text>
      </Page>
    </Document>
  );
}
