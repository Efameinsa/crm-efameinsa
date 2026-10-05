import { Document, Page, View, Text, Image, StyleSheet, Svg, Path } from "@react-pdf/renderer";
import { IDENTIDAD_SERIE, notasDe, esSinGarantia } from "./series";
import { totalesConIgv } from "@/lib/igv";
import {
  crearEstilos,
  formatoMonto,
  membreteDe,
  pieDe,
  tablaCuentasDe,
  ROMANOS,
  type CotizacionPdfProps,
  type BloqueFicha,
} from "./cotizacion-pdf";
import {
  NOTAS_MANTENIMIENTO,
  NOTAS_REPUESTOS,
  lineasDelConcepto,
  lugarDeEjecucion,
  tituloDelDetalle,
  type VariantePostventa,
} from "./formato-postventa";

/**
 * LA COTIZACIÓN DE POSTVENTA, calcada de los dos Word oficiales que dio Santos
 * el 28-09: repuestos («Presu_2196-26, TOMY JIRO EIRL») y mantenimiento
 * («MINERIA SINGULARIDAD»).
 *
 * Es una carta de corrido, no el documento de equipos: una sola tabla
 * ITEM | CONCEPTO | CANT | PRECIO UNITARIO | SUB-TOTAL con los totales en
 * gris, las condiciones de ejecución, las notas de postventa y —en el
 * mantenimiento— el detalle de trabajos de cada servicio con sus ✓. Membrete,
 * pie, letra, cuentas y firma son los mismos del PDF de equipos
 * (cotizacion-pdf.tsx): cambia el cuerpo, no la papelería.
 */

const NEGRO = "#000000";
// El gris de las filas de encabezado y totales del Word (#AEAAAA en la tabla
// de TOMY JIRO), un punto más claro para que el texto negro se lea impreso.
const GRIS_TABLA = "#BFBBBB";
const LINEA = 0.7;

const pv = StyleSheet.create({
  parrafo: { textAlign: "justify", marginBottom: 12 },
  // Cada renglón con su recuadro entero, montado sobre el anterior (como
  // filaDetalle): dentro de un recuadro común, una tabla que casi llenaba la
  // hoja saltaba entera a la siguiente y dejaba la primera en blanco
  // (Tomy Jiro, 12 ítems, 29-09).
  tablaFin: { marginBottom: 14 },
  fila: { flexDirection: "row", borderWidth: LINEA, borderColor: NEGRO, marginTop: -LINEA },
  // En el detalle de trabajos cada fila lleva su recuadro entero y se monta
  // una línea sobre la anterior: la tabla es larga y se corta entre hojas, y
  // así la hoja que la corta queda cerrada abajo y la siguiente abre arriba.
  filaDetalle: { flexDirection: "row", borderWidth: LINEA, borderColor: NEGRO, marginTop: -LINEA },
  filaEncabezado: { flexDirection: "row", backgroundColor: GRIS_TABLA, borderWidth: LINEA, borderColor: NEGRO },
  th: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NEGRO, paddingVertical: 4, paddingHorizontal: 4, textAlign: "center", lineHeight: 1.2 },
  td: { fontSize: 9, color: NEGRO, paddingVertical: 4, paddingHorizontal: 4, lineHeight: 1.3 },
  celdaCentrada: { justifyContent: "center", alignItems: "center" },
  divisor: { borderLeftWidth: LINEA, borderLeftColor: NEGRO },
  cItem: { width: "8%" },
  cConcepto: { width: "44%" },
  cCant: { width: "9%" },
  cPrecio: { width: "19.5%" },
  cSub: { width: "19.5%" },
  totalEtiqueta: { width: "80.5%", fontSize: 9, fontFamily: "Helvetica-Bold", color: NEGRO, textAlign: "right", paddingVertical: 3, paddingHorizontal: 5 },
  totalValor: { width: "19.5%", fontSize: 9, fontFamily: "Helvetica-Bold", color: NEGRO, textAlign: "center", paddingVertical: 3, paddingHorizontal: 4 },

  condicion: { flexDirection: "row", marginBottom: 5 },
  condicionRotulo: { width: 118, fontSize: 9, fontFamily: "Helvetica-Bold" },
  condicionValor: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold" },

  notaTitulo: { fontSize: 9.5, fontFamily: "Helvetica-Bold", textDecoration: "underline", marginBottom: 6, marginLeft: 16 },
  vineta: { flexDirection: "row", marginBottom: 2, paddingLeft: 16 },
  vinetaPunto: { width: 16, fontSize: 8.5 },
  vinetaTexto: { flex: 1, fontSize: 8.5, textAlign: "justify", lineHeight: 1.35 },

  // Detalle de trabajos del mantenimiento: ITEM | DESCRIPCIÓN | ✓
  detalleTitulo: { textAlign: "center", fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 8, lineHeight: 1.3 },
  dItem: { width: "13%" },
  dDesc: { width: "70%" },
  dCheck: { width: "17%" },
  dTexto: { fontSize: 9, color: NEGRO, paddingVertical: 3, paddingHorizontal: 5, lineHeight: 1.25, textAlign: "justify" },

  empresa: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  validez: { textAlign: "center", fontSize: 11, fontFamily: "Helvetica-Bold", textDecoration: "underline", marginTop: 16, marginBottom: 14 },
});

/**
 * El ✓ del Word, dibujado. Helvetica —la letra del PDF, sin fuentes
 * incrustadas— no tiene ese carácter (WinAnsi no lo trae) y salía un cuadrito
 * vacío; un trazo de 11 pt se imprime igual en cualquier visor.
 */
function Visto() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path d="M3.5 12.5 L9 18.5 L20.5 4.5" stroke={NEGRO} strokeWidth={2.6} fill="none" />
    </Svg>
  );
}

/** Una fila del detalle de trabajos, ya interpretada desde los bloques de la ficha. */
type FilaDetalle = { numero: string | null; texto: string; sistema: boolean };

/**
 * Los bloques de la ficha de un servicio (ficha-servicio.mjs) como filas de la
 * tabla del Word: «1. Exteriores» es el sistema 1 en negrita con su ✓, sus
 * tareas van debajo, y un sub-sistema sin número («Descarga») también lleva ✓.
 * El título «TRABAJOS QUE INCLUYE EL SERVICIO» es del catálogo, no del papel.
 */
export function filasDelDetalle(bloques: BloqueFicha[]): FilaDetalle[] {
  const filas: FilaDetalle[] = [];
  for (const b of bloques) {
    if (b.t === "titulo") continue;
    if (b.t === "subtitulo") {
      const m = b.texto.match(/^(\d{1,2})\.\s*(.+)$/);
      filas.push(m ? { numero: m[1], texto: m[2], sistema: true } : { numero: null, texto: b.texto, sistema: true });
    } else if (b.t === "dato") {
      filas.push({ numero: null, texto: `${b.rotulo}: ${b.valor}`, sistema: false });
    } else {
      filas.push({ numero: null, texto: b.texto, sistema: false });
    }
  }
  // Tres fichas de LG semi industrial (GIANT, TITAN) traen arriba del sistema
  // 1 la cabecera de su tabla leída como texto —«ITEM I: LAVADORA…», «ITEM»,
  // «DESCRIPCIÓN DE ACTIVIDADES…»—: en el papel eso ya lo dice el título.
  const primero = filas.findIndex((f) => f.numero !== null);
  return primero > 0 ? filas.slice(primero) : filas;
}

export function CotizacionPostventaPdf({
  variante,
  logoBuffer,
  serie,
  numeroDocumento,
  fecha,
  cliente,
  items,
  moneda,
  condiciones,
  vigenciaDias,
  entregaLugar,
  tiempoEntrega,
  garantia,
  formaPago,
  saldo,
  firma,
  notaVersion = null,
  reemplazada = false,
  sinMontos = false,
  notasPdf = null,
}: CotizacionPdfProps & { variante: VariantePostventa }) {
  const identidad = IDENTIDAD_SERIE[serie];
  const estilos = crearEstilos(identidad.acento);
  const membrete = membreteDe(estilos, identidad, logoBuffer);
  const pie = pieDe(estilos, identidad, serie, notaVersion, reemplazada);
  const esMantenimiento = variante === "mantenimiento";

  // «USD$ 125.00 + IGV» en cada renglón y «USD$ 405.00» en los totales, como
  // el Word. En soles, «S/». Con las cifras tapadas (gerencia, 28-09) va el
  // símbolo con asteriscos: se sigue viendo en qué moneda se cotizó.
  const simbolo = moneda === "USD" ? "USD$" : "S/";
  const encabezadoMoneda = moneda === "USD" ? "U$D" : "S/";
  const monto = (v: number) => `${simbolo} ${sinMontos ? "*****" : formatoMonto(v)}`;
  // La misma regla de plata que el PDF de equipos: con renglones pactados CON
  // IGV, el total es la suma de sus brutos y el IGV la diferencia (0233).
  const { subtotal, igv, total } = totalesConIgv(items);
  // Repuestos numera 1, 2, 3; mantenimiento I, II (los dos Word).
  const numero = (i: number) => (esMantenimiento ? (ROMANOS[i] ?? String(i + 1)) : String(i + 1));

  // Lugar, tiempo y forma de pago, en el orden del Word de repuestos. Lo que
  // no se acordó no ocupa renglón. El saldo va con la forma de pago: el Word
  // no tiene renglón propio y perderlo dejaría el pago a medias.
  const pago = [formaPago?.trim(), saldo?.trim() ? `saldo ${saldo.trim()}` : null].filter(Boolean).join("; ");
  const ejecucion = (
    [
      ["Lugar de ejecución", lugarDeEjecucion(entregaLugar)],
      ["Tiempo de ejecución", tiempoEntrega?.trim() || null],
      ["Forma de pago", pago || null],
      // LA GARANTÍA QUE SE MARCÓ (Gabriela, 29-09: «en el borrador sigue
      // saliendo en condiciones comerciales diferente a lo que se marca»).
      // El formato de postventa no la imprimía y la nota de garantía salía
      // aunque fuera «Sin garantía». Y «Sin garantía» tampoco va escrito: no
      // se le ofrece al cliente lo que no se da (Gabriela, 03-10).
      ["Garantía", esSinGarantia(garantia) ? null : garantia?.trim() || null],
    ] as [string, string | null][]
  ).filter((c): c is [string, string] => Boolean(c[1]));

  // El detalle de trabajos sale de la ficha del servicio del catálogo (los 61
  // SERMAT… cargados de los Word de P:, 25-09). Un servicio escrito a mano no
  // tiene ficha y queda solo en la tabla de precios.
  const detalles = esMantenimiento
    ? items
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => item.segmento === "servicio" && (item.bloques?.length ?? 0) > 0)
    : [];

  // «Sin garantía»: la nota de cómo se conserva la garantía no va.
  const sinGarantia = esSinGarantia(garantia);
  const notaGarantia = sinGarantia ? [] : [notasDe(serie)[1]];

  const vinetas = (lista: string[]) =>
    lista.map((n, i) => (
      <View key={i} style={pv.vineta} wrap={false}>
        <Text style={pv.vinetaPunto}>•</Text>
        <Text style={pv.vinetaTexto}>{n}</Text>
      </View>
    ));

  // Nombre y RUC de la cuenta, y la tabla de bancos de la serie. EFAMEINSA no
  // tiene cuentas cargadas (series.ts): ahí no se imprime nada, igual que en
  // el PDF de equipos.
  const cuentas = identidad.cuentasBancarias && (
    <View wrap={false} style={{ marginTop: 10 }}>
      <Text style={pv.empresa}>NOMBRE: {identidad.cuentasBancarias.titular}</Text>
      <Text style={[pv.empresa, { marginBottom: 10 }]}>RUC: {identidad.cuentasBancarias.ruc}</Text>
      {tablaCuentasDe(estilos, identidad.cuentasBancarias.cuentas)}
    </View>
  );

  // ── Cierre y firma: logo de la serie a la izquierda, datos a la derecha ──
  // Va DENTRO del mismo bloque que la validez y la nota (Santos, 05-10: «ten
  // criterio visual»): sola, la firma se iba a una hoja casi vacía; así baja
  // acompañada y la hoja de antes cierra con la tabla de cuentas.
  const cierre = (
    <View style={{ marginTop: 20 }}>
      <Text style={{ marginBottom: 8 }}>
        Agradeciendo su atención a la presente, quedamos de ustedes a la espera de su apreciable orden.
      </Text>
      <Text>Atentamente.</Text>

      <View style={[estilos.firmaBloque, { gap: 28 }]}>
        {identidad.usaLogo ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
          <Image src={logoBuffer} style={[estilos.firmaLogo, { width: 150 }]} />
        ) : (
          <View>
            <Text style={[estilos.firmaWordmark, { color: identidad.acento, fontSize: 14 }]}>{identidad.nombreLegal}</Text>
            <Text style={estilos.membreteSub}>{identidad.subtitulo}</Text>
          </View>
        )}
        <View style={estilos.firmaDatos}>
          <Text style={estilos.negrita}>{firma.nombre}</Text>
          <Text style={[estilos.negrita, { marginBottom: 4 }]}>{firma.cargo ?? "Post Venta"}</Text>
          {firma.telefono && <Text>Teléfono : {firma.telefono}</Text>}
          {firma.celular && <Text>Celular : {firma.celular}</Text>}
          {firma.email && <Text style={{ marginTop: 4 }}>Email : {firma.email}</Text>}
        </View>
      </View>
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={estilos.page}>
        {membrete}
        {pie}

        <Text style={estilos.titulo}>
          {numeroDocumento ? `COTIZACION N° ${numeroDocumento}` : "COTIZACION — BORRADOR SIN NUMERAR"}
        </Text>
        {reemplazada && notaVersion && (
          <Text style={estilos.avisoReemplazada}>{`${notaVersion.toUpperCase()} — NO ES LA COTIZACIÓN FINAL`}</Text>
        )}
        {/* «Setiembre», como se escribe en el Perú y en los Word de postventa. */}
        <Text style={estilos.fecha}>Lima, {fecha.replace(/septiembre/i, "setiembre")}</Text>

        <View style={estilos.clienteBloque}>
          <Text>Señores:</Text>
          <Text style={estilos.negrita}>{cliente.razon_social}</Text>
          {cliente.direccion && <Text>{cliente.direccion}</Text>}
          {cliente.telefono && <Text style={estilos.negrita}>Teléfono: {cliente.telefono}</Text>}
          {cliente.email && <Text style={estilos.negrita}>Correo: {cliente.email}</Text>}
        </View>

        {cliente.atencion && <Text style={estilos.atencion}>Atención: {cliente.atencion}</Text>}

        <Text style={pv.parrafo}>
          Por medio de la presente nos es grato hacer llegar nuestros saludos y a la vez presentar la siguiente
          propuesta técnica económica del servicio:
        </Text>

        {/* ── ITEM. | CONCEPTO | CANT | PRECIO UNITARIO | SUB-TOTAL ── */}
        <>
          <View style={pv.filaEncabezado} wrap={false}>
            <Text style={[pv.th, pv.cItem]}>ITEM.</Text>
            <Text style={[pv.th, pv.cConcepto, pv.divisor]}>CONCEPTO</Text>
            <Text style={[pv.th, pv.cCant, pv.divisor]}>CANT</Text>
            <Text style={[pv.th, pv.cPrecio, pv.divisor]}>{`PRECIO UNITARIO\n${encabezadoMoneda}`}</Text>
            <Text style={[pv.th, pv.cSub, pv.divisor]}>{`SUB-TOTAL\n${encabezadoMoneda}`}</Text>
          </View>
          {items.map((item, i) => {
            const lineas = lineasDelConcepto({
              nombre: item.nombre,
              marca: item.marca,
              modelo: item.modelo,
              capacidad: item.capacidad,
              descripcionLinea: item.descripcionLinea,
              deCatalogo: item.marca !== "—" || item.modelo !== "—" || Boolean(item.segmento),
            });
            return (
              <View key={i} style={pv.fila} wrap={false}>
                <View style={[pv.cItem, pv.celdaCentrada]}>
                  <Text style={[pv.td, { textAlign: "center" }]}>{numero(i)}</Text>
                </View>
                <View style={[pv.cConcepto, pv.divisor]}>
                  <Text style={[pv.td, esMantenimiento ? { fontFamily: "Helvetica-Bold" } : {}]}>
                    {lineas.map((l) => l.toUpperCase()).join("\n")}
                  </Text>
                </View>
                <View style={[pv.cCant, pv.divisor, pv.celdaCentrada]}>
                  <Text style={[pv.td, { textAlign: "center" }]}>{String(item.cantidad).padStart(2, "0")}</Text>
                </View>
                <View style={[pv.cPrecio, pv.divisor, pv.celdaCentrada]}>
                  <Text style={[pv.td, { textAlign: "center" }]}>{monto(item.precio_unitario)} + IGV</Text>
                </View>
                <View style={[pv.cSub, pv.divisor, pv.celdaCentrada]}>
                  <Text style={[pv.td, { textAlign: "center" }]}>{monto(item.cantidad * item.precio_unitario)} + IGV</Text>
                </View>
              </View>
            );
          })}
          {(
            [
              ["SUB TOTAL", subtotal],
              ["I.G.V. (18%)", igv],
              ["TOTAL", total],
            ] as [string, number][]
          ).map(([rotulo, valor]) => (
            <View key={rotulo} style={[pv.fila, { backgroundColor: GRIS_TABLA }]} wrap={false}>
              <Text style={pv.totalEtiqueta}>{rotulo}</Text>
              <Text style={[pv.totalValor, pv.divisor]}>{monto(valor)}</Text>
            </View>
          ))}
          <View style={pv.tablaFin} />
        </>

        {/* ── Lugar, tiempo y forma de pago ── */}
        {(ejecucion.length > 0 || condiciones) && (
          <View wrap={false} style={{ marginTop: 6, marginBottom: 8 }}>
            {ejecucion.map(([rotulo, valor]) => (
              <View key={rotulo} style={pv.condicion}>
                <Text style={pv.condicionRotulo}>{rotulo}</Text>
                <Text style={pv.condicionValor}>: {valor}</Text>
              </View>
            ))}
            {condiciones && <Text style={[pv.parrafo, { fontSize: 9, marginTop: 4 }]}>{condiciones}</Text>}
          </View>
        )}

        {esMantenimiento ? (
          <>
            {/* Lo que incluye el servicio, antes del detalle de cada equipo. */}
            <View style={{ marginTop: 6 }}>
              <Text style={pv.notaTitulo} minPresenceAhead={40}>
                Nota:
              </Text>
              {/* Escrita para esta cotización si postventa la cambió (Gabriela, 05-10). */}
              {vinetas(notasPdf ?? NOTAS_MANTENIMIENTO)}
            </View>

            {/* ── ITEM I: DETALLE DEL SERVICIO… — un cuadro por servicio con ficha ── */}
            {detalles.map(({ item, i }) => {
              const filas = filasDelDetalle(item.bloques ?? []);
              const fila = (f: (typeof filas)[number], k: number) => (
                // Un sistema no se queda solo al pie de la hoja: se lleva
                // al menos su primera tarea a la siguiente.
                <View key={k} style={pv.filaDetalle} wrap={false} minPresenceAhead={f.sistema ? 24 : undefined}>
                  <Text style={[pv.dTexto, pv.dItem, { fontFamily: "Helvetica-Bold", textAlign: "center" }]}>{f.numero ?? ""}</Text>
                  <Text style={[pv.dTexto, pv.dDesc, pv.divisor, f.sistema ? { fontFamily: "Helvetica-Bold" } : {}]}>{f.texto}</Text>
                  <View style={[pv.dCheck, pv.divisor, pv.celdaCentrada]}>{f.sistema && <Visto />}</View>
                </View>
              );
              // EL TÍTULO NO SE QUEDA SOLO AL PIE (Santos, 05-10, con la foto
              // de un PDF donde «ITEM I: DETALLE DEL SERVICIO…» y la cabecera
              // de la tabla cerraban la hoja y las tareas empezaban en la
              // otra). Título, cabecera y las primeras filas son un solo
              // bloque: si no entran juntos, pasan juntos a la hoja siguiente.
              const juntas = 4;
              return (
                <View key={i} style={{ marginTop: 14 }}>
                  <View wrap={false}>
                    <Text style={pv.detalleTitulo}>
                      ITEM {numero(i)}: {tituloDelDetalle(item.nombre)}
                    </Text>
                    <View style={{ paddingTop: LINEA }}>
                      <View style={pv.filaDetalle}>
                        <Text style={[pv.dTexto, pv.dItem, { fontFamily: "Helvetica-Bold", textAlign: "center" }]}>ITEM</Text>
                        <Text style={[pv.dTexto, pv.dDesc, pv.divisor, { fontFamily: "Helvetica-Bold", textAlign: "center" }]}>
                          DESCRIPCIÓN
                        </Text>
                        <View style={[pv.dCheck, pv.divisor]} />
                      </View>
                      {filas.slice(0, juntas).map(fila)}
                    </View>
                  </View>
                  {filas.slice(juntas).map((f, k) => fila(f, k + juntas))}
                </View>
              );
            })}

            <View style={{ marginTop: 16 }}>{cuentas}</View>

            <View wrap={false}>
              <Text style={pv.validez}>Validez de cotización ({vigenciaDias} días)</Text>
              <Text style={pv.notaTitulo}>Nota:</Text>
              {vinetas(sinGarantia ? [notasDe(serie)[0]] : notasDe(serie))}
              {cierre}
            </View>
          </>
        ) : (
          <>
            {cuentas}
            {/* La validez va pegada a su nota: sola al pie de una hoja se lee
                como un cierre y la nota queda huérfana en la siguiente. */}
            <View wrap={false}>
              <Text style={pv.validez}>VALIDEZ DE LA COTIZACION: {vigenciaDias} DIAS</Text>
              <Text style={pv.notaTitulo}>Nota:</Text>
              {/* La garantía es la de la serie —con el nombre de quien cotiza
                  (gerencia, 25-09)—; las otras tres son las del Word. */}
              {vinetas([...notaGarantia, ...(notasPdf ?? NOTAS_REPUESTOS)])}
              {cierre}
            </View>
          </>
        )}

      </Page>
    </Document>
  );
}

