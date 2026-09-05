import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { CierreSemanal } from "@/lib/cierre-semanal";

/**
 * El cierre de la semana, en una hoja.
 *
 * Pedido del ing. Carlos, 27-08. Lo que él quiere leer es UNA cosa —«dijiste
 * que ibas a vender 300.000; vendido cero; debe menos 300.000»— así que ese
 * contraste va arriba y en grande, y todo lo demás está para explicarlo.
 *
 * Mismo lenguaje visual que el reporte diario (granate de marca, secciones con
 * cabecera, Helvetica): son dos documentos de la misma familia y el comercial
 * los manda por el mismo correo.
 */

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const VERDE = "#1E7F4F";
const BORDE = "#D8D4D3";
const FILA_GRIS = "#F4F2F1";

const e = StyleSheet.create({
  pagina: { paddingTop: 32, paddingBottom: 52, paddingHorizontal: 40, fontSize: 8.5, lineHeight: 1.35, color: CARBON, fontFamily: "Helvetica" },
  cabecera: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  logo: { width: 132 },
  tituloBloque: { alignItems: "flex-end" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GRANATE },
  subtitulo: { fontSize: 9, color: GRIS, marginTop: 2 },
  comercial: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },

  balance: { borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 12, marginBottom: 10 },
  balanceFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  balanceCol: { alignItems: "center", flex: 1 },
  balanceEtiqueta: { fontSize: 7, color: GRIS, textTransform: "uppercase", letterSpacing: 0.4 },
  balanceValor: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 3 },
  balanceSigno: { fontSize: 15, color: GRIS, paddingHorizontal: 6, paddingBottom: 3 },
  veredicto: { marginTop: 9, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: BORDE, fontSize: 9, textAlign: "center" },

  tarjetas: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tarjeta: { flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 7 },
  tarjetaEtiqueta: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3 },
  tarjetaValor: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },

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

  // La declaración de la semana (0177). Va arriba y con marco: es lo que
  // gerencia lee el lunes a primera hora, no un anexo.
  declaracion: { borderWidth: 1.2, borderColor: GRANATE, borderRadius: 4, padding: 10, marginBottom: 12 },
  declaracionTitulo: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GRANATE, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  declaracionEtiqueta: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 5 },
  declaracionTexto: { fontSize: 9, marginTop: 2 },
  declaracionFalta: { fontSize: 8.5, color: GRANATE, fontStyle: "italic" },
});

const usd = (n: number) => `US$ ${Math.round(n).toLocaleString("es-PE")}`;
const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Seccion({ titulo, total, children }: { titulo: string; total: string | number; children: React.ReactNode }) {
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

export function CierreSemanalPdf({ logoBuffer, rango, cierre }: { logoBuffer: Buffer; rango: string; cierre: CierreSemanal }) {
  const { comercial, dias, proyectadoUsd, vendidoUsd, diferenciaUsd, ventas, proyeccion } = cierre;
  const cumplio = diferenciaUsd >= 0;
  // Sin nada proyectado, «cumplió» no significa nada: no se puede cumplir una
  // promesa que no se hizo, y decir que sí sería premiar la semana en blanco.
  const sinProyeccion = proyectadoUsd === 0;

  return (
    <Document title={`Cierre semanal ${comercial.codigo ?? ""} ${cierre.lunes}`} author="CRM Efameinsa">
      <Page size="A4" style={e.pagina}>
        <View style={e.cabecera}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
          <Image style={e.logo} src={logoBuffer} />
          <View style={e.tituloBloque}>
            <Text style={e.titulo}>CIERRE SEMANAL</Text>
            <Text style={e.subtitulo}>{rango}</Text>
            <Text style={e.comercial}>
              {comercial.codigo ? `${comercial.codigo} · ` : ""}
              {comercial.nombre}
            </Text>
          </View>
        </View>

        {/* Lo único que hay que leer: lo prometido contra lo hecho. */}
        <View style={e.balance}>
          <View style={e.balanceFila}>
            <View style={e.balanceCol}>
              <Text style={e.balanceEtiqueta}>Proyectado</Text>
              <Text style={e.balanceValor}>{usd(proyectadoUsd)}</Text>
            </View>
            <Text style={e.balanceSigno}>−</Text>
            <View style={e.balanceCol}>
              <Text style={e.balanceEtiqueta}>Vendido</Text>
              <Text style={[e.balanceValor, { color: vendidoUsd > 0 ? VERDE : GRIS }]}>{usd(vendidoUsd)}</Text>
            </View>
            <Text style={e.balanceSigno}>=</Text>
            <View style={e.balanceCol}>
              <Text style={e.balanceEtiqueta}>{cumplio ? "A favor" : "Debe"}</Text>
              <Text style={[e.balanceValor, { color: cumplio ? VERDE : GRANATE }]}>
                {diferenciaUsd < 0 ? `− ${usd(Math.abs(diferenciaUsd))}` : usd(diferenciaUsd)}
              </Text>
            </View>
          </View>
          <Text style={e.veredicto}>
            {sinProyeccion
              ? "No se proyectó nada para esta semana: sin compromiso no hay con qué comparar lo vendido."
              : cumplio
                ? `Cumplió lo que proyectó para la semana${diferenciaUsd > 0 ? ` y lo superó en ${usd(diferenciaUsd)}` : ""}.`
                : `Quedó debiendo ${usd(Math.abs(diferenciaUsd))} de lo que se comprometió a cerrar esta semana.`}
          </Text>
        </View>

        <View style={e.tarjetas}>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Contactos con cliente</Text>
            <Text style={e.tarjetaValor}>{cierre.gestiones}</Text>
          </View>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Cotizaciones enviadas</Text>
            <Text style={e.tarjetaValor}>{cierre.cotizacionesEnviadas}</Text>
          </View>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Monto cotizado</Text>
            <Text style={e.tarjetaValor}>{usd(cierre.cotizadoUsd)}</Text>
          </View>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Ventas cerradas</Text>
            <Text style={e.tarjetaValor}>{ventas.length}</Text>
          </View>
        </View>

        {/* LO QUE DIJO EL COMERCIAL. Carlos, 02-09: «abajo, o si quieres
            arriba, donde sea visual: en qué te estás comprometiendo, qué
            necesitas y qué te compromete para la siguiente semana». Va arriba,
            porque es lo que se conversa el lunes; los números ya se leyeron. */}
        <View style={e.declaracion}>
          <Text style={e.declaracionTitulo}>Para la semana que viene</Text>
          {cierre.declaracion ? (
            <>
              <Text style={e.declaracionEtiqueta}>Se compromete a</Text>
              <Text style={e.declaracionTexto}>{cierre.declaracion.compromiso}</Text>
              <Text style={e.declaracionEtiqueta}>Necesita</Text>
              <Text style={e.declaracionTexto}>
                {cierre.declaracion.sinNecesidades
                  ? "Nada esta semana."
                  : (cierre.declaracion.necesidades ?? "—")}
              </Text>
            </>
          ) : (
            <Text style={e.declaracionFalta}>
              Sin declarar. El compromiso y las necesidades se escriben al cerrar la semana, desde el CRM.
            </Text>
          )}
        </View>

        <Seccion titulo="1. DÍA POR DÍA" total={usd(vendidoUsd)}>
          <View style={e.th}>
            <Text style={[e.thTexto, { width: "28%" }]}>Día</Text>
            <Text style={[e.thTexto, { width: "16%", textAlign: "right" }]}>Gestiones</Text>
            <Text style={[e.thTexto, { width: "28%", textAlign: "right" }]}>Proyectado</Text>
            <Text style={[e.thTexto, { width: "28%", textAlign: "right" }]}>Vendido</Text>
          </View>
          {dias.map((d, i) => (
            <View key={d.iso} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
              <Text style={{ width: "28%" }}>{d.etiqueta}</Text>
              <Text style={{ width: "16%", textAlign: "right", color: d.gestiones === 0 ? GRANATE : CARBON }}>
                {d.gestiones}
              </Text>
              <Text style={{ width: "28%", textAlign: "right", color: GRIS }}>
                {d.proyectado > 0 ? usd(d.proyectado) : "—"}
              </Text>
              <Text style={{ width: "28%", textAlign: "right", color: d.vendido > 0 ? VERDE : GRIS }}>
                {d.vendido > 0 ? usd(d.vendido) : "—"}
              </Text>
            </View>
          ))}
          <View style={[e.fila, { borderTopWidth: 1, borderTopColor: GRANATE }]} wrap={false}>
            <Text style={{ width: "44%", fontFamily: "Helvetica-Bold" }}>TOTAL DE LA SEMANA</Text>
            <Text style={{ width: "28%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>{usd(proyectadoUsd)}</Text>
            <Text style={{ width: "28%", textAlign: "right", fontFamily: "Helvetica-Bold", color: VERDE }}>
              {usd(vendidoUsd)}
            </Text>
          </View>
        </Seccion>

        <Seccion titulo="2. LO QUE SE CERRÓ" total={ventas.length}>
          {ventas.length === 0 ? (
            <Text style={e.vacio}>No se cerró ninguna venta esta semana.</Text>
          ) : (
            <>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "18%" }]}>Fecha</Text>
                <Text style={[e.thTexto, { width: "57%" }]}>Cliente</Text>
                <Text style={[e.thTexto, { width: "25%", textAlign: "right" }]}>Monto</Text>
              </View>
              {ventas.map((v, i) => (
                <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "18%", color: GRIS }}>{v.fecha.slice(8, 10)}/{v.fecha.slice(5, 7)}</Text>
                  <Text style={{ width: "57%", paddingRight: 6 }}>{corta(v.cliente, 56)}</Text>
                  <Text style={{ width: "25%", textAlign: "right" }}>{usd(v.montoUsd)}</Text>
                </View>
              ))}
            </>
          )}
        </Seccion>

        {/* «Qué hiciste y qué DEJASTE de hacer» (ing. Carlos). Lo prometido que
            no se cerró es la mitad de la conversación del sábado. */}
        <Seccion titulo="3. LO QUE QUEDÓ PENDIENTE" total={usd(proyeccion.totalPorUbicar)}>
          {proyeccion.porUbicar.length === 0 ? (
            <Text style={e.vacio}>Todo lo que está en negociación tiene fecha de cierre asignada.</Text>
          ) : (
            <>
              <Text style={e.vacio}>
                {proyeccion.porUbicar.length} oportunidad(es) en negociación sin fecha de cierre. Mientras no la tengan,
                no entran en la proyección de ninguna semana.
              </Text>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "60%" }]}>Cliente</Text>
                <Text style={[e.thTexto, { width: "15%" }]}>Presupuesto</Text>
                <Text style={[e.thTexto, { width: "25%", textAlign: "right" }]}>Monto</Text>
              </View>
              {proyeccion.porUbicar.slice(0, 15).map((c, i) => (
                <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "60%", paddingRight: 6 }}>{corta(c.cliente, 58)}</Text>
                  <Text style={{ width: "15%", color: GRIS }}>{c.presupuesto ?? "—"}</Text>
                  <Text style={{ width: "25%", textAlign: "right" }}>{usd(c.monto)}</Text>
                </View>
              ))}
              {proyeccion.porUbicar.length > 15 && (
                <Text style={e.vacio}>…y {proyeccion.porUbicar.length - 15} más.</Text>
              )}
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
