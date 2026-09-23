import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { FilaApertura } from "@/lib/apertura-servicio";

// El PDF descargable de la apertura de servicio (ítem 8 de la reunión del
// 22-09): Carlos, viendo la pantalla en vivo: «ya no trabajes como en Word,
// porque lo tenemos aquí. Te da ya todo el formato listo, lo tomas y lo
// envías». Antes solo se podía «Guardar como PDF» desde el diálogo de
// impresión del navegador; esto es un archivo propio, como el del cierre.
//
// Calca la hoja que ya se ve en pantalla (`/postventa/pedidos/[id]/apertura`):
// arriba las nueve filas del formato de correo, abajo las condiciones
// verificadas que le dan autoridad al papel frente a almacén.

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#B9B4B2";
const FILA_GRIS = "#F4F2F1";

export interface AperturaServicioPdfProps {
  logoBuffer: Buffer;
  empresaLarga: string;
  emitida: string | null; // "22/09/2026, 10:17 a. m.", o null si es vista previa
  emitidoPor: string | null;
  informeCodigo: string | null;
  ordenCompra: string | null;
  numeroPedidoErp: string | null;
  filas: FilaApertura[];
  condiciones: { texto: string; ok: boolean; detalle: string }[];
  avisoPreinstalacion: string | null;
  observaciones: string | null;
}

const e = StyleSheet.create({
  pagina: { paddingTop: 32, paddingBottom: 40, paddingHorizontal: 40, fontSize: 9, lineHeight: 1.35, color: CARBON, fontFamily: "Helvetica" },
  cabecera: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: GRANATE, paddingBottom: 10, marginBottom: 10 },
  logo: { width: 120 },
  empresa: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRANATE, textTransform: "uppercase" },
  titulo: { marginTop: 3, fontSize: 15, fontFamily: "Helvetica-Bold" },
  sub: { marginTop: 2, fontSize: 8, color: GRIS },
  cabeceraDer: { textAlign: "right", fontSize: 8.5 },
  tabla: { marginTop: 8, borderWidth: 1, borderColor: "#8A8480" },
  th: { flexDirection: "row", backgroundColor: FILA_GRIS, borderBottomWidth: 1, borderBottomColor: "#8A8480" },
  thTexto: { fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4 },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDE },
  celda: { fontSize: 8.5, padding: 4, borderRightWidth: 0.5, borderRightColor: BORDE },
  h2: { marginTop: 14, borderBottomWidth: 1, borderBottomColor: BORDE, paddingBottom: 3, fontSize: 8.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  p: { marginTop: 4, fontSize: 8.5, color: GRIS },
  condFila: { flexDirection: "row", gap: 6, marginTop: 5, alignItems: "flex-start" },
  check: { width: 11, height: 11, borderWidth: 1, borderColor: "#3a3a3a", alignItems: "center", justifyContent: "center", marginTop: 1 },
  aviso: { marginTop: 10, borderWidth: 1, borderColor: "#8A8480", padding: 6, fontSize: 8.5 },
  firmas: { flexDirection: "row", marginTop: 30, gap: 20 },
  firmaCaja: { flex: 1, textAlign: "center" },
  firmaLinea: { height: 34, borderBottomWidth: 1, borderBottomColor: "#8A8480" },
  firmaTexto: { marginTop: 3, fontSize: 8, fontFamily: "Helvetica-Bold" },
  firmaSub: { fontSize: 7.5, color: GRIS },
});

export function AperturaServicioPdf({
  logoBuffer, empresaLarga, emitida, emitidoPor, informeCodigo, ordenCompra, numeroPedidoErp, filas, condiciones, avisoPreinstalacion, observaciones,
}: AperturaServicioPdfProps) {
  return (
    <Document>
      <Page size="A4" style={e.pagina}>
        <View style={e.cabecera}>
          <View>
            <Image src={logoBuffer} style={e.logo} />
            <Text style={e.empresa}>{empresaLarga}</Text>
            <Text style={e.titulo}>Apertura de servicio</Text>
            <Text style={e.sub}>En coordinación con el Ing. Carlos, queda en agenda el siguiente servicio.</Text>
          </View>
          <View style={e.cabeceraDer}>
            <Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Emitida: </Text>
              {emitida ?? "— (vista previa)"}
            </Text>
            {emitidoPor && (
              <Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Por: </Text>
                {emitidoPor} · Postventa
              </Text>
            )}
            {informeCodigo && (
              <Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Cierre: </Text>
                {informeCodigo}
              </Text>
            )}
            {numeroPedidoErp && (
              <Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Pedido: </Text>
                {numeroPedidoErp}
              </Text>
            )}
            {ordenCompra && (
              <Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>OC: </Text>
                {ordenCompra}
              </Text>
            )}
          </View>
        </View>

        <View style={e.tabla}>
          <View style={e.th}>
            <Text style={[e.thTexto, { width: 22 }]}>N°</Text>
            <Text style={[e.thTexto, { width: 150 }]}>DESCRIPCIÓN</Text>
            <Text style={[e.thTexto, { flex: 1 }]}>INFORMACIÓN</Text>
            <Text style={[e.thTexto, { width: 70 }]}>OBSERVACIONES</Text>
          </View>
          {filas.map((f) => (
            <View key={f.n} style={e.fila} wrap={false}>
              <Text style={[e.celda, { width: 22, textAlign: "center" }]}>{f.n}</Text>
              <Text style={[e.celda, { width: 150, fontFamily: "Helvetica-Bold" }]}>{f.descripcion}</Text>
              <Text style={[e.celda, { flex: 1 }]}>{f.informacion}</Text>
              <Text style={[e.celda, { width: 70, textAlign: "center", borderRightWidth: 0 }]}>{f.observaciones}</Text>
            </View>
          ))}
        </View>

        <Text style={e.h2}>Condiciones verificadas · control interno</Text>
        <Text style={e.p}>
          Con este documento almacén ejecuta el despacho sin preguntar a nadie: todo lo de abajo quedó verificado en
          el sistema, con su fecha y su responsable.
        </Text>
        {condiciones.map((c) => (
          <View key={c.texto} style={e.condFila} wrap={false}>
            <View style={[e.check, c.ok ? { backgroundColor: "#000" } : {}]}>
              {c.ok && <Text style={{ fontSize: 7, color: "#fff", fontFamily: "Helvetica-Bold" }}>X</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{c.texto}</Text>
              <Text style={{ fontSize: 7.5, color: GRIS }}>{c.detalle}</Text>
            </View>
          </View>
        ))}

        {avisoPreinstalacion && (
          <View style={e.aviso}>
            <Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Aviso: </Text>
              {avisoPreinstalacion} No impide el despacho, pero conviene tenerla confirmada antes de que salga el
              camión: es lo que hace posible la puesta en marcha al llegar.
            </Text>
          </View>
        )}

        {observaciones && (
          <>
            <Text style={e.h2}>Observaciones del pedido</Text>
            <Text style={e.p}>{observaciones}</Text>
          </>
        )}

        <View style={e.firmas}>
          {["Postventa", "Almacén", "Transportista / recibe"].map((f) => (
            <View key={f} style={e.firmaCaja}>
              <View style={e.firmaLinea} />
              <Text style={e.firmaTexto}>{f}</Text>
              <Text style={e.firmaSub}>Nombre, fecha y hora</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
