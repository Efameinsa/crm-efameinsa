import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { CierreMensual } from "@/lib/cierre-mensual";

/**
 * El cierre del mes del comercial, en una hoja (dos si el mes fue bueno).
 *
 * Pedido del ing. Carlos, 31-08: «que los comerciales también puedan descargar
 * su reporte mensual». Es el hermano mayor del cierre semanal y por eso se
 * dibuja IGUAL —granate de marca, secciones con cabecera, Helvetica, el
 * balance grande arriba—: son documentos de la misma familia, el comercial los
 * manda por el mismo correo y gerencia los lee uno detrás del otro.
 *
 * LO QUE CAMBIA respecto del semanal es contra qué se mide. La semana se
 * compara contra lo que el comercial se comprometió a cerrar; el mes, contra
 * la META de gerencia. Si no hay meta cargada, el balance lo dice y no se
 * inventa ninguna.
 *
 * LAS GESTIONES VAN SIEMPRE CON SUS DOS NÚMEROS —«14 efectivas de 20
 * gestiones»— porque mostrar uno solo fue exactamente lo que hizo que la
 * agenda diaria y el cierre semanal se contradijeran (backlog 31-08, B6).
 */

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const VERDE = "#1E7F4F";
const BORDE = "#D8D4D3";
const FILA_GRIS = "#F4F2F1";

const e = StyleSheet.create({
  // ⚠️ SIN `lineHeight` en la página, y no es un olvido. Con `lineHeight` en el
  // estilo de `<Page>`, @react-pdf 4.6 deja de dibujar los bloques `fixed`
  // posicionados en absoluto: por eso el reporte diario y el cierre semanal
  // salen HOY sin su pie y sin numeración de páginas —está escrito en los dos
  // archivos y no se imprime nunca—. Verificado el 31-08 aislando el caso: la
  // misma página con `lineHeight: 1.35` pierde el pie y sin él lo conserva. Acá
  // el interlineado se pone en los párrafos que lo necesitan (`aviso`,
  // `veredicto`, `vacio`), que son los únicos textos que ocupan más de una
  // línea. Los otros dos documentos habría que corregirlos igual.
  pagina: { paddingTop: 32, paddingBottom: 52, paddingHorizontal: 40, fontSize: 8.5, color: CARBON, fontFamily: "Helvetica" },
  cabecera: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  logo: { width: 132 },
  tituloBloque: { alignItems: "flex-end" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GRANATE },
  subtitulo: { fontSize: 9, color: GRIS, marginTop: 2 },
  comercial: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },

  aviso: { borderWidth: 1, borderColor: GRANATE, borderRadius: 4, padding: 8, marginBottom: 10, fontSize: 9, lineHeight: 1.35, color: GRANATE, textAlign: "center" },

  balance: { borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 12, marginBottom: 10 },
  balanceFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  balanceCol: { alignItems: "center", flex: 1 },
  balanceEtiqueta: { fontSize: 7, color: GRIS, textTransform: "uppercase", letterSpacing: 0.4 },
  balanceValor: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 3 },
  balanceSigno: { fontSize: 15, color: GRIS, paddingHorizontal: 6, paddingBottom: 3 },
  veredicto: { marginTop: 9, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: BORDE, fontSize: 9, lineHeight: 1.35, textAlign: "center" },

  barra: { marginTop: 9, height: 7, backgroundColor: FILA_GRIS, borderRadius: 3 },
  barraLlena: { height: 7, borderRadius: 3 },
  barraPie: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  barraTexto: { fontSize: 6.5, color: GRIS },

  tarjetas: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tarjeta: { flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 7 },
  tarjetaEtiqueta: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3 },
  tarjetaValor: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tarjetaPie: { fontSize: 6.5, color: GRIS, marginTop: 1 },

  seccion: { marginTop: 10 },
  seccionCabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: GRANATE, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 2 },
  seccionTitulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF", letterSpacing: 0.3 },
  seccionTotal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },

  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDE, paddingVertical: 4.5, paddingHorizontal: 5 },
  filaAlterna: { backgroundColor: FILA_GRIS },
  th: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: BORDE },
  thTexto: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  vacio: { fontSize: 8, lineHeight: 1.35, color: GRIS, fontStyle: "italic", paddingVertical: 7, paddingHorizontal: 5 },

  pie: { position: "absolute", bottom: 26, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: BORDE, paddingTop: 5 },
  pieTexto: { fontSize: 6.5, color: GRIS },
});

const usd = (n: number) => `US$ ${Math.round(n).toLocaleString("es-PE")}`;
const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const ETAPA: Record<string, string> = {
  potencial: "Negociación",
  cotizada: "Cotizada",
  seguimiento: "Seguimiento",
  asignada: "Asignada",
  filtrada: "Filtrada",
};

/** Cuántas oportunidades abiertas se listan antes de resumir el resto. */
const TOPE_ABIERTAS = 18;
/** Cuántas ventas se listan antes de resumir el resto. */
const TOPE_VENTAS = 25;

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

export function CierreMensualPdf({ logoBuffer, cierre }: { logoBuffer: Buffer; cierre: CierreMensual }) {
  const { comercial, gestiones, cotizaciones, ventas, meta, semanas, abiertas } = cierre;
  const hayMeta = meta.montoUsd != null;
  const cumplio = hayMeta && (meta.faltaUsd ?? 0) <= 0;
  // La barra se corta en 100%: pasada la meta el mensaje lo dice con palabras,
  // y una barra que se sale del cuadro se ve como un error de dibujo.
  const avance = Math.max(0, Math.min(1, meta.avance ?? 0));

  return (
    <Document title={`Reporte mensual ${comercial.codigo ?? ""} ${cierre.mes}`} author="CRM Efameinsa">
      <Page size="A4" style={e.pagina}>
        <View style={e.cabecera}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
          <Image style={e.logo} src={logoBuffer} />
          <View style={e.tituloBloque}>
            <Text style={e.titulo}>REPORTE MENSUAL</Text>
            <Text style={e.subtitulo}>{cierre.rotulo}</Text>
            <Text style={e.comercial}>
              {comercial.codigo ? `${comercial.codigo} · ` : ""}
              {comercial.nombre}
            </Text>
          </View>
        </View>

        {/* Un mes en blanco también se entrega: el documento tiene que poder
            decir «no hubo nada», que es justo la conversación que gerencia
            quiere tener. */}
        {cierre.sinActividad && (
          <Text style={e.aviso}>
            En {cierre.rotulo.toLowerCase()} no se registró ninguna gestión, ninguna cotización enviada ni ninguna venta
            en el CRM.
          </Text>
        )}

        {/* Lo único que hay que leer: la meta contra lo vendido. */}
        <View style={e.balance}>
          {hayMeta ? (
            <>
              <View style={e.balanceFila}>
                <View style={e.balanceCol}>
                  <Text style={e.balanceEtiqueta}>Meta del mes</Text>
                  <Text style={e.balanceValor}>{usd(meta.montoUsd!)}</Text>
                </View>
                {/* Guion normal, no el signo «menos» tipográfico: Helvetica de
                    @react-pdf no lo tiene y desaparece sin dar error. Así sale
                    hoy el cierre semanal, con la resta sin el signo del medio. */}
                <Text style={e.balanceSigno}>-</Text>
                <View style={e.balanceCol}>
                  <Text style={e.balanceEtiqueta}>Vendido</Text>
                  <Text style={[e.balanceValor, { color: ventas.montoUsd > 0 ? VERDE : GRIS }]}>
                    {usd(ventas.montoUsd)}
                  </Text>
                </View>
                <Text style={e.balanceSigno}>=</Text>
                <View style={e.balanceCol}>
                  <Text style={e.balanceEtiqueta}>{cumplio ? "A favor" : "Falta"}</Text>
                  <Text style={[e.balanceValor, { color: cumplio ? VERDE : GRANATE }]}>
                    {usd(Math.abs(meta.faltaUsd ?? 0))}
                  </Text>
                </View>
              </View>
              <View style={e.barra}>
                <View style={[e.barraLlena, { width: `${(avance * 100).toFixed(1)}%`, backgroundColor: cumplio ? VERDE : GRANATE }]} />
              </View>
              <View style={e.barraPie}>
                <Text style={e.barraTexto}>{Math.round((meta.avance ?? 0) * 100)}% de la meta</Text>
                <Text style={e.barraTexto}>{usd(meta.montoUsd!)}</Text>
              </View>
              <Text style={e.veredicto}>
                {cumplio
                  ? `Cumplió la meta del mes${(meta.faltaUsd ?? 0) < 0 ? ` y la superó en ${usd(Math.abs(meta.faltaUsd!))}` : ""}.`
                  : `Quedó a ${usd(meta.faltaUsd ?? 0)} de la meta del mes.`}
              </Text>
            </>
          ) : (
            <>
              <View style={e.balanceFila}>
                <View style={e.balanceCol}>
                  <Text style={e.balanceEtiqueta}>Vendido en el mes</Text>
                  <Text style={[e.balanceValor, { color: ventas.montoUsd > 0 ? VERDE : GRIS }]}>
                    {usd(ventas.montoUsd)}
                  </Text>
                </View>
              </View>
              {/* Sin meta cargada no se estima ninguna: un número inventado
                  acá se convierte en la vara con la que se juzga a una
                  persona. */}
              <Text style={e.veredicto}>
                Esta cuenta no tiene meta mensual cargada, así que no hay contra qué comparar lo vendido. La fija
                gerencia en el perfil del comercial.
              </Text>
            </>
          )}
        </View>

        <View style={e.tarjetas}>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Gestiones efectivas</Text>
            <Text style={e.tarjetaValor}>{gestiones.efectivas}</Text>
            <Text style={e.tarjetaPie}>de {gestiones.total} gestiones</Text>
          </View>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Cotizaciones enviadas</Text>
            <Text style={e.tarjetaValor}>{cotizaciones.cantidad}</Text>
            <Text style={e.tarjetaPie}>{usd(cotizaciones.montoUsd)}</Text>
          </View>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Ventas cerradas</Text>
            <Text style={e.tarjetaValor}>{ventas.cantidad}</Text>
            <Text style={e.tarjetaPie}>{usd(ventas.montoUsd)}</Text>
          </View>
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Sigue abierto</Text>
            <Text style={e.tarjetaValor}>{abiertas.cantidad}</Text>
            <Text style={e.tarjetaPie}>{usd(abiertas.montoUsd)}</Text>
          </View>
        </View>

        {/* «Cada semana cómo te vas acercando a tu meta» (ing. Carlos, 31-08):
            el mes no se lee de un saque, se lee viendo dónde se cayó. */}
        <Seccion titulo="1. SEMANA POR SEMANA" total={usd(ventas.montoUsd)}>
          <View style={e.th}>
            <Text style={[e.thTexto, { width: "22%" }]}>Semana</Text>
            <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Gestiones</Text>
            <Text style={[e.thTexto, { width: "12%", textAlign: "right" }]}>Cotiz.</Text>
            <Text style={[e.thTexto, { width: "23%", textAlign: "right" }]}>Cotizado</Text>
            <Text style={[e.thTexto, { width: "23%", textAlign: "right" }]}>Vendido</Text>
          </View>
          {semanas.map((s, i) => (
            <View key={s.desde} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
              <Text style={{ width: "22%" }}>{s.etiqueta}</Text>
              <Text style={{ width: "20%", textAlign: "right", color: s.gestiones === 0 ? GRANATE : CARBON }}>
                {s.gestiones === 0 ? "—" : `${s.efectivas} de ${s.gestiones}`}
              </Text>
              <Text style={{ width: "12%", textAlign: "right", color: GRIS }}>{s.cotizaciones || "—"}</Text>
              <Text style={{ width: "23%", textAlign: "right", color: GRIS }}>
                {s.cotizadoUsd > 0 ? usd(s.cotizadoUsd) : "—"}
              </Text>
              <Text style={{ width: "23%", textAlign: "right", color: s.vendidoUsd > 0 ? VERDE : GRIS }}>
                {s.vendidoUsd > 0 ? usd(s.vendidoUsd) : "—"}
              </Text>
            </View>
          ))}
          <View style={[e.fila, { borderTopWidth: 1, borderTopColor: GRANATE }]} wrap={false}>
            <Text style={{ width: "22%", fontFamily: "Helvetica-Bold" }}>TOTAL DEL MES</Text>
            <Text style={{ width: "20%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>
              {gestiones.efectivas} de {gestiones.total}
            </Text>
            <Text style={{ width: "12%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>
              {cotizaciones.cantidad}
            </Text>
            <Text style={{ width: "23%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>
              {usd(cotizaciones.montoUsd)}
            </Text>
            <Text style={{ width: "23%", textAlign: "right", fontFamily: "Helvetica-Bold", color: VERDE }}>
              {usd(ventas.montoUsd)}
            </Text>
          </View>
        </Seccion>

        {/* Efectivas contra intentos, por tipo: es la diferencia entre marcar
            el teléfono y hablar con el cliente. */}
        <Seccion titulo="2. LAS GESTIONES DEL MES" total={`${gestiones.efectivas} de ${gestiones.total}`}>
          {gestiones.total === 0 ? (
            <Text style={e.vacio}>No se registró ninguna gestión de contacto en el mes.</Text>
          ) : (
            <>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "40%" }]}>Tipo de gestión</Text>
                <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Efectivas</Text>
                <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Sin contacto</Text>
                <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Total</Text>
              </View>
              {gestiones.porTipo.map((t, i) => (
                <View key={t.tipo} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "40%" }}>{t.etiqueta}</Text>
                  <Text style={{ width: "20%", textAlign: "right", color: VERDE }}>{t.efectivas}</Text>
                  <Text style={{ width: "20%", textAlign: "right", color: GRIS }}>{t.total - t.efectivas}</Text>
                  <Text style={{ width: "20%", textAlign: "right" }}>{t.total}</Text>
                </View>
              ))}
              <Text style={e.vacio}>
                Efectiva es la gestión en la que hubo contacto con el cliente; el resto son intentos en los que no
                contestó. Se cuentan por quien las hizo y en hora de Lima, igual que el reporte diario.
              </Text>
            </>
          )}
        </Seccion>

        <Seccion titulo="3. LO QUE SE CERRÓ" total={usd(ventas.montoUsd)}>
          {ventas.detalle.length === 0 ? (
            <Text style={e.vacio}>No se cerró ninguna venta en el mes.</Text>
          ) : (
            <>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "15%" }]}>Fecha</Text>
                <Text style={[e.thTexto, { width: "60%" }]}>Cliente</Text>
                <Text style={[e.thTexto, { width: "25%", textAlign: "right" }]}>Monto</Text>
              </View>
              {ventas.detalle.slice(0, TOPE_VENTAS).map((v, i) => (
                <View key={`${v.fecha}-${i}`} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "15%", color: GRIS }}>{diaMes(v.fecha)}</Text>
                  <Text style={{ width: "60%", paddingRight: 6 }}>{corta(v.cliente, 58)}</Text>
                  <Text style={{ width: "25%", textAlign: "right" }}>{usd(v.montoUsd)}</Text>
                </View>
              ))}
              {ventas.detalle.length > TOPE_VENTAS && (
                <Text style={e.vacio}>…y {ventas.detalle.length - TOPE_VENTAS} venta(s) más, ya sumadas al total.</Text>
              )}
            </>
          )}
        </Seccion>

        {/* Con qué se entra al mes siguiente. */}
        <Seccion titulo="4. LO QUE QUEDA ABIERTO" total={usd(abiertas.montoUsd)}>
          {abiertas.detalle.length === 0 ? (
            <Text style={e.vacio}>
              No queda ninguna oportunidad cotizada ni en negociación: el mes que viene empieza de cero.
            </Text>
          ) : (
            <>
              <Text style={e.vacio}>
                {abiertas.cantidad} oportunidad(es) vivas al cerrar el mes —cotizadas o en negociación— por{" "}
                {usd(abiertas.montoUsd)}. Es con lo que se entra al mes siguiente.
              </Text>
              <View style={e.th}>
                <Text style={[e.thTexto, { width: "45%" }]}>Cliente</Text>
                <Text style={[e.thTexto, { width: "17%" }]}>Presupuesto</Text>
                <Text style={[e.thTexto, { width: "18%" }]}>Estado</Text>
                <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Monto</Text>
              </View>
              {abiertas.detalle.slice(0, TOPE_ABIERTAS).map((a, i) => (
                <View key={`${a.cliente}-${i}`} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "45%", paddingRight: 6 }}>{corta(a.cliente, 44)}</Text>
                  <Text style={{ width: "17%", color: GRIS }}>{a.presupuesto ?? "—"}</Text>
                  <Text style={{ width: "18%", color: GRIS }}>{ETAPA[a.etapa] ?? a.etapa}</Text>
                  <Text style={{ width: "20%", textAlign: "right" }}>{usd(a.montoUsd)}</Text>
                </View>
              ))}
              {abiertas.detalle.length > TOPE_ABIERTAS && (
                <Text style={e.vacio}>
                  …y {abiertas.detalle.length - TOPE_ABIERTAS} más, ya sumadas al total. Están todas en «Mis
                  oportunidades».
                </Text>
              )}
            </>
          )}
        </Seccion>

        {/* El pie se repite en todas las páginas. Que llegue a dibujarse
            depende de que la página NO lleve `lineHeight` — ver la nota del
            estilo, arriba. */}
        <View style={e.pie} fixed>
          <Text style={e.pieTexto}>Generado automáticamente por el CRM de Efameinsa</Text>
          <Text style={e.pieTexto} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
