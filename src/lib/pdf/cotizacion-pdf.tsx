import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { IDENTIDAD_SERIE, PUNTOS_IMPORTANTES, NOTAS, IGV } from "./series";

// Estructura calcada de las cotizaciones reales de ambas razones sociales
// (Descargas/PROYECTO CRM EFAMEINSA/modelos de cotizacion): carta formal con
// membrete por serie, bloque del cliente, tabla de ítems con desglose de IGV,
// ficha técnica por equipo, condiciones, cuentas bancarias (OPEN),
// "Importante:"/"Nota:" y firma del comercial.
// Helvetica = fuente base de @react-pdf sin incrustar TTF (equivalente a Arial).

const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#B9B4B2";
const FILA_GRIS = "#EDEAE9";

export interface ItemPdf {
  nombre: string;
  marca: string;
  modelo: string;
  capacidad: string | null;
  categoria: string | null;
  caracteristicas: string[];
  cantidad: number;
  precio_unitario: number;
}

export interface CotizacionPdfProps {
  logoBuffer: Buffer;
  serie: "EFAMEINSA" | "OPEN";
  numeroDocumento: string; // "5-26" (correlativo-año corto, como los modelos)
  fecha: string; // "14 de agosto de 2026"
  cliente: {
    razon_social: string;
    tipo_doc: string;
    num_doc: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    atencion: string | null;
  };
  items: ItemPdf[];
  moneda: string;
  condiciones: string | null;
  vigenciaDias: number;
  firma: {
    nombre: string;
    telefono: string | null;
    celular: string | null;
    email: string | null;
  };
}

function crearEstilos(acento: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 92,
      paddingBottom: 78,
      paddingHorizontal: 48,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: CARBON,
      lineHeight: 1.45,
    },

    /* Membrete y pie (fijos en todas las páginas) */
    membrete: { position: "absolute", top: 26, left: 48, right: 48 },
    membreteFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    logo: { width: 132 },
    wordmark: { fontSize: 15, fontFamily: "Helvetica-Bold", color: acento },
    membreteSub: { fontSize: 8, color: GRIS, marginTop: 2 },
    membreteLinea: { borderBottomWidth: 1.2, borderBottomColor: acento, marginTop: 5 },
    pie: { position: "absolute", bottom: 26, left: 48, right: 48, borderTopWidth: 0.8, borderTopColor: BORDE, paddingTop: 6 },
    pieWeb: { fontSize: 9, fontFamily: "Helvetica-Bold", color: acento },
    pieTexto: { fontSize: 8, color: GRIS },

    /* Encabezado de la carta */
    titulo: {
      textAlign: "center",
      fontSize: 12,
      fontFamily: "Helvetica-Bold",
      textDecoration: "underline",
      marginBottom: 16,
    },
    fecha: { marginBottom: 14 },
    clienteBloque: { marginBottom: 10 },
    negrita: { fontFamily: "Helvetica-Bold" },
    atencion: { fontFamily: "Helvetica-Bold", marginBottom: 10 },
    parrafo: { textAlign: "justify", marginBottom: 14 },

    /* Tabla resumen */
    resumenTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6 },
    tabla: { borderWidth: 0.8, borderColor: CARBON },
    thFila: { flexDirection: "row", backgroundColor: CARBON, color: "#FFFFFF" },
    th: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingVertical: 5, paddingHorizontal: 5, textAlign: "center" },
    tdFila: { flexDirection: "row", borderTopWidth: 0.8, borderTopColor: CARBON },
    td: { fontSize: 9, paddingVertical: 5, paddingHorizontal: 5 },
    cItem: { width: "8%", textAlign: "center" },
    cDesc: { width: "46%" },
    cCant: { width: "10%", textAlign: "center" },
    cPrecio: { width: "18%", textAlign: "right" },
    cSub: { width: "18%", textAlign: "right" },
    totalFila: { flexDirection: "row", borderTopWidth: 0.8, borderTopColor: CARBON },
    totalEtiqueta: { width: "82%", fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right", paddingVertical: 5, paddingHorizontal: 5 },
    totalValor: { width: "18%", fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right", paddingVertical: 5, paddingHorizontal: 5 },
    totalDestacado: { backgroundColor: FILA_GRIS },

    /* Ficha por ítem */
    ficha: { borderWidth: 0.8, borderColor: CARBON, marginTop: 16 },
    fichaTitulo: { fontSize: 9.5, fontFamily: "Helvetica-Bold", padding: 6 },
    specTh: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF", paddingVertical: 4, paddingHorizontal: 5, textAlign: "center" },
    specTd: { fontSize: 9, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 5, textAlign: "center" },
    caracTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
    caracBullet: { flexDirection: "row", marginBottom: 2 },
    caracPunto: { width: 12, textAlign: "center" },
    caracTexto: { flex: 1, fontSize: 8.5, textAlign: "justify" },

    /* Secciones finales */
    seccionSubrayada: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      textDecoration: "underline",
      marginBottom: 8,
    },
    validez: {
      textAlign: "center",
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      textDecoration: "underline",
      marginTop: 18,
      marginBottom: 14,
    },
    listaNumerada: { flexDirection: "row", marginBottom: 3 },
    listaNumero: { width: 18 },
    listaTexto: { flex: 1, textAlign: "justify" },
    notaTexto: { flex: 1, fontSize: 8.5, textAlign: "justify", color: GRIS },

    /* Cuentas bancarias (OPEN) */
    cuentasTitulo: { textAlign: "center", fontSize: 11, fontFamily: "Helvetica-Bold", textDecoration: "underline", marginTop: 18, marginBottom: 10 },
    bancoTh: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 5, backgroundColor: FILA_GRIS, textAlign: "center" },
    bancoTd: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 5 },
    bBanco: { width: "18%" },
    bMoneda: { width: "16%" },
    bCorriente: { width: "30%" },
    bCci: { width: "36%" },

    /* Firma */
    cierre: { marginTop: 20 },
    firmaBloque: { marginTop: 26, flexDirection: "row", gap: 14, alignItems: "flex-start" },
    firmaLogo: { width: 110 },
    firmaWordmark: { fontSize: 11, fontFamily: "Helvetica-Bold" },
    firmaDatos: { fontSize: 9 },
  });
}

function formatoMonto(v: number): string {
  return v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function CotizacionPdf({
  logoBuffer,
  serie,
  numeroDocumento,
  fecha,
  cliente,
  items,
  moneda,
  condiciones,
  vigenciaDias,
  firma,
}: CotizacionPdfProps) {
  const identidad = IDENTIDAD_SERIE[serie];
  const estilos = crearEstilos(identidad.acento);

  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const igv = subtotal * IGV;
  const total = subtotal + igv;
  const simbolo = moneda === "USD" ? "US$" : "S/";

  const membrete = (
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
        {identidad.usaLogo && (
          <Text style={[estilos.membreteSub, { maxWidth: 250, textAlign: "right" }]}>
            {identidad.subtitulo}
          </Text>
        )}
      </View>
      <View style={estilos.membreteLinea} />
    </View>
  );

  const pie = (
    <View style={estilos.pie} fixed>
      {identidad.pie.map((linea, i) => (
        <Text key={i} style={i === 0 && serie === "EFAMEINSA" ? estilos.pieWeb : estilos.pieTexto}>
          {linea}
        </Text>
      ))}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={estilos.page}>
        {membrete}
        {pie}

        <Text style={estilos.titulo}>COTIZACION N° {numeroDocumento}</Text>
        <Text style={estilos.fecha}>Lima, {fecha}</Text>

        <View style={estilos.clienteBloque}>
          <Text>Señores:</Text>
          <Text style={estilos.negrita}>{cliente.razon_social}</Text>
          {cliente.tipo_doc !== "SIN_DOC" && cliente.num_doc && (
            <Text>
              {cliente.tipo_doc}: {cliente.num_doc}
            </Text>
          )}
          {cliente.direccion && <Text>{cliente.direccion}</Text>}
          {cliente.telefono && (
            <Text>
              <Text style={estilos.negrita}>Teléfono: </Text>
              {cliente.telefono}
            </Text>
          )}
          {cliente.email && (
            <Text>
              <Text style={estilos.negrita}>Correo: </Text>
              {cliente.email}
            </Text>
          )}
        </View>

        {cliente.atencion && <Text style={estilos.atencion}>Atención: {cliente.atencion}</Text>}

        <Text style={estilos.parrafo}>
          Por medio de la presente nos es grato hacer llegar nuestros saludos y a la vez presentar
          la siguiente propuesta técnica económica.
        </Text>

        {/* ── Resumen económico ── */}
        <Text style={estilos.resumenTitulo}>RESUMEN:</Text>
        <View style={estilos.tabla}>
          <View style={estilos.thFila}>
            <Text style={[estilos.th, estilos.cItem]}>ÍTEM</Text>
            <Text style={[estilos.th, estilos.cDesc, { textAlign: "left" }]}>DESCRIPCIÓN</Text>
            <Text style={[estilos.th, estilos.cCant]}>CANT.</Text>
            <Text style={[estilos.th, estilos.cPrecio]}>P. UNITARIO {simbolo}</Text>
            <Text style={[estilos.th, estilos.cSub]}>SUBTOTAL {simbolo}</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={estilos.tdFila}>
              <Text style={[estilos.td, estilos.cItem]}>{ROMANOS[i] ?? i + 1}</Text>
              <Text style={[estilos.td, estilos.cDesc]}>
                {item.nombre.toUpperCase()}
                {"\n"}
                <Text style={{ color: GRIS, fontSize: 8.5 }}>
                  MARCA: {item.marca.toUpperCase()} · MODELO: {item.modelo.toUpperCase()}
                  {item.capacidad ? ` · ${item.capacidad}` : ""}
                </Text>
              </Text>
              <Text style={[estilos.td, estilos.cCant]}>{item.cantidad}</Text>
              <Text style={[estilos.td, estilos.cPrecio]}>{formatoMonto(item.precio_unitario)}</Text>
              <Text style={[estilos.td, estilos.cSub]}>{formatoMonto(item.cantidad * item.precio_unitario)}</Text>
            </View>
          ))}
          <View style={estilos.totalFila}>
            <Text style={estilos.totalEtiqueta}>SUB TOTAL {simbolo}</Text>
            <Text style={estilos.totalValor}>{formatoMonto(subtotal)}</Text>
          </View>
          <View style={estilos.totalFila}>
            <Text style={estilos.totalEtiqueta}>I.G.V. (18%) {simbolo}</Text>
            <Text style={estilos.totalValor}>{formatoMonto(igv)}</Text>
          </View>
          <View style={[estilos.totalFila, estilos.totalDestacado]}>
            <Text style={estilos.totalEtiqueta}>TOTAL INCLUIDO IGV A PAGAR {simbolo}</Text>
            <Text style={[estilos.totalValor, { color: identidad.acento }]}>{formatoMonto(total)}</Text>
          </View>
        </View>

        {/* ── Ficha técnica por ítem ── */}
        {items.map((item, i) => (
          <View key={i} style={estilos.ficha} wrap={false}>
            <Text style={estilos.fichaTitulo}>
              ITEM {ROMANOS[i] ?? i + 1}.- {item.nombre.toUpperCase()}
            </Text>
            <View style={[estilos.thFila, { borderTopWidth: 0.8, borderTopColor: CARBON }]}>
              <Text style={[estilos.specTh, { width: "20%" }]}>Marca</Text>
              <Text style={[estilos.specTh, { width: "30%" }]}>Modelo</Text>
              <Text style={[estilos.specTh, { width: "25%" }]}>Capacidad</Text>
              <Text style={[estilos.specTh, { width: "25%" }]}>Categoría</Text>
            </View>
            <View style={[estilos.tdFila, { borderTopColor: BORDE }]}>
              <Text style={[estilos.specTd, { width: "20%" }]}>{item.marca}</Text>
              <Text style={[estilos.specTd, { width: "30%" }]}>{item.modelo}</Text>
              <Text style={[estilos.specTd, { width: "25%" }]}>{item.capacidad ?? "—"}</Text>
              <Text style={[estilos.specTd, { width: "25%" }]}>{item.categoria ?? "—"}</Text>
            </View>
            {item.caracteristicas.length > 0 && (
              <View style={{ padding: 8, borderTopWidth: 0.8, borderTopColor: BORDE }}>
                <Text style={estilos.caracTitulo}>CARACTERISTICAS</Text>
                {item.caracteristicas.map((c, j) => (
                  <View key={j} style={estilos.caracBullet}>
                    <Text style={estilos.caracPunto}>•</Text>
                    <Text style={estilos.caracTexto}>{c}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* ── Condiciones ── */}
        {condiciones && (
          <View style={{ marginTop: 16 }} wrap={false}>
            <Text style={estilos.seccionSubrayada}>Condiciones comerciales:</Text>
            <Text style={estilos.parrafo}>{condiciones}</Text>
          </View>
        )}

        <Text style={estilos.validez}>VALIDEZ DE LA COTIZACION: {vigenciaDias} DIAS</Text>

        {/* ── Cuentas bancarias (solo OPEN) ── */}
        {identidad.cuentasBancarias && (
          <View wrap={false}>
            <Text style={estilos.cuentasTitulo}>NÚMEROS DE CUENTA BANCARIA</Text>
            <Text style={{ marginBottom: 2 }}>
              <Text style={estilos.negrita}>NOMBRE: </Text>
              {identidad.cuentasBancarias.titular}
            </Text>
            <Text style={{ marginBottom: 8 }}>
              <Text style={estilos.negrita}>RUC: </Text>
              {identidad.cuentasBancarias.ruc}
            </Text>
            <View style={estilos.tabla}>
              <View style={{ flexDirection: "row" }}>
                <Text style={[estilos.bancoTh, estilos.bBanco]}>BANCO</Text>
                <Text style={[estilos.bancoTh, estilos.bMoneda]}>MONEDA</Text>
                <Text style={[estilos.bancoTh, estilos.bCorriente]}>CUENTA CORRIENTE</Text>
                <Text style={[estilos.bancoTh, estilos.bCci]}>CCI</Text>
              </View>
              {identidad.cuentasBancarias.cuentas.map((c, i) => (
                <View key={i} style={[estilos.tdFila, { borderTopColor: BORDE }]}>
                  <Text style={[estilos.bancoTd, estilos.bBanco, estilos.negrita]}>{c.banco}</Text>
                  <Text style={[estilos.bancoTd, estilos.bMoneda]}>{c.moneda}</Text>
                  <Text style={[estilos.bancoTd, estilos.bCorriente]}>{c.corriente}</Text>
                  <Text style={[estilos.bancoTd, estilos.bCci]}>{c.cci}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Importante / Nota ── */}
        <View style={{ marginTop: 18 }} wrap={false}>
          <Text style={estilos.seccionSubrayada}>Importante:</Text>
          {PUNTOS_IMPORTANTES.map((p, i) => (
            <View key={i} style={estilos.listaNumerada}>
              <Text style={estilos.listaNumero}>{i + 1}.</Text>
              <Text style={estilos.listaTexto}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12 }} wrap={false}>
          <Text style={estilos.seccionSubrayada}>Nota:</Text>
          {NOTAS.map((n, i) => (
            <View key={i} style={estilos.listaNumerada}>
              <Text style={estilos.listaNumero}>•</Text>
              <Text style={estilos.notaTexto}>{n}</Text>
            </View>
          ))}
        </View>

        {/* ── Cierre y firma ── */}
        <View style={estilos.cierre} wrap={false}>
          <Text style={estilos.parrafo}>
            Agradeciendo su atención a la presente, quedamos de ustedes a la espera de su apreciable
            orden.
          </Text>
          <Text>Atentamente,</Text>

          <View style={estilos.firmaBloque}>
            {identidad.usaLogo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
              <Image src={logoBuffer} style={estilos.firmaLogo} />
            ) : (
              <View>
                <Text style={[estilos.firmaWordmark, { color: identidad.acento }]}>{identidad.nombreLegal}</Text>
                <Text style={estilos.membreteSub}>{identidad.subtitulo}</Text>
              </View>
            )}
            <View style={estilos.firmaDatos}>
              <Text style={estilos.negrita}>{firma.nombre}</Text>
              <Text style={estilos.negrita}>Área Comercial</Text>
              {firma.telefono && <Text>Teléfono : {firma.telefono}</Text>}
              {firma.celular && <Text>Celular  : {firma.celular}</Text>}
              {firma.email && <Text>Email    : {firma.email}</Text>}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
