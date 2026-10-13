import { View, Text } from "@react-pdf/renderer";
import type { SeccionQueFalta, TonoDetalle } from "@/lib/lo-que-falta-por-paso";

// LA HOJA «PEDIDOS ABIERTOS · LO QUE FALTA, PASO POR PASO» (Santos, 13-10: «dice
// 81 abiertos… eso debe aparecer en su agenda y exportado en su PDF de su
// reporte con detalle»). Es la misma lista de la agenda (lib/lo-que-falta-por-paso):
// arriba cuántos por paso; abajo, cada paso con sus clientes, el equipo y qué
// falta o quién lo debe. Sin la historia del Excel.

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#D8D4D3";
const FILA_GRIS = "#F4F2F1";
const TONO: Record<TonoDetalle, string> = {
  trabado: "#B42318",
  pendiente: "#8A5A00",
  espera: GRIS,
  listo: "#1E7F4F",
  stock: "#B54708",
};

const corta = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return !t ? "—" : t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function LoQueFaltaPdf({ abiertos, historia, secciones }: { abiertos: number; historia: number; secciones: SeccionQueFalta[] }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 6 }}>
        <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color: GRANATE, marginRight: 6 }}>{abiertos}</Text>
        <Text style={{ fontSize: 9, color: CARBON, marginBottom: 3 }}>pedidos abiertos en el área, en curso</Text>
      </View>
      <Text style={{ fontSize: 7, color: GRIS, marginBottom: 8 }}>
        La misma lista de «Lo que falta» de la agenda: cada paso con sus pedidos. Primero va a quién le toca ahora; en gris, los que todavía esperan un paso anterior.
        {historia > 0 ? ` No suman ${historia} pedidos del Excel de antes del CRM (ya salieron o nadie los movió).` : ""} Estado al momento de generar el reporte.
      </Text>

      {/* De un vistazo: cuántos por paso. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }} wrap={false}>
        {secciones.map((s) => (
          <View
            key={s.clave}
            style={{ borderWidth: 1, borderColor: BORDE, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 5, marginRight: 4, marginBottom: 4, flexDirection: "row" }}
          >
            <Text style={{ fontSize: 7, color: CARBON }}>{s.titulo}</Text>
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: GRANATE, marginLeft: 4 }}>{s.filas.length}</Text>
          </View>
        ))}
      </View>

      {secciones.length === 0 ? (
        <Text style={{ fontSize: 8, color: GRIS }}>No hay pedidos abiertos con pasos pendientes.</Text>
      ) : (
        secciones.map((s) => {
          const fila = ({ f, ahora, detalle }: SeccionQueFalta["filas"][number], i: number) => (
            <View
              key={f.id}
              wrap={false}
              style={{ flexDirection: "row", paddingVertical: 2.5, paddingHorizontal: 3, backgroundColor: i % 2 ? FILA_GRIS : undefined, opacity: ahora ? 1 : 0.6 }}
            >
              <Text style={{ width: 14, fontSize: 6.5, color: GRIS }}>{i + 1}</Text>
              <View style={{ width: 190, paddingRight: 6 }}>
                <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: CARBON }}>{corta(f.cliente, 60)}</Text>
                <Text style={{ fontSize: 6, color: GRIS }}>{corta(f.equipo.split("\n")[0].replace(/【anterior al circuito】\s*/, "Anterior al circuito · "), 70)}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 6.8, color: detalle ? TONO[detalle.tono] : GRIS }}>{corta(detalle?.texto, 140)}</Text>
            </View>
          );
          return (
            <View key={s.clave} style={{ marginBottom: 9 }}>
              {/* El título va pegado a su primera fila: solo, al pie de una hoja, no sirve. */}
              <View wrap={false}>
                <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: GRANATE, paddingBottom: 2, marginBottom: 2 }}>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: CARBON }}>{s.titulo}</Text>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: GRANATE, marginLeft: 5 }}>{s.filas.length}</Text>
                  {s.ahoraN < s.filas.length && (
                    <Text style={{ fontSize: 6.5, color: GRIS, marginLeft: 6 }}>
                      {s.ahoraN} le toca ahora · {s.filas.length - s.ahoraN} esperan un paso anterior
                    </Text>
                  )}
                </View>
                {s.filas.slice(0, 2).map(fila)}
              </View>
              {s.filas.slice(2).map((x, i) => fila(x, i + 2))}
            </View>
          );
        })
      )}
    </View>
  );
}
