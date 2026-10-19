import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { IDENTIDAD_SERIE } from "./series";
import type { BloqueLiquidacion, Liquidacion } from "@/lib/liquidacion-automatica";

// LA LIQUIDACIÓN QUE ARMA EL CRM (0534, reunión 17-10 con Jhon). Es la
// plantilla de Excel de Finanzas calcada (OPERACION CONTADO NORMAL / CON
// ANTICIPO Y LETRAS / CON COMISIONES / DE DETRACCION): membrete chico arriba,
// la carta («Lima, … / Sres.: / RUC / Presente.-»), la tabla CANT · DETALLE
// · PRECIO UNIT. · IMPORTE con las series bajo cada equipo, SUB TOTAL · IGV ·
// TOTAL en celdas sombreadas, un bloque por factura (TOTAL · ABONO ·
// COMISIÓN · TOTAL SALDO) con la fecha y el banco a la izquierda, las
// comisiones a la izquierda, el recuadro de la operación, la NOTA, el cuadro
// de letras y al pie la empresa con la firma de quien liquida.

const NEGRO = "#000000";
const GRIS = "#595959";
const SOMBRA = "#A6A6A6";
const ROJO = "#C00000";

const e = StyleSheet.create({
  pagina: { paddingTop: 28, paddingBottom: 28, paddingHorizontal: 40, fontSize: 8.5, lineHeight: 1.25, color: NEGRO, fontFamily: "Helvetica" },
  membrete: { marginBottom: 14 },
  marcaChica: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#C0272D" },
  marcaSub: { fontSize: 6.5, color: GRIS },
  linea: { borderBottomWidth: 0.75, borderBottomColor: GRIS, width: 320, marginTop: -3, marginLeft: 70 },
  logo: { width: 110 },
  b: { fontFamily: "Helvetica-Bold" },
  tabla: { marginTop: 10, borderWidth: 1.5, borderColor: NEGRO },
  th: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: NEGRO },
  thTexto: { fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 4 },
  fila: { flexDirection: "row" },
  td: { fontSize: 8.5, paddingVertical: 2, paddingHorizontal: 4 },
  cCant: { width: 52, textAlign: "center", borderRightWidth: 1.5, borderRightColor: NEGRO },
  cDesc: { flex: 1, borderRightWidth: 1.5, borderRightColor: NEGRO },
  cPre: { width: 92, borderRightWidth: 1.5, borderRightColor: NEGRO },
  cImp: { width: 92 },
  // Las celdas de la derecha (SUB TOTAL / TOTAL / ABONO…): rótulo y monto en cajas.
  cajaRot: { width: 92, borderWidth: 1, borderColor: NEGRO, paddingHorizontal: 3, paddingVertical: 1, fontFamily: "Helvetica-Bold", fontSize: 8 },
  cajaMon: { width: 92, borderWidth: 1, borderColor: NEGRO, paddingHorizontal: 3, paddingVertical: 1, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 8, marginLeft: 6 },
  izq: { flex: 1, textAlign: "right", paddingRight: 3, fontFamily: "Helvetica-Bold", fontSize: 8 },
  operacion: { marginTop: 12, width: 380, borderWidth: 1.5, borderColor: NEGRO, paddingVertical: 4, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  nota: { fontSize: 8.5, marginTop: 1 },
  pie: { marginTop: 18, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  pieMarca: { fontSize: 15, lineHeight: 1.15, fontFamily: "Helvetica-Bold", color: "#C0272D" },
  pieFirma: { lineHeight: 1.3, borderLeftWidth: 1, borderLeftColor: GRIS, paddingLeft: 6, marginLeft: 8, fontSize: 7.5 },
});

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const fechaCarta = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `Lima, ${String(d).padStart(2, "0")} de ${MESES[m - 1]} del ${a}`;
};
const fechaBarra = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function LiquidacionPdf({ l, logoBuffer, vistaPrevia }: { l: Liquidacion; logoBuffer: Buffer; vistaPrevia?: boolean }) {
  const b = l.base;
  const id = IDENTIDAD_SERIE[b.empresa];
  const esOpen = b.empresa === "OPEN";
  const nombreMarca = esOpen ? "OPEN INVESTMENTS S.A.C" : id.nombreLegal.toUpperCase();
  const simbolo = b.moneda === "PEN" ? "S/" : "$";
  const m = (n: number) => `${n < 0 ? "-" : ""}${simbolo}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cifra = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Document title={`Liquidación ${l.numero} · ${b.pedido} · ${b.cliente}`}>
      <Page size="A4" style={e.pagina}>
        <View style={e.membrete}>
          {esOpen ? (
            <>
              <Text style={e.marcaChica}>{nombreMarca}</Text>
              <Text style={e.marcaSub}>Laundry &amp; Equipment</Text>
              <View style={e.linea} />
            </>
          ) : (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoBuffer} style={e.logo} />
          )}
          {vistaPrevia && <Text style={{ position: "absolute", right: 0, top: 0, color: ROJO, fontFamily: "Helvetica-Bold" }}>VISTA PREVIA · SIN VALIDAR</Text>}
          <Text style={{ position: "absolute", right: 0, top: vistaPrevia ? 12 : 0, color: GRIS, fontSize: 7.5 }}>Liquidación N.º {l.numero}</Text>
        </View>

        <Text style={e.b}>{fechaCarta(l.fecha)}</Text>
        <Text>Sres.:</Text>
        <Text style={[e.b, { fontSize: 9 }]}>{b.cliente}</Text>
        {b.clienteDoc && <Text style={[e.b, { fontSize: 9 }]}>{b.clienteDoc.length === 8 ? "DNI" : "RUC"}: {b.clienteDoc}</Text>}
        <Text style={{ marginTop: 10, textDecoration: "underline" }}>Presente.-</Text>
        <Text style={{ marginTop: 8 }}>
          Por medio de la presente; estamos enviando la siguiente liquidación: <Text style={e.b}>{b.pedido}</Text>
        </Text>

        <View style={e.tabla}>
          <View style={e.th}>
            <Text style={[e.thTexto, e.cCant]}>CANT</Text>
            <Text style={[e.thTexto, e.cDesc]}>{b.esServicio ? "DESCRIPCION" : "DETALLE DE EQUIPO"}</Text>
            <Text style={[e.thTexto, e.cPre]}>PRECIO UNIT.</Text>
            <Text style={[e.thTexto, e.cImp, { textAlign: "center" }]}>IMPORTE {simbolo}</Text>
          </View>
          {b.renglones.map((r, i) => {
            const [cabeza, ...resto] = r.descripcion.split("\n");
            return (
              <View key={i} style={e.fila} wrap={false}>
                <Text style={[e.td, e.cCant, { paddingTop: 6 }]}>{r.cantidad}</Text>
                <View style={[e.td, e.cDesc, { paddingTop: 6, paddingBottom: 4 }]}>
                  <Text style={e.b}>{cabeza}</Text>
                  {resto.filter((t) => t.trim()).map((t, k) => (
                    <Text key={k}>{t}</Text>
                  ))}
                  {r.series.map((s) => (
                    <Text key={s}>SERIE: {s}</Text>
                  ))}
                  {r.gratuito && <Text style={e.b}>ENTREGA GRATUITA · NO SE COBRA</Text>}
                </View>
                <View style={[e.td, e.cPre, { paddingTop: 6, flexDirection: "row", justifyContent: "space-between" }]}>
                  <Text>{simbolo}</Text>
                  <Text>{cifra(r.precioUnitario)}</Text>
                </View>
                <View style={[e.td, e.cImp, { paddingTop: 6, flexDirection: "row", justifyContent: "space-between" }]}>
                  <Text>{simbolo}</Text>
                  <Text>{cifra(r.importe)}</Text>
                </View>
              </View>
            );
          })}
          {b.series.length > 0 && (
            <View style={e.fila}>
              <Text style={[e.td, e.cCant]} />
              <View style={[e.td, e.cDesc]}>
                {b.series.map((s) => (
                  <Text key={s}>{s}</Text>
                ))}
              </View>
              <Text style={[e.td, e.cPre]} />
              <Text style={[e.td, e.cImp]} />
            </View>
          )}
          {/* El espacio en blanco de la plantilla, con las columnas hasta abajo. */}
          <View style={[e.fila, { height: 14 }]}>
            <Text style={e.cCant} />
            <Text style={e.cDesc} />
            <Text style={e.cPre} />
            <Text style={e.cImp} />
          </View>
        </View>

        <View style={{ marginTop: 2 }} wrap={false}>
          <Caja rotulo="SUB TOTAL" monto={m(b.subtotal)} />
          <Caja rotulo="IGV 18%" monto={m(b.igv)} />
          <Caja izquierda="" rotulo="TOTAL" monto={m(b.total)} sombra />
          {/* Lo gratuito, en su propio recuadro: no entra a la base imponible, al IGV ni al total (Jhon, buzón 19-10). */}
          {b.gratuito > 0 && (
            <View style={{ marginTop: 4 }}>
              <Caja izquierda="NO SUMA A LA BASE IMPONIBLE, AL IGV NI AL TOTAL" rotulo="ENTREGA GRATUITA" monto={m(b.gratuito)} />
            </View>
          )}
        </View>

        {/* La nota de Finanzas y las comisiones van a la izquierda, como en el Excel. */}
        <View style={{ flexDirection: "row", marginTop: 4 }}>
          <View style={{ width: 170 }}>
            {l.comisiones.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={e.b}>COMISIONES</Text>
                {l.comisiones.map((x, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 7.5 }}>{x.izquierda}</Text>
                    <Text style={{ fontSize: 7.5 }}>{m(x.monto)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 0.75, borderTopColor: NEGRO }}>
                  <Text style={[e.b, { fontSize: 7.5 }]}>{m(l.comisiones.reduce((s, x) => s + x.monto, 0))}</Text>
                </View>
              </View>
            )}
            {l.notaLibre && (
              <View style={{ marginTop: 8 }}>
                <Text style={e.b}>NOTA</Text>
                <Text style={[e.b, { fontSize: 7.5 }]}>{l.notaLibre}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            {l.bloques.map((x, i) => (
              <Bloque key={i} x={x} m={m} />
            ))}
          </View>
        </View>

        <Text style={e.operacion}>{l.rotulo}</Text>

        <View wrap={false}>
          <Text style={[e.b, { marginTop: 10, textDecoration: "underline" }]}>NOTA:</Text>
          {l.notas.map((n, i) => (
            <Text key={i} style={[e.nota, i === 0 ? e.b : {}]}>- {n}</Text>
          ))}
        </View>

        {l.letras.length > 0 && (
          <View style={{ marginTop: 12 }} wrap={false}>
            <View style={{ flexDirection: "row", backgroundColor: "#D9D9D9", borderWidth: 0.75, borderColor: NEGRO }}>
              {["N°", "N° LETRA", "GIRO", "VCTO", "MONTO", "DIAS", "INTERESES", "IMPORT LETRA + INTE", "ABONADO", "ESTADO", "FECHA"].map((t, i) => (
                <Text key={t} style={[e.thTexto, { fontSize: 6.5, width: ANCHO_LETRAS[i] }]}>{t}</Text>
              ))}
            </View>
            {l.letras.map((x) => (
              <View key={x.n} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderLeftWidth: 0.75, borderRightWidth: 0.75, borderColor: NEGRO }}>
                {[String(x.n), "", fechaBarra(x.giro), fechaBarra(x.vence), m(x.monto), String(x.dias), cifra(x.interes), m(x.monto + x.interes), "", "PENDIENTE", ""].map((t, i) => (
                  <Text key={i} style={{ fontSize: 7, paddingHorizontal: 2, paddingVertical: 1, width: ANCHO_LETRAS[i], textAlign: i >= 4 && i <= 8 ? "right" : "left" }}>{t}</Text>
                ))}
              </View>
            ))}
            <View style={{ flexDirection: "row" }}>
              <Text style={{ width: ANCHO_LETRAS.slice(0, 4).reduce((s, w) => s + w, 0) }} />
              <Text style={[e.b, { fontSize: 7, width: ANCHO_LETRAS[4], textAlign: "right", backgroundColor: "#D9D9D9", paddingHorizontal: 2 }]}>{m(l.letras.reduce((s, x) => s + x.monto, 0))}</Text>
              <Text style={{ width: ANCHO_LETRAS[5] + ANCHO_LETRAS[6] }} />
              <Text style={[e.b, { fontSize: 7, width: ANCHO_LETRAS[7], textAlign: "right", paddingHorizontal: 2 }]}>{m(l.letras.reduce((s, x) => s + x.monto + x.interes, 0))}</Text>
            </View>
          </View>
        )}

        <View style={e.pie} wrap={false}>
          <View>
            {esOpen ? (
              <>
                <Text style={e.pieMarca}>{nombreMarca}</Text>
                <Text style={{ fontSize: 8.5, color: GRIS }}>Laundry &amp; Equipment</Text>
              </>
            ) : (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoBuffer} style={{ width: 130 }} />
            )}
          </View>
          {b.firma && (
            <View style={e.pieFirma}>
              <Text>{b.firma.nombre}</Text>
              <Text style={e.b}>CONTABILIDAD Y FINANZAS</Text>
              {b.firma.celular && <Text>Celular : {b.firma.celular}</Text>}
              {b.firma.correo && <Text>Email : <Text style={{ color: "#0563C1", textDecoration: "underline" }}>{b.firma.correo}</Text></Text>}
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}

const ANCHO_LETRAS = [22, 42, 46, 46, 52, 28, 44, 62, 42, 52, 79];

function Caja({ izquierda, rotulo, monto, sombra, rojo }: { izquierda?: string; rotulo: string; monto: string; sombra?: boolean; rojo?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text style={e.izq}>{izquierda ?? ""}</Text>
      <Text style={[e.cajaRot, { minHeight: 12 }, rotulo.length > 14 ? { fontSize: 7 } : {}, sombra ? { backgroundColor: SOMBRA } : {}]}>{rotulo}</Text>
      <Text style={[e.cajaMon, { minHeight: 12 }, sombra ? { backgroundColor: SOMBRA } : {}, rojo ? { color: ROJO } : {}]}>{monto}</Text>
    </View>
  );
}

function Bloque({ x, m }: { x: BloqueLiquidacion; m: (n: number) => string }) {
  return (
    <View style={{ marginTop: 6 }} wrap={false}>
      {x.filas.map((f, i) => (
        <Caja key={i} izquierda={f.izquierda} rotulo={f.concepto} monto={f.monto == null ? "" : m(f.monto)} rojo={f.monto != null && f.monto < 0} />
      ))}
      <Caja rotulo="TOTAL SALDO" monto={m(x.saldo)} sombra />
    </View>
  );
}
