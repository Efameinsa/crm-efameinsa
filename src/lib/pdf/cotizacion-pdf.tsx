import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// Identidad Efameinsa (ver CLAUDE.md) — Helvetica es la fuente base de
// @react-pdf/renderer sin necesidad de incrustar archivos de fuente; es la
// alternativa más cercana a Arial (decisión del usuario) para no depender de
// una fuente TTF en el servidor.
const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";

const estilos = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: CARBON },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  logo: { width: 140 },
  tituloBox: { alignItems: "flex-end" },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold", color: GRANATE },
  codigo: { fontSize: 11, color: GRIS, marginTop: 2 },
  seccion: { marginBottom: 16 },
  seccionTitulo: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: GRANATE,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e2e2",
    paddingBottom: 4,
  },
  fila: { flexDirection: "row" },
  tablaHeader: {
    flexDirection: "row",
    backgroundColor: CARBON,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tablaFila: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e2e2",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  colProducto: { flex: 4 },
  colCant: { flex: 1, textAlign: "right" },
  colPrecio: { flex: 1.4, textAlign: "right" },
  colSubtotal: { flex: 1.4, textAlign: "right" },
  totales: { alignItems: "flex-end", marginTop: 12 },
  totalTexto: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GRANATE },
  condiciones: { fontSize: 9, color: GRIS, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: GRIS, textAlign: "center" },
});

export interface ItemPdf {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
}

export interface CotizacionPdfProps {
  // Buffer del PNG, no una ruta: @react-pdf/renderer intenta resolver un
  // string como URL (hace fetch()) y falla con rutas de archivo locales.
  logoBuffer: Buffer;
  codigo: string;
  serie: string;
  fecha: string;
  cliente: { razon_social: string; tipo_doc: string; num_doc: string | null; direccion: string | null };
  items: ItemPdf[];
  subtotal: number;
  total: number;
  moneda: string;
  condiciones: string | null;
  vigenciaDias: number;
}

export function CotizacionPdf({
  logoBuffer,
  codigo,
  serie,
  fecha,
  cliente,
  items,
  total,
  moneda,
  condiciones,
  vigenciaDias,
}: CotizacionPdfProps) {
  return (
    <Document>
      <Page size="A4" style={estilos.page}>
        <View style={estilos.encabezado}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, no es un <img> HTML */}
          <Image src={logoBuffer} style={estilos.logo} />
          <View style={estilos.tituloBox}>
            <Text style={estilos.titulo}>COTIZACIÓN</Text>
            <Text style={estilos.codigo}>{codigo}</Text>
            <Text style={estilos.codigo}>Serie {serie}</Text>
            <Text style={estilos.codigo}>{fecha}</Text>
          </View>
        </View>

        <View style={estilos.seccion}>
          <Text style={estilos.seccionTitulo}>Cliente</Text>
          <Text>{cliente.razon_social}</Text>
          {cliente.tipo_doc !== "SIN_DOC" && <Text>{cliente.tipo_doc}: {cliente.num_doc}</Text>}
          {cliente.direccion && <Text>{cliente.direccion}</Text>}
        </View>

        <View style={estilos.seccion}>
          <Text style={estilos.seccionTitulo}>Equipos cotizados</Text>
          <View style={estilos.tablaHeader}>
            <Text style={estilos.colProducto}>Producto</Text>
            <Text style={estilos.colCant}>Cant.</Text>
            <Text style={estilos.colPrecio}>Precio unit.</Text>
            <Text style={estilos.colSubtotal}>Subtotal</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={estilos.tablaFila}>
              <Text style={estilos.colProducto}>{item.nombre}</Text>
              <Text style={estilos.colCant}>{item.cantidad}</Text>
              <Text style={estilos.colPrecio}>
                {moneda} {item.precio_unitario.toFixed(2)}
              </Text>
              <Text style={estilos.colSubtotal}>
                {moneda} {(item.cantidad * item.precio_unitario).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        <View style={estilos.totales}>
          <Text style={estilos.totalTexto}>
            Total: {moneda} {total.toFixed(2)}
          </Text>
        </View>

        <View style={estilos.seccion}>
          <Text style={estilos.seccionTitulo}>Condiciones</Text>
          <Text style={estilos.condiciones}>{condiciones ?? "—"}</Text>
          <Text style={estilos.condiciones}>Cotización válida por {vigenciaDias} días desde la fecha de emisión.</Text>
        </View>

        <Text style={estilos.footer} fixed>
          Efameinsa — Equipos de lavandería industrial y semi-industrial
        </Text>
      </Page>
    </Document>
  );
}
