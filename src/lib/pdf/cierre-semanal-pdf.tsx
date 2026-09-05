import { Document, Page, View, Text, Image, StyleSheet, Svg, Path } from "@react-pdf/renderer";
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
  aviso: { marginTop: 6, fontSize: 8, color: GRANATE, textAlign: "center", lineHeight: 1.3 },

  tarjetas: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tarjeta: { flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 4, padding: 7 },
  tarjetaEtiqueta: { fontSize: 6.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.3 },
  tarjetaValor: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tarjetaPie: { fontSize: 7, color: GRIS, marginTop: 2 },
  // La barrita de cumplimiento: se ve de un vistazo si llegó o no.
  barraFondo: { height: 3, backgroundColor: "#E8E4E3", borderRadius: 2, marginTop: 4 },
  barraLlena: { height: 3, borderRadius: 2 },

  veredictoCaja: { borderWidth: 1, borderRadius: 4, padding: 8, marginBottom: 12, flexDirection: "row", alignItems: "center" },
  puntoEstado: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  veredictoTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", marginRight: 5 },
  veredictoFrase: { fontSize: 8.5, color: CARBON, flex: 1 },

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

  // Los rechazados de la semana: la torta a la izquierda, la leyenda al lado.
  torta: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 5 },
  leyenda: { flex: 1, paddingLeft: 14 },
  leyendaFila: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  leyendaColor: { width: 7, height: 7, borderRadius: 1.5, marginRight: 5 },
  leyendaTexto: { fontSize: 8, flex: 1 },
  leyendaN: { fontSize: 8, fontFamily: "Helvetica-Bold" },
});

/** Colores de la torta: el granate manda y el resto acompaña sin competir. */
const COLORES_TORTA = ["#7E1210", "#B4524A", "#D68C86", "#8C7F7D", "#C4BBB9", "#5E6470", "#9AA3B0", "#E0DAD8"];

/**
 * Un sector de torta sobre un lienzo de 120×120, empezando arriba y girando en
 * sentido horario. `desde` y `hasta` van de 0 a 1.
 */
function sector(desde: number, hasta: number): string {
  const R = 52;
  const C = 60;
  // Un sector que cubre la torta entera no se dibuja con un solo arco: se
  // cierra sobre sí mismo y no pinta nada. Se parte en dos medios arcos.
  if (hasta - desde >= 0.9999) {
    return "M " + C + " " + (C - R) + " A " + R + " " + R + " 0 1 1 " + C + " " + (C + R) +
           " A " + R + " " + R + " 0 1 1 " + C + " " + (C - R) + " Z";
  }
  const a1 = 2 * Math.PI * desde - Math.PI / 2;
  const a2 = 2 * Math.PI * hasta - Math.PI / 2;
  const x1 = (C + R * Math.cos(a1)).toFixed(2);
  const y1 = (C + R * Math.sin(a1)).toFixed(2);
  const x2 = (C + R * Math.cos(a2)).toFixed(2);
  const y2 = (C + R * Math.sin(a2)).toFixed(2);
  const grande = hasta - desde > 0.5 ? 1 : 0;
  return "M " + C + " " + C + " L " + x1 + " " + y1 +
         " A " + R + " " + R + " 0 " + grande + " 1 " + x2 + " " + y2 + " Z";
}

/** Verde cumplió, ámbar cerca, granate lejos. El color es la primera lectura. */
const COLOR_ESTADO: Record<string, string> = {
  cumplio: VERDE,
  cerca: "#B07A0C",
  lejos: GRANATE,
  sin_meta: GRIS,
};

/**
 * Un número con su meta, su porcentaje y su barra.
 *
 * Sin meta cargada no se inventa ninguna: se muestra el número solo y se dice
 * que no hay contra qué compararlo. Un porcentaje falso es peor que ninguno.
 */
function Medidor({
  etiqueta,
  m,
  texto,
  textoMeta,
}: {
  etiqueta: string;
  m: { logrado: number; meta: number | null; porcentaje: number | null; estado: string };
  texto?: string;
  textoMeta?: string | null;
}) {
  const color = COLOR_ESTADO[m.estado] ?? GRIS;
  return (
    <View style={e.tarjeta}>
      <Text style={e.tarjetaEtiqueta}>{etiqueta}</Text>
      <Text style={[e.tarjetaValor, { color }]}>{texto ?? m.logrado}</Text>
      {m.meta != null && m.porcentaje != null ? (
        <>
          <Text style={e.tarjetaPie}>
            de {textoMeta ?? m.meta} · {Math.round(m.porcentaje * 100)}%
          </Text>
          <View style={e.barraFondo}>
            <View style={[e.barraLlena, { width: `${Math.min(Math.round(m.porcentaje * 100), 100)}%`, backgroundColor: color }]} />
          </View>
        </>
      ) : (
        <Text style={e.tarjetaPie}>sin meta cargada</Text>
      )}
    </View>
  );
}

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
          {/* CUANDO LA PROYECCIÓN ESTÁ VACÍA, EL CONTRASTE MIENTE. Carlos,
              05-09: «mi venta está hecha una maravilla, he vendido 14.000,
              proyectado 1.700, a favor… pero acá tú no me estás diciendo nada».
              Si lo proyectado no llega ni a un tercio de la meta semanal, se
              dice en el mismo recuadro: el problema no es la venta, es que no
              se está proyectando. */}
          {cierre.medidas.venta.meta != null && proyectadoUsd < cierre.medidas.venta.meta * 0.33 && (
            <Text style={e.aviso}>
              Ojo: solo se proyectó {usd(proyectadoUsd)} para una meta semanal de {usd(cierre.medidas.venta.meta)}. El
              contraste de arriba dice poco mientras las oportunidades en negociación no tengan fecha de cierre.
            </Text>
          )}
        </View>

        {/* CADA NÚMERO CONTRA SU META. Carlos, 05-09, mirando este mismo
            documento: «contacto con clientes, sí, ¿pero de cuántos? (…) acá me
            dice que está todo bien: voy a ir a hacer fiesta hoy día. Falta
            compararlo con algo. Dime qué tengo que mejorar». */}
        <View style={e.tarjetas}>
          <Medidor etiqueta="Contactos con cliente" m={cierre.medidas.gestiones} />
          <Medidor etiqueta="Cotizaciones enviadas" m={cierre.medidas.cotizaciones} />
          <Medidor
            etiqueta="Vendido"
            m={cierre.medidas.venta}
            texto={usd(cierre.medidas.venta.logrado)}
            textoMeta={cierre.medidas.venta.meta ? usd(cierre.medidas.venta.meta) : null}
          />
          <View style={e.tarjeta}>
            <Text style={e.tarjetaEtiqueta}>Monto cotizado</Text>
            <Text style={e.tarjetaValor}>{usd(cierre.cotizadoUsd)}</Text>
            <Text style={e.tarjetaPie}>{ventas.length} venta(s) cerrada(s)</Text>
          </View>
        </View>

        {/* La frase que cierra. «No es darle con palo, sino ver tu realidad.» */}
        <View style={[e.veredictoCaja, { borderColor: COLOR_ESTADO[cierre.veredicto.estado] }]}>
          <View style={[e.puntoEstado, { backgroundColor: COLOR_ESTADO[cierre.veredicto.estado] }]} />
          <Text style={[e.veredictoTitulo, { color: COLOR_ESTADO[cierre.veredicto.estado] }]}>
            {cierre.veredicto.titulo}.
          </Text>
          <Text style={e.veredictoFrase}>{cierre.veredicto.frase}</Text>
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

        {/* LO QUE SE PERDIÓ. Carlos, 02-09: «esos rechazados podríamos ponerlo
            también en el cierre semanal (…) un gráfico de torta, y que salga el
            detalle. No que se despliegue: que salga». Y para qué: «de los
            errores uno aprende, pero yo no quiero aprender nada más, tiene que
            aprender todo el equipo». Por eso el detalle va entero y a la vista:
            el lunes se conversa cliente por cliente. */}
        <Seccion titulo="4. LO QUE SE PERDIÓ, Y POR QUÉ" total={cierre.rechazos.length}>
          {cierre.rechazos.length === 0 ? (
            <Text style={e.vacio}>Ninguna oportunidad se dio por perdida esta semana.</Text>
          ) : (
            <>
              {(() => {
                const porMotivo = new Map<string, number>();
                for (const r of cierre.rechazos) porMotivo.set(r.motivo, (porMotivo.get(r.motivo) ?? 0) + 1);
                const motivos = Array.from(porMotivo.entries()).sort((a, b) => b[1] - a[1]);
                const total = cierre.rechazos.length;
                let acumulado = 0;
                const sectores = motivos.map(([motivo, n], i) => {
                  const desde = acumulado / total;
                  acumulado += n;
                  return { motivo, n, i, d: sector(desde, acumulado / total) };
                });
                return (
                  <View style={e.torta}>
                    <Svg width={120} height={120} viewBox="0 0 120 120">
                      {sectores.map((s) => (
                        <Path key={s.motivo} d={s.d} fill={COLORES_TORTA[s.i % COLORES_TORTA.length]} />
                      ))}
                    </Svg>
                    <View style={e.leyenda}>
                      {sectores.map((s) => (
                        <View key={s.motivo} style={e.leyendaFila}>
                          <View style={[e.leyendaColor, { backgroundColor: COLORES_TORTA[s.i % COLORES_TORTA.length] }]} />
                          <Text style={e.leyendaTexto}>{corta(s.motivo, 44)}</Text>
                          <Text style={e.leyendaN}>
                            {s.n} · {Math.round((s.n / total) * 100)}%
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}

              <View style={e.th}>
                <Text style={[e.thTexto, { width: "45%" }]}>Cliente</Text>
                <Text style={[e.thTexto, { width: "35%" }]}>Motivo</Text>
                <Text style={[e.thTexto, { width: "20%", textAlign: "right" }]}>Monto</Text>
              </View>
              {cierre.rechazos.map((r, i) => (
                <View key={i} wrap={false} style={[e.fila, ...(i % 2 ? [e.filaAlterna] : [])]}>
                  <Text style={{ width: "45%", paddingRight: 6 }}>{corta(r.cliente, 44)}</Text>
                  <Text style={{ width: "35%", paddingRight: 6, color: GRIS }}>{corta(r.motivo, 34)}</Text>
                  <Text style={{ width: "20%", textAlign: "right" }}>{r.monto > 0 ? usd(r.monto) : "—"}</Text>
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
