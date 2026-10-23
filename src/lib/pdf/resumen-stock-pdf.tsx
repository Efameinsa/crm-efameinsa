import { Document, Page, View, Text, Image, StyleSheet, Svg, Path } from "@react-pdf/renderer";
import { etiquetaEstado, problemaCorto, type EstadoStock } from "@/lib/stock-textos";

// «RESUMEN GENERAL DE STOCK» en PDF (Santos 21-10, con la hoja impresa de
// Sailstar como modelo: CÓDIGO · MOD. · EQUIPO · STOCK · MARCA · SERIE ·
// DISPONIBLE, agrupado por marca y tipo, con «Falta código» y checks a mano).
// Es la revisión que Lesly tiene en «Stock y códigos», tal como la ve: el
// código a usar, el que traía el Excel si cambió, el estado con su problema y
// la decisión con su casilla. Nunca lleva costos: la carga no los guarda.

const GRANATE = "#7E1210";
const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#9A9491";
const CABECERA = "#E7E3E1";
// Tintes suaves por estado, los mismos de la pantalla.
const FONDO: Record<EstadoStock, string> = {
  revisar: "#FCE9E6",
  elegir: "#FFF6DB",
  nuevo: "#FFF1E4",
  sugerido: "#EAF3FB",
  ok: "#FFFFFF",
  falta: "#FFF6DB",
};
const TINTA: Record<EstadoStock, string> = {
  revisar: "#A3241A",
  elegir: "#8A5A00",
  nuevo: "#B45309",
  sugerido: "#1F5E8C",
  ok: "#2F6B3A",
  falta: "#8A5A00",
};

export interface FilaResumen {
  hoja: string;
  fila: number;
  item: string | null;
  codigoExcel: string | null;
  codigoFinal: string | null;
  codigo: string | null;
  modelo: string;
  descripcion: string;
  serie: string | null;
  cantidad: number;
  ubicacion: string | null;
  marca: string | null;
  tipo?: string;
  estado: EstadoStock;
  motivo: string;
  crear?: boolean;
  decision: "pendiente" | "subir" | "no_subir";
  ocupada?: { cliente: string | null; pedido: string | null } | null;
}

export interface ResumenStockPdfProps {
  logoBuffer: Buffer;
  archivo: string;
  generado: string;
  por: string;
  estadoCarga: "revisando" | "subida" | "reemplazada";
  filas: FilaResumen[];
  existentes: Set<string>;
}

const s = StyleSheet.create({
  pagina: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 26, fontSize: 7.5, lineHeight: 1.3, color: CARBON, fontFamily: "Helvetica" },
  cabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: GRANATE, paddingBottom: 8 },
  logo: { width: 110 },
  titulo: { fontSize: 14, lineHeight: 1.25, fontFamily: "Helvetica-Bold", textAlign: "center" },
  sub: { fontSize: 8, color: GRIS, textAlign: "center", marginTop: 2 },
  derecha: { textAlign: "right", fontSize: 7.5, color: GRIS, width: 150 },
  // Resumen de arriba
  cajas: { flexDirection: "row", gap: 6, marginTop: 8 },
  caja: { flex: 1, borderWidth: 0.75, borderColor: BORDE, padding: 5 },
  cajaNum: { fontSize: 13, lineHeight: 1.15, marginBottom: 1, fontFamily: "Helvetica-Bold" },
  cajaTxt: { fontSize: 7, color: GRIS },
  notas: { marginTop: 6, borderWidth: 0.75, borderColor: BORDE, padding: 6 },
  notaTitulo: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  nota: { fontSize: 7.5, marginTop: 1.5 },
  // Grupo (marca · tipo)
  grupo: { marginTop: 10, backgroundColor: CABECERA, borderWidth: 0.75, borderColor: BORDE, paddingVertical: 3, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  th: { flexDirection: "row", borderLeftWidth: 0.75, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: BORDE, backgroundColor: "#F5F3F2" },
  thTxt: { fontFamily: "Helvetica-Bold", fontSize: 7, padding: 3, borderRightWidth: 0.5, borderRightColor: BORDE, textAlign: "center" },
  fila: { flexDirection: "row", borderLeftWidth: 0.75, borderRightWidth: 0.75, borderBottomWidth: 0.5, borderColor: BORDE },
  celda: { padding: 3, borderRightWidth: 0.5, borderRightColor: BORDE, justifyContent: "center" },
  codigo: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  chico: { fontSize: 6.5, color: GRIS },
  pie: { position: "absolute", bottom: 14, left: 26, right: 26, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: BORDE, paddingTop: 4 },
  pieTexto: { fontSize: 6.5, color: GRIS },
  firmas: { flexDirection: "row", marginTop: 26, gap: 30 },
  firma: { flex: 1, borderTopWidth: 0.75, borderTopColor: BORDE, paddingTop: 3, textAlign: "center", fontSize: 7.5, color: GRIS },
});

// Anchos de columna (A4 apaisado, ~790 pt útiles).
const COL = { codigo: 78, modelo: 62, equipo: 262, stock: 30, marca: 56, serie: 76, disp: 46, estado: 118, decision: 58 };

const TIPO_PLURAL: Record<string, string> = {
  lavadora: "LAVADORAS",
  secadora: "SECADORAS",
  rodillo: "RODILLOS Y CALANDRIAS",
  "mesa de planchado": "MESAS DE PLANCHADO",
  prensa: "PRENSAS",
  "calderín": "CALDERINES",
  coche: "COCHES Y CARROS",
  equipo: "OTROS EQUIPOS",
};

function tipoDe(f: FilaResumen): string {
  // Se calcula aquí aunque la carga traiga `tipo`: «PRENSA … (MESA)» es prensa, no mesa.
  const t = `${f.descripcion} ${f.modelo}`.toUpperCase();
  if (/LAVADORA|\bLAV\b|LAV\./.test(t)) return "lavadora";
  if (/SECADORA/.test(t)) return "secadora";
  if (/RODILLO|CALANDRIA/.test(t)) return "rodillo";
  if (/PRENSA/.test(t)) return "prensa";
  if (/MESA/.test(t)) return "mesa de planchado";
  if (/CALDERIN/.test(t)) return "calderín";
  if (/COCHE|CARRO/.test(t)) return "coche";
  return "equipo";
}

function marcaDe(f: FilaResumen): string {
  const m = (f.marca ?? "").trim().toUpperCase();
  if (m) return m;
  return /LG/i.test(f.hoja) ? "LG" : "SIN MARCA";
}

/** La casilla de la decisión: marcada (sube), con raya (no sube) o vacía (falta decidir). */
function Casilla({ decision }: { decision: FilaResumen["decision"] }) {
  return (
    <Svg width={9} height={9} viewBox="0 0 10 10">
      <Path d="M0.5 0.5 H9.5 V9.5 H0.5 Z" stroke="#3a3a3a" strokeWidth={0.8} fill="none" />
      {decision === "subir" && <Path d="M2 5.2 L4.2 7.4 L8.2 2.6" stroke="#2F6B3A" strokeWidth={1.4} fill="none" />}
      {decision === "no_subir" && <Path d="M2 5 H8" stroke="#6B6B6B" strokeWidth={1.4} fill="none" />}
    </Svg>
  );
}

/**
 * Importaciones escribe descripciones sin espacios («SECADORA.APIL.ELECT.MOD.NSEN…»):
 * una palabra más ancha que la columna rompe el armado del PDF. Se le dan puntos
 * de corte después de cada punto, coma o barra, y los trozos larguísimos se parten.
 */
function cortable(t: string | null | undefined): string {
  return String(t ?? "")
    .split(" ")
    .map((w) => (w.length > 22 ? w.replace(/([.,/])(?=\S)/g, "$1 ") : w))
    .map((w) => w.split(" ").map((x) => (x.length > 26 ? x.match(/.{1,24}/g)!.join(" ") : x)).join(" "))
    .join(" ");
}

const TEXTO_DECISION = { subir: "Sube", no_subir: "No sube", pendiente: "Por decidir" } as const;

export function ResumenStockPdf({ logoBuffer, archivo, generado, por, estadoCarga, filas: filasLeidas, existentes }: ResumenStockPdfProps) {
  // El PDF muestra cómo QUEDÓ cada máquina, no cómo vino el Excel (Santos 23-10: las mesas BIMAP
  // salían en naranja «Código retirado · se reactiva» y SECU302 con «Falta código» aunque ya
  // habían entrado con su código; «asusta y todo está bien»). Lo que entra con código es «Código de Lesly».
  const filas = filasLeidas.map((f) => (f.decision === "subir" && (f.codigoFinal ?? f.codigo) ? { ...f, estado: "ok" as EstadoStock, motivo: "" } : f));
  const total = filas.length;
  const unidades = filas.reduce((a, f) => a + (f.serie ? 1 : f.cantidad), 0);
  const cuenta = { subir: 0, no_subir: 0, pendiente: 0 };
  filas.forEach((f) => cuenta[f.decision]++);
  const porEstado: Partial<Record<EstadoStock, number>> = {};
  filas.forEach((f) => (porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1));

  const codigoUsar = (f: FilaResumen) => f.codigoFinal ?? f.codigo ?? null;
  const nuevos = [...new Set(filas.filter((f) => f.decision !== "no_subir" && codigoUsar(f) && !existentes.has(codigoUsar(f)!)).map((f) => codigoUsar(f)!))];
  const vendidas = filas.filter((f) => f.ocupada);
  const sinSerie = filas.filter((f) => !f.serie && f.cantidad > 0 && /MESA|PROFLEX/i.test(`${f.descripcion} ${f.modelo}`));

  // Problemas que quedan sin decidir, agrupados por su causa.
  const pendientesRevisar = new Map<string, number>();
  for (const f of filas) {
    if (f.decision !== "pendiente") continue;
    const clave = f.estado === "revisar" ? problemaCorto(f.motivo) : etiquetaEstado(f);
    pendientesRevisar.set(clave, (pendientesRevisar.get(clave) ?? 0) + 1);
  }

  // Marca → tipo → filas, como la hoja impresa («SAILSTAR · LAVADORAS EXTRACTORAS»).
  const grupos = new Map<string, FilaResumen[]>();
  for (const f of [...filas].sort((a, b) =>
    marcaDe(a).localeCompare(marcaDe(b)) || tipoDe(a).localeCompare(tipoDe(b)) || a.modelo.localeCompare(b.modelo) || (codigoUsar(a) ?? "").localeCompare(codigoUsar(b) ?? ""),
  )) {
    const clave = `${marcaDe(f)} · ${TIPO_PLURAL[tipoDe(f)] ?? tipoDe(f).toUpperCase()}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }

  return (
    <Document title={`Resumen general de stock — ${archivo}`} author="CRM Efameinsa">
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <View style={s.cabecera} fixed>
          <Image src={logoBuffer} style={s.logo} />
          <View>
            <Text style={s.titulo}>RESUMEN GENERAL DE STOCK</Text>
            <Text style={s.sub}>Revisión de codificación · {archivo}</Text>
          </View>
          <View style={s.derecha}>
            <Text>{generado}</Text>
            <Text>Preparado por {por}</Text>
            <Text>{estadoCarga === "subida" ? "Ya subido al almacén" : "En revisión — aún no está en el almacén"}</Text>
          </View>
        </View>

        <View style={s.cajas}>
          <View style={s.caja}>
            <Text style={s.cajaNum}>{unidades}</Text>
            <Text style={s.cajaTxt}>equipos en el Excel ({total} filas)</Text>
          </View>
          <View style={s.caja}>
            <Text style={[s.cajaNum, { color: TINTA.ok }]}>{cuenta.subir}</Text>
            <Text style={s.cajaTxt}>van a subir al almacén</Text>
          </View>
          <View style={s.caja}>
            <Text style={[s.cajaNum, { color: TINTA.elegir }]}>{cuenta.pendiente}</Text>
            <Text style={s.cajaTxt}>por decidir</Text>
          </View>
          <View style={s.caja}>
            <Text style={[s.cajaNum, { color: GRIS }]}>{cuenta.no_subir}</Text>
            <Text style={s.cajaTxt}>no se suben</Text>
          </View>
          <View style={s.caja}>
            <Text style={[s.cajaNum, { color: TINTA.nuevo }]}>{nuevos.length}</Text>
            <Text style={s.cajaTxt}>códigos nuevos para el catálogo</Text>
          </View>
        </View>

        <View style={s.notas}>
          <Text style={s.notaTitulo}>Lo relevante</Text>
          <Text style={s.nota}>
            Estados: {(["ok", "sugerido", "nuevo", "falta", "elegir", "revisar"] as EstadoStock[])
              .filter((e) => porEstado[e])
              .map((e) => `${porEstado[e]} ${e === "ok" ? "código de Lesly" : e === "sugerido" ? "ya existe — faltaba ponerlo" : e === "nuevo" ? "código nuevo" : e === "falta" ? "sin código" : e === "elegir" ? "elegir entre códigos" : "por revisar"}`)
              .join(" · ")}
          </Text>
          {pendientesRevisar.size > 0 && (
            <Text style={s.nota}>
              Falta decidir: {[...pendientesRevisar].map(([k, n]) => `${n} × ${k}`).join(" · ")}
            </Text>
          )}
          {nuevos.length > 0 && (
            <Text style={s.nota}>
              Códigos nuevos (se dan de alta en el sistema en preparación; ficha y activación después): {nuevos.join(", ")}
            </Text>
          )}
          {vendidas.length > 0 && (
            <Text style={s.nota}>
              Series que el CRM ya tiene con un cliente (no se suben; pasarlas a vendido o reserva):{" "}
              {vendidas.map((f) => `${f.serie}: ${f.ocupada?.cliente ?? "cliente"}${f.ocupada?.pedido ? ` (${f.ocupada.pedido})` : ""}`).join(" · ")}
            </Text>
          )}
          {sinSerie.length > 0 && (
            <Text style={s.nota}>
              Sin serie de placa en el Excel: {sinSerie.length} {sinSerie.length === 1 ? "unidad" : "unidades"} ({[...new Set(sinSerie.map((f) => f.modelo))].join(", ")}). Pedir las series a Importaciones.
            </Text>
          )}
          <Text style={s.nota}>Sin costos: el CRM no lee ni guarda la columna COSTO.</Text>
        </View>

        {[...grupos].map(([titulo, fs]) => (
          <View key={titulo}>
            <View wrap={false}>
              <Text style={s.grupo}>
                {titulo} · {(() => {
                  const n = fs.reduce((a, f) => a + (f.serie ? 1 : f.cantidad), 0);
                  return `${n} ${n === 1 ? "equipo" : "equipos"}`;
                })()}
              </Text>
              <View style={s.th}>
                <Text style={[s.thTxt, { width: COL.codigo }]}>CÓDIGO</Text>
                <Text style={[s.thTxt, { width: COL.modelo }]}>MOD.</Text>
                <Text style={[s.thTxt, { width: COL.equipo }]}>EQUIPO</Text>
                <Text style={[s.thTxt, { width: COL.stock }]}>STOCK</Text>
                <Text style={[s.thTxt, { width: COL.marca }]}>MARCA</Text>
                <Text style={[s.thTxt, { width: COL.serie }]}>SERIE</Text>
                <Text style={[s.thTxt, { width: COL.disp }]}>DISPONIBLE</Text>
                <Text style={[s.thTxt, { width: COL.estado }]}>ESTADO</Text>
                <Text style={[s.thTxt, { width: COL.decision, borderRightWidth: 0 }]}>DECISIÓN</Text>
              </View>
            </View>
            {fs.map((f, i) => {
              const cod = codigoUsar(f);
              const esNuevo = !!cod && !existentes.has(cod);
              const cambio = !!f.codigoExcel && !!cod && f.codigoExcel !== cod;
              return (
                <View key={`${f.hoja}-${f.fila}-${i}`} style={[s.fila, { backgroundColor: FONDO[f.estado] }]} wrap={false}>
                  <View style={[s.celda, { width: COL.codigo }]}>
                    {cod ? <Text style={[s.codigo, esNuevo ? { color: TINTA.nuevo } : {}]}>{cod}</Text> : <Text style={{ color: TINTA.revisar }}>Falta código</Text>}
                    {esNuevo && <Text style={[s.chico, { color: TINTA.nuevo }]}>nuevo</Text>}
                    {cambio && <Text style={s.chico}>Excel: {f.codigoExcel}</Text>}
                  </View>
                  <View style={[s.celda, { width: COL.modelo }]}>
                    <Text>{cortable(f.modelo)}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.equipo }]}>
                    <Text>{cortable(f.descripcion)}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.stock, alignItems: "center" }]}>
                    <Text>{f.serie ? 1 : f.cantidad}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.marca }]}>
                    <Text>{marcaDe(f)}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.serie }]}>
                    <Text>{f.serie ? cortable(f.serie) : "sin serie de placa"}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.disp }]}>
                    <Text>{/^[\d.,\s-]*$/.test(f.ubicacion ?? "") ? "PLANTA" : f.ubicacion!.toUpperCase()}</Text>
                  </View>
                  <View style={[s.celda, { width: COL.estado }]}>
                    <Text style={{ color: TINTA[f.estado], fontFamily: f.estado === "ok" ? "Helvetica" : "Helvetica-Bold" }}>{etiquetaEstado(f)}</Text>
                    {f.ocupada && (
                      <Text style={s.chico}>
                        {f.ocupada.cliente ?? "cliente"}
                        {f.ocupada.pedido ? ` · ${f.ocupada.pedido}` : ""}
                      </Text>
                    )}
                  </View>
                  <View style={[s.celda, { width: COL.decision, borderRightWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }]}>
                    <Casilla decision={f.decision} />
                    <Text>{TEXTO_DECISION[f.decision]}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        <View style={s.firmas} wrap={false}>
          <Text style={s.firma}>Revisado por (operaciones)</Text>
          <Text style={s.firma}>Importaciones</Text>
          <Text style={s.firma}>Visto bueno (gerencia)</Text>
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTexto}>CRM Efameinsa · Stock y códigos · {archivo} · sin costos</Text>
          <Text style={s.pieTexto}>{generado}</Text>
        </View>
      </Page>
    </Document>
  );
}
