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
  calentamiento: string | null; // solo secadoras a gas
  panel: string | null; // "Digital-Multifunción"
  controles: string | null; // "220V/60Hz/1Ph"
  caracteristicas: string[];
  dimensiones: string[]; // "Volumen del tambor: 207 litros", …
  medidas: string[]; // "Ancho: 686 mm", …
  fotoBuffer: Buffer | null;
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
    caracTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 3 },
    caracBullet: { flexDirection: "row", marginBottom: 1 },
    caracPunto: { width: 12, textAlign: "center" },
    caracTexto: { flex: 1, fontSize: 8.5, textAlign: "justify", lineHeight: 1.3 },

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
      </Page>

      {/* ── Ficha técnica: un equipo por página, como los modelos reales.
           (Con las fichas dentro de la página de la carta, una ficha más alta
           que la página hacía que react-pdf comprimiera el texto encima de sí
           mismo — "can't wrap between pages".) ── */}
      {items.map((item, i) => {
          // Columnas de especificación como en los modelos reales: Calentamiento
          // solo aparece en secadoras a gas; si el producto no tiene ficha de
          // panel/controles se muestra la categoría.
          const columnas: { titulo: string; valor: string }[] = [
            { titulo: "Marca", valor: item.marca },
            { titulo: "Modelo", valor: item.modelo },
            { titulo: "Capacidad", valor: item.capacidad ?? "—" },
          ];
          if (item.calentamiento) columnas.push({ titulo: "Calentamiento", valor: item.calentamiento });
          if (item.panel) columnas.push({ titulo: "Panel computarizado", valor: item.panel });
          if (item.controles) columnas.push({ titulo: "Controles Automático", valor: item.controles });
          if (!item.panel && !item.controles) columnas.push({ titulo: "Categoría", valor: item.categoria ?? "—" });
          const anchoCol = `${100 / columnas.length}%`;

          const tieneDetalle =
            item.caracteristicas.length > 0 || item.dimensiones.length > 0 || item.medidas.length > 0;

          return (
            <Page key={i} size="A4" style={estilos.page}>
              {membrete}
              {pie}
              <View style={estilos.ficha}>
              <Text style={estilos.fichaTitulo}>
                ITEM {ROMANOS[i] ?? i + 1}.- {item.nombre.toUpperCase()}
              </Text>
              <View style={[estilos.thFila, { borderTopWidth: 0.8, borderTopColor: CARBON }]}>
                {columnas.map((c, j) => (
                  <Text key={j} style={[estilos.specTh, { width: anchoCol }]}>
                    {c.titulo}
                  </Text>
                ))}
              </View>
              <View style={[estilos.tdFila, { borderTopColor: BORDE }]}>
                {columnas.map((c, j) => (
                  <Text key={j} style={[estilos.specTd, { width: anchoCol }]}>
                    {c.valor}
                  </Text>
                ))}
              </View>

              {(tieneDetalle || item.fotoBuffer) && (
                <View style={{ flexDirection: "row", borderTopWidth: 0.8, borderTopColor: BORDE }}>
                  {item.fotoBuffer && (
                    <View style={{ width: "32%", padding: 12, justifyContent: "center" }}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
                      <Image src={item.fotoBuffer} style={{ width: "100%" }} />
                    </View>
                  )}
                  <View
                    style={{
                      flex: 1,
                      padding: 8,
                      borderLeftWidth: item.fotoBuffer ? 0.8 : 0,
                      borderLeftColor: BORDE,
                    }}
                  >
                    {item.caracteristicas.length > 0 && (
                      <>
                        <Text style={estilos.caracTitulo}>CARACTERISTICAS</Text>
                        {item.caracteristicas.map((c, j) => (
                          <View key={j} style={estilos.caracBullet}>
                            <Text style={estilos.caracPunto}>•</Text>
                            <Text style={estilos.caracTexto}>{c}</Text>
                          </View>
                        ))}
                      </>
                    )}
                    {item.dimensiones.length > 0 && (
                      <>
                        <Text style={[estilos.caracTitulo, { marginTop: 6 }]}>DIMENSIONES DE LA MAQUINA</Text>
                        {item.dimensiones.map((d, j) => (
                          <View key={j} style={estilos.caracBullet}>
                            <Text style={estilos.caracPunto}>•</Text>
                            <Text style={estilos.caracTexto}>{d}</Text>
                          </View>
                        ))}
                      </>
                    )}
                    {item.medidas.length > 0 && (
                      <>
                        <Text style={[estilos.caracTitulo, { marginTop: 6 }]}>MEDIDAS GENERALES</Text>
                        {item.medidas.map((m, j) => (
                          <View key={j} style={estilos.caracBullet}>
                            <Text style={estilos.caracPunto}>•</Text>
                            <Text style={estilos.caracTexto}>{m}</Text>
                          </View>
                        ))}
                      </>
                    )}
                  </View>
                </View>
              )}
              </View>
            </Page>
          );
        })}

      {/* ── Página final: condiciones, validez, cuentas, importante/nota y firma ── */}
      <Page size="A4" style={estilos.page}>
        {membrete}
        {pie}

        {condiciones && (
          <View wrap={false}>
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
