import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { IDENTIDAD_SERIE, IGV } from "./series";

// Informe de cierre de ventas hacia Central. Calcado del documento que hoy
// arman a mano en Word: "INFORME OPEN Nº004-2026 - CONGELADOS Y FRESCOS
// S.A.C." (Descargas/PROYECTO CRM EFAMEINSA).
//
// Se respeta el orden y el vocabulario del original, porque Central lo lee
// todos los días y busca cada dato en su sitio: título con Nº y razón social,
// bloque Ref./Asunto/Fecha, tabla de equipos con desglose de IGV, el bloque
// gratuito, casillas de comprobante y de cliente nuevo/antiguo, los tres
// contactos, condiciones de pago con casillas, despacho, "Incluye:", y la
// firma del comercial.
//
// TRES ARREGLOS SOBRE EL ORIGINAL, todos deliberados:
//   · el encabezado de la tabla decía "P. UNITARIO + IGV" y "PRECIO TOTAL +
//     IGV", pero las cifras de abajo NO llevan IGV: en el modelo, 21.900 +
//     9.350 = 31.250, que es el SUB TOTAL al que después se le suma el 18 %
//     para llegar a 36.875. El rótulo estaba mal, no los números; acá dice
//     "P. UNITARIO US$". Si Central prefiere el texto de siempre, se cambia
//     en una línea.
//   · la numeración de secciones estaba rota (1. DATOS, 1. CONTACTOS, 2.
//     CONDICIONES, 3. Modalidad, 4. Fecha de entrega…) porque la numeración
//     automática de Word se descuadró. Acá va 1-2-3-4 corrido.
//   · el original deja las casillas vacías dibujadas al lado de la marcada;
//     acá se dibujan todas y se marca la que corresponde, que es lo mismo
//     pero sin depender de que alguien borre la casilla sobrante.
// Helvetica = fuente base de @react-pdf sin incrustar TTF (equivale a Arial).

const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#B9B4B2";
const FILA_GRIS = "#EDEAE9";

export interface ItemInforme {
  /** Descripción tal como va impresa, con sus saltos de línea (MARCA:, MODELO:, …). */
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export interface ContactoInforme {
  area?: string | null;
  nombre?: string | null;
  telefono?: string | null;
  correo?: string | null;
}

export interface InformeCierrePdfProps {
  logoBuffer: Buffer;
  serie: "EFAMEINSA" | "OPEN";
  /** "004-2026", o null mientras es borrador: el número se gasta al emitir. */
  codigo: string | null;
  fecha: string; // "05/08/2026"
  referencia: string;
  asunto: string;
  presupuestoRef: string | null;
  comprobante: "factura" | "boleta_ruc" | "boleta_dni";
  clienteNuevo: boolean;
  cliente: {
    nombre: string;
    doc: string | null;
    direccion: string | null;
    correo: string | null;
    ordenCompra: string | null;
  };
  contactoVenta: ContactoInforme;
  contactoContabilidad: ContactoInforme;
  contactoDespacho: ContactoInforme;
  modalidadPago: string[];
  formaPago: "transferencia" | "deposito" | null;
  moneda: string;
  notaCondiciones: string | null;
  /**
   * La garantía acordada, tal como va impresa (migración 0104). Hasta el 28-08
   * no era un campo: viajaba como el primer renglón de `incluye` —«36 meses de
   * garantía»— dentro de una lista plegada que el comercial no veía. NULL, o los
   * informes viejos que la llevan adentro de `incluye`, no imprimen esta línea.
   */
  garantia: string | null;
  entrega: {
    fecha: string | null;
    hora: string | null;
    lugar: string | null;
    direccion: string | null;
  };
  notaDespacho: string | null;
  urgente: boolean;
  incluye: string[];
  gratis: string | null;
  notaFinal: string | null;
  items: ItemInforme[];
  itemsGratuitos: ItemInforme[];
  /**
   * El expediente que acompaña al cierre (migración 0099). En el papel va solo
   * la LISTA: el PDF se imprime y se archiva, y embeber vouchers lo volvería
   * ilegible. Está para que Central sepa qué documentos existen y los busque
   * en el CRM — y para que se note cuando falta uno.
   */
  adjuntos: { etiqueta: string; nombre: string }[];
  firma: {
    nombre: string;
    telefono: string | null;
    celular: string | null;
    email: string | null;
  };
}

export const MODALIDADES_PAGO = ["CONTADO", "CREDITO", "50% ADELANTO", "50% CREDITO"] as const;

function crearEstilos(acento: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 92,
      paddingBottom: 70,
      paddingHorizontal: 48,
      fontSize: 9.5,
      fontFamily: "Helvetica",
      color: CARBON,
      lineHeight: 1.4,
    },

    membrete: { position: "absolute", top: 26, left: 48, right: 48 },
    membreteFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    logo: { width: 132 },
    wordmark: { fontSize: 15, fontFamily: "Helvetica-Bold", color: acento },
    membreteSub: { fontSize: 8, color: GRIS, marginTop: 2 },
    membreteLinea: { borderBottomWidth: 1.2, borderBottomColor: acento, marginTop: 5 },
    // OJO: el pie va anclado con `top`, no con `bottom`. En esta versión de
    // @react-pdf un bloque `fixed` posicionado con `bottom` se descarta SIN
    // error en cuanto su contenido necesita layout en fila (acá: dirección a la
    // izquierda y nº de página a la derecha) — el PDF sale sin pie y nada avisa.
    // Con `top` se dibuja siempre. 798 = 841,89 pt de alto del A4 menos los ~26
    // del margen inferior y los ~17 que mide el propio bloque.
    pie: { position: "absolute", top: 798, left: 48, right: 48, borderTopWidth: 0.8, borderTopColor: BORDE, paddingTop: 6 },
    pieFila: { flexDirection: "row", justifyContent: "space-between" },
    pieTexto: { fontSize: 8, color: GRIS },

    titulo: { textAlign: "center", fontSize: 11.5, fontFamily: "Helvetica-Bold", textDecoration: "underline", marginBottom: 16 },
    // Marca de agua del borrador: cruzada y en gris claro, de modo que si
    // alguien lo imprime o lo reenvía por error se vea de lejos que ese no es
    // el documento que recibió Central.
    marcaBorrador: {
      position: "absolute", top: 360, left: 0, right: 0, textAlign: "center",
      fontSize: 78, fontFamily: "Helvetica-Bold", color: "#E4E0DE", transform: "rotate(-28deg)",
    },

    /* Ref. / Asunto / Fecha: etiquetas en columna fija para que los dos
       puntos queden alineados, como en el original. */
    refFila: { flexDirection: "row", marginBottom: 3 },
    refEtiqueta: { width: 74, fontFamily: "Helvetica-Bold" },
    refValor: { flex: 1 },
    regla: { borderBottomWidth: 1, borderBottomColor: CARBON, marginTop: 10, marginBottom: 12 },

    entradilla: { marginBottom: 10, textAlign: "justify" },
    tablaTitulo: { fontFamily: "Helvetica-Bold", marginBottom: 5 },
    bloqueGratuito: { fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5 },

    tabla: { borderWidth: 0.8, borderColor: CARBON },
    thFila: { flexDirection: "row", backgroundColor: CARBON, color: "#FFFFFF" },
    th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 4, textAlign: "center" },
    tdFila: { flexDirection: "row", borderTopWidth: 0.8, borderTopColor: CARBON },
    td: { fontSize: 8.5, paddingVertical: 5, paddingHorizontal: 4 },
    cItem: { width: "8%", textAlign: "center", fontFamily: "Helvetica-Bold" },
    cDesc: { width: "48%" },
    cCant: { width: "10%", textAlign: "center" },
    cPrecio: { width: "17%", textAlign: "right" },
    cSub: { width: "17%", textAlign: "right" },
    totalFila: { flexDirection: "row", borderTopWidth: 0.8, borderTopColor: CARBON },
    totalEtiqueta: { width: "83%", fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "right", paddingVertical: 4, paddingHorizontal: 4 },
    totalValor: { width: "17%", fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "right", paddingVertical: 4, paddingHorizontal: 4 },
    totalDestacado: { backgroundColor: FILA_GRIS },

    seccion: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 7 },

    /* Casillas del original (BOLETA / FACTURA, CLIENTE NUEVO, pago) */
    casillasFila: { flexDirection: "row", gap: 22, marginBottom: 8 },
    casillaGrupo: { flexDirection: "row", alignItems: "center", gap: 5 },
    casilla: { width: 11, height: 11, borderWidth: 0.9, borderColor: CARBON, alignItems: "center", justifyContent: "center" },
    casillaMarca: { fontSize: 8, fontFamily: "Helvetica-Bold", lineHeight: 1 },
    casillaTexto: { fontSize: 8.5 },

    datoFila: { flexDirection: "row", marginBottom: 2 },
    datoEtiqueta: { width: 118, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
    datoValor: { flex: 1, fontSize: 8.5 },

    caja: { borderWidth: 0.8, borderColor: CARBON, padding: 6, marginBottom: 7 },
    cajaTitulo: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 2 },
    // Sin flex: dentro de una columna, flex:1 hace que cada línea intente
    // ocupar todo el alto de la caja y las tres terminan superpuestas.
    cajaLinea: { fontSize: 8.5 },

    pagoTabla: { borderWidth: 0.8, borderColor: CARBON, width: 230, marginBottom: 9 },
    pagoFila: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: CARBON },
    pagoUltima: { flexDirection: "row" },
    pagoTexto: { width: 175, fontSize: 8.5, paddingVertical: 3, paddingHorizontal: 5 },
    pagoMarca: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "center", paddingVertical: 3, borderLeftWidth: 0.8, borderLeftColor: CARBON },

    montoTotal: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 8 },
    /* Los cuatro campos que Central llena a mano cuando entra el pago. */
    blancoAviso: { fontSize: 7, color: GRIS, marginTop: 4, marginBottom: 2 },
    blancoFila: { flexDirection: "row", gap: 26, marginBottom: 3 },
    blancoEtiqueta: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
    blancoLinea: { flex: 1, borderBottomWidth: 0.6, borderBottomColor: BORDE, marginLeft: 4 },

    nota: { fontSize: 8.5, textAlign: "justify", marginTop: 4 },
    notaEtiqueta: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 8 },
    urgente: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#B3261E" },

    bullet: { flexDirection: "row", marginBottom: 2 },
    bulletMarca: { width: 14, fontFamily: "Helvetica-Bold" },
    bulletTexto: { flex: 1, fontSize: 8.5, textAlign: "justify" },

    gratis: { fontFamily: "Helvetica-Bold", marginTop: 10 },

    firmaBloque: { marginTop: 26, flexDirection: "row", gap: 14, alignItems: "flex-start" },
    firmaLogo: { width: 104 },
    firmaWordmark: { fontSize: 11, fontFamily: "Helvetica-Bold" },
    firmaDatos: { fontSize: 8.5 },
    firmaNombre: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  });
}

type Estilos = ReturnType<typeof crearEstilos>;

function Casilla({ estilos, marcada, texto }: { estilos: Estilos; marcada: boolean; texto: string }) {
  return (
    <View style={estilos.casillaGrupo}>
      <View style={estilos.casilla}>{marcada && <Text style={estilos.casillaMarca}>X</Text>}</View>
      <Text style={estilos.casillaTexto}>{texto}</Text>
    </View>
  );
}

function Contacto({ estilos, titulo, c }: { estilos: Estilos; titulo: string; c: ContactoInforme }) {
  return (
    <View style={estilos.caja}>
      <Text style={estilos.cajaTitulo}>
        {titulo}
        {c.area ? `: ${c.area}` : ""}
      </Text>
      <Text style={estilos.cajaLinea}>Nombres: {c.nombre || "—"}</Text>
      <Text style={estilos.cajaLinea}>Teléfono: {c.telefono || "—"}</Text>
      <Text style={estilos.cajaLinea}>Correo: {c.correo || "—"}</Text>
    </View>
  );
}

// La tabla se repite igual para la venta y para el bloque gratuito, con sus
// propios totales: en el original el "VENTA 2 – GRATUITO" también cierra con
// SUB TOTAL / IGV / TOTAL, aunque no se cobre.
function Tabla({ estilos, simbolo, lista }: { estilos: Estilos; simbolo: string; lista: ItemInforme[] }) {
  const subtotal = lista.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0);
  const igv = subtotal * IGV;
  return (
    <View style={estilos.tabla}>
      {/* Sin "+ IGV" en el rótulo: los importes de las filas van SIN IGV
          —se comprobó contra el modelo, donde suman el SUB TOTAL— y el
          impuesto se agrega recién en las tres filas de cierre. */}
      <View style={estilos.thFila}>
        <Text style={[estilos.th, estilos.cItem]}>ITEM</Text>
        <Text style={[estilos.th, estilos.cDesc]}>EQUIPOS</Text>
        <Text style={[estilos.th, estilos.cCant]}>CANTIDAD</Text>
        <Text style={[estilos.th, estilos.cPrecio]}>{`P. UNITARIO ${simbolo}`}</Text>
        <Text style={[estilos.th, estilos.cSub]}>{`PRECIO TOTAL ${simbolo}`}</Text>
      </View>
      {lista.map((it, i) => (
        <View key={i} style={estilos.tdFila} wrap={false}>
          <Text style={[estilos.td, estilos.cItem]}>{ROMANOS[i] ?? String(i + 1)}</Text>
          <Text style={[estilos.td, estilos.cDesc]}>{it.descripcion}</Text>
          <Text style={[estilos.td, estilos.cCant]}>{it.cantidad}</Text>
          <Text style={[estilos.td, estilos.cPrecio]}>{`${simbolo} ${monto(it.precio_unitario)}`}</Text>
          <Text style={[estilos.td, estilos.cSub]}>{`${simbolo} ${monto(it.cantidad * it.precio_unitario)}`}</Text>
        </View>
      ))}
      <View style={estilos.totalFila}>
        <Text style={estilos.totalEtiqueta}>SUB TOTAL</Text>
        <Text style={estilos.totalValor}>{`${simbolo} ${monto(subtotal)}`}</Text>
      </View>
      <View style={estilos.totalFila}>
        <Text style={estilos.totalEtiqueta}>IGV 18%</Text>
        <Text style={estilos.totalValor}>{`${simbolo} ${monto(igv)}`}</Text>
      </View>
      <View style={[estilos.totalFila, estilos.totalDestacado]}>
        <Text style={estilos.totalEtiqueta}>TOTAL incl. IGV</Text>
        <Text style={estilos.totalValor}>{`${simbolo} ${monto(subtotal + igv)}`}</Text>
      </View>
    </View>
  );
}

const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function monto(v: number): string {
  return v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InformeCierrePdf(props: InformeCierrePdfProps) {
  const {
    logoBuffer, serie, codigo, fecha, referencia, asunto, presupuestoRef,
    comprobante, clienteNuevo, cliente, contactoVenta, contactoContabilidad, contactoDespacho,
    modalidadPago, formaPago, moneda, notaCondiciones, garantia, entrega, notaDespacho, urgente,
    incluye, gratis, notaFinal, items, itemsGratuitos, adjuntos, firma,
  } = props;

  const identidad = IDENTIDAD_SERIE[serie];
  const estilos = crearEstilos(identidad.acento);
  const simbolo = moneda === "USD" ? "US$" : "S/";

  const totalVenta = items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) * (1 + IGV);

  // La tabla de modalidad de pago replica el formato de papel (4 casillas
  // fijas) a propósito — Central lo lee todos los días en el mismo sitio.
  // Pero la política real de la empresa tiene más combinaciones que esas 4
  // (Carlos, 21-08: "30% adelanto + 70% antes del despacho" no existía en la
  // lista, y esa misma semana aceptaron "50/35/15"). En vez de rediseñar la
  // tabla, cualquier modalidad marcada que no sea una de las 4 fijas se
  // imprime como fila adicional, siempre con "X" (si está en la lista es
  // porque se marcó o se escribió a propósito).
  const modalidadExtra = modalidadPago.filter(
    (m) => !MODALIDADES_PAGO.includes(m as (typeof MODALIDADES_PAGO)[number]),
  );
  const filasPago = [...MODALIDADES_PAGO, ...modalidadExtra];

  return (
    <Document
      title={`Informe ${serie} ${codigo ? `N${codigo}` : "(borrador)"} — ${asunto}`}
      author={firma.nombre}
      subject="Informe de cierre de ventas"
    >
      <Page size="A4" style={estilos.page}>
        <View style={estilos.membrete} fixed>
          <View style={estilos.membreteFila}>
            {identidad.usaLogo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
              <Image src={logoBuffer} style={estilos.logo} />
            ) : (
              <View>
                <Text style={estilos.wordmark}>{identidad.nombreLegal}</Text>
                <Text style={estilos.membreteSub}>{identidad.subtitulo}</Text>
              </View>
            )}
          </View>
          <View style={estilos.membreteLinea} />
        </View>

        <View style={estilos.pie} fixed>
          <View style={estilos.pieFila}>
            <Text style={estilos.pieTexto}>{identidad.pie[identidad.pie.length - 1]}</Text>
            <Text
              style={estilos.pieTexto}
              render={({ pageNumber }) => `${codigo ? `Informe Nº ${codigo}` : "BORRADOR sin numerar"} · pág. ${pageNumber}`}
            />
          </View>
        </View>

        {!codigo && (
          <Text style={estilos.marcaBorrador} fixed>
            BORRADOR
          </Text>
        )}

        <Text style={estilos.titulo}>
          {`INFORME Nº ${codigo ?? "(borrador, sin numerar)"} – VENTAS – ${identidad.nombreLegal.toUpperCase()}`}
        </Text>

        <View style={estilos.refFila}>
          <Text style={estilos.refEtiqueta}>Ref.</Text>
          <Text style={estilos.refValor}>: {referencia}</Text>
        </View>
        <View style={estilos.refFila}>
          <Text style={estilos.refEtiqueta}>Asunto</Text>
          <Text style={estilos.refValor}>: {asunto}</Text>
        </View>
        <View style={estilos.refFila}>
          <Text style={estilos.refEtiqueta}>Fecha</Text>
          <Text style={estilos.refValor}>: {fecha}</Text>
        </View>
        <View style={estilos.regla} />

        <Text style={estilos.entradilla}>
          A continuación, se detalla el depósito a ejecutarse para el {clienteNuevo ? "nuevo cliente" : "cliente"}.
        </Text>

        <Text style={estilos.tablaTitulo}>
          {presupuestoRef ? `Detalle del equipo según presupuesto ${presupuestoRef}` : "Detalle del equipo"}
        </Text>
        <Tabla estilos={estilos} simbolo={simbolo} lista={items} />

        {itemsGratuitos.length > 0 && (
          <>
            <Text style={estilos.bloqueGratuito}>VENTA 2 – GRATUITO</Text>
            <Tabla estilos={estilos} simbolo={simbolo} lista={itemsGratuitos} />
          </>
        )}

        <Text style={estilos.seccion}>1. DATOS DEL CLIENTE</Text>
        <View style={estilos.casillasFila}>
          <Casilla estilos={estilos} marcada={comprobante === "boleta_ruc"} texto="BOLETA CON RUC" />
          <Casilla estilos={estilos} marcada={comprobante === "boleta_dni"} texto="BOLETA CON DNI" />
          <Casilla estilos={estilos} marcada={comprobante === "factura"} texto="FACTURA" />
        </View>
        <View style={estilos.casillasFila}>
          <Casilla estilos={estilos} marcada={!clienteNuevo} texto="CLIENTE ANTIGUO" />
          <Casilla estilos={estilos} marcada={clienteNuevo} texto="CLIENTE NUEVO" />
        </View>
        {[
          ["CLIENTE:", cliente.nombre],
          ["RUC/DNI:", cliente.doc],
          ["DIRECCIÓN:", cliente.direccion],
          ["CORREO ELECTRÓNICO:", cliente.correo],
          ["Orden de compra:", cliente.ordenCompra],
        ].map(([etiqueta, valor]) => (
          <View key={etiqueta as string} style={estilos.datoFila}>
            <Text style={estilos.datoEtiqueta}>{etiqueta}</Text>
            <Text style={estilos.datoValor}>{valor || "—"}</Text>
          </View>
        ))}

        <Text style={estilos.seccion}>2. CONTACTOS</Text>
        <Contacto estilos={estilos} titulo="CONTACTO DE VENTA" c={contactoVenta} />
        <Contacto estilos={estilos} titulo="CONTACTO DE CONTABILIDAD Y FINANZAS" c={contactoContabilidad} />

        <Text style={estilos.seccion}>3. CONDICIONES DE VENTA</Text>
        <Text style={estilos.cajaTitulo}>Modalidad de pago:</Text>
        <View style={estilos.pagoTabla}>
          {filasPago.map((m, i) => (
            <View key={m} style={i === filasPago.length - 1 ? estilos.pagoUltima : estilos.pagoFila}>
              <Text style={estilos.pagoTexto}>{m}</Text>
              <Text style={estilos.pagoMarca}>{modalidadPago.includes(m) ? "X" : " "}</Text>
            </View>
          ))}
        </View>
        <View style={estilos.casillasFila}>
          <Casilla estilos={estilos} marcada={formaPago === "transferencia"} texto="Transferencia" />
          <Casilla estilos={estilos} marcada={formaPago === "deposito"} texto="Depósito" />
        </View>
        {/* La garantía, rotulada y con las condiciones de venta, que es donde
            Central y postventa la buscan: de acá sale el plazo que después
            fija `garantia_hasta` de cada equipo instalado. Antes estaba al
            final del documento, como un renglón más de «Incluye» (28-08). */}
        {garantia && (
          <View style={estilos.datoFila}>
            <Text style={estilos.datoEtiqueta}>Garantía:</Text>
            <Text style={estilos.datoValor}>{garantia}</Text>
          </View>
        )}
        <Text style={estilos.montoTotal}>{`MONTO TOTAL VENTA ${simbolo} ${monto(totalVenta)}`}</Text>
        {/* Estas cuatro casillas quedan en blanco a propósito: las llena
            Central cuando el pago entra. El rótulo se agregó el 24-08 porque
            sin él parecían campos que el CRM había dejado de imprimir —
            Darwin lo leyó así probando el 23-08: «número de operación tampoco
            sale, banco tampoco sale». */}
        <Text style={estilos.blancoAviso}>A llenar por Central cuando se confirme el pago:</Text>
        <View style={estilos.blancoFila}>
          <Text style={estilos.blancoEtiqueta}>Banco:</Text>
          <View style={estilos.blancoLinea} />
          <Text style={estilos.blancoEtiqueta}>Fecha:</Text>
          <View style={estilos.blancoLinea} />
        </View>
        <View style={estilos.blancoFila}>
          <Text style={estilos.blancoEtiqueta}>Nº OP:</Text>
          <View style={estilos.blancoLinea} />
          <Text style={estilos.blancoEtiqueta}>Monto:</Text>
          <View style={estilos.blancoLinea} />
        </View>
        {notaCondiciones && (
          <>
            <Text style={estilos.notaEtiqueta}>NOTA SOBRE CONDICIONES DE VENTA:</Text>
            <Text style={estilos.nota}>{notaCondiciones}</Text>
          </>
        )}

        <Text style={estilos.seccion}>4. PARA DESPACHO</Text>
        {urgente && <Text style={estilos.urgente}>PEDIDO URGENTE</Text>}
        {[
          ["Fecha de entrega:", entrega.fecha],
          ["Hora de entrega:", entrega.hora],
          ["Lugar de entrega:", entrega.lugar],
          ["Dirección final:", entrega.direccion],
        ].map(([etiqueta, valor]) => (
          <View key={etiqueta as string} style={estilos.datoFila}>
            <Text style={estilos.datoEtiqueta}>{etiqueta}</Text>
            <Text style={estilos.datoValor}>{valor || "—"}</Text>
          </View>
        ))}
        <View style={{ marginTop: 6 }}>
          <Contacto estilos={estilos} titulo="CONTACTO DE DESPACHO" c={contactoDespacho} />
        </View>
        {notaDespacho && (
          <>
            <Text style={estilos.notaEtiqueta}>NOTA SOBRE DESPACHO/LOGÍSTICA Y POST VENTA:</Text>
            <Text style={estilos.nota}>{notaDespacho}</Text>
          </>
        )}

        {incluye.length > 0 && (
          <>
            <Text style={estilos.notaEtiqueta}>Incluye:</Text>
            {incluye.map((linea, i) => (
              <View key={i} style={estilos.bullet}>
                <Text style={estilos.bulletMarca}>•</Text>
                <Text style={estilos.bulletTexto}>{linea}</Text>
              </View>
            ))}
          </>
        )}

        {notaFinal && (
          <>
            <Text style={estilos.notaEtiqueta}>Nota:</Text>
            <Text style={estilos.nota}>{notaFinal}</Text>
          </>
        )}

        {gratis && <Text style={estilos.gratis}>GRATIS: {gratis}</Text>}

        {/* El expediente digital. Va la lista, no los archivos: este PDF se
            imprime y se archiva, y pegarle vouchers lo volvería ilegible.
            Sirve para que Central sepa qué existe —y para que se note cuando
            falta algo (migración 0099). */}
        {adjuntos.length > 0 && (
          <>
            <Text style={estilos.notaEtiqueta}>Documentos adjuntos (en el CRM):</Text>
            {adjuntos.map((a, i) => (
              <View key={i} style={estilos.bullet}>
                <Text style={estilos.bulletMarca}>•</Text>
                <Text style={estilos.bulletTexto}>
                  {a.etiqueta}: {a.nombre}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={estilos.firmaBloque} wrap={false}>
          {identidad.usaLogo ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
            <Image src={logoBuffer} style={estilos.firmaLogo} />
          ) : (
            <Text style={estilos.firmaWordmark}>{identidad.nombreLegal}</Text>
          )}
          <View>
            <Text style={estilos.firmaNombre}>{firma.nombre}</Text>
            <Text style={estilos.firmaDatos}>Área Comercial</Text>
            {firma.telefono && <Text style={estilos.firmaDatos}>Teléfono : {firma.telefono}</Text>}
            {firma.celular && <Text style={estilos.firmaDatos}>Celular : {firma.celular}</Text>}
            {firma.email && <Text style={estilos.firmaDatos}>Email : {firma.email}</Text>}
          </View>
        </View>
      </Page>
    </Document>
  );
}
