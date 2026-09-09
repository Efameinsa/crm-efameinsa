// LEE las guías de remisión de `X:\` (\\192.168.10.210\Almacen\guias) y las
// deja en un JSON local. NO escribe nada en el CRM ni toca el servidor.
//
// POR QUÉ IMPORTA: es el dato que faltaba desde el 01-09 para poder calcular
// la garantía de verdad —«la garantía corre DESDE LA GUÍA»— y para cerrar el
// paso «despacho concluido» que definió Carlos el 09-09. Cada guía trae el
// número, la fecha de salida, el RUC del cliente, lo que salió y, cuando es un
// equipo, LA SERIE dentro de la descripción.
//
//   node --env-file=.env.local scripts/_leer-guias-remision.mjs
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";

const RUTA = process.env.RUTA_GUIAS ?? "X:/";
const SALIDA = "scripts/data/guias-remision.json";

// La serie viaja dentro del texto de la descripción, con varias formas:
// «SERIE: 602KWZH3Y685», «SERIE 1234//», «N° DE SERIE: ABC». Se toma lo que
// venga después de la palabra, hasta el primer separador.
function serieDe(descripcion) {
  const t = String(descripcion ?? "");
  const m = t.match(/(?:N[°º]?\s*DE\s*)?SERIE\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,})/i);
  if (!m) return null;
  return m[1].replace(/[/.\-]+$/, "").trim().toUpperCase();
}

const archivos = readdirSync(RUTA).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"));
const guias = new Map();
const problemas = [];

for (const archivo of archivos) {
  // La serie del documento sale del nombre: «OPEN MAYO 2026» vs «MAYO 2026».
  const esOpen = /^OPEN\b/i.test(archivo);
  let wb;
  try {
    wb = XLSX.readFile(join(RUTA, archivo));
  } catch (e) {
    problemas.push({ archivo, error: e.message });
    continue;
  }
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null });
    for (const f of filas) {
      const numero = String(f["Numero Guia"] ?? "").trim();
      if (!numero) continue;
      const clave = `${esOpen ? "OPEN" : "EFAMEINSA"}|${numero}`;
      if (!guias.has(clave)) {
        guias.set(clave, {
          serieDocumento: esOpen ? "OPEN" : "EFAMEINSA",
          numero,
          archivo,
          emitida: f["Fecha Emision"] ?? null,
          traslado: f["Fecha Traslado"] ?? null,
          motivo: f["Motivo Traslado"] ?? null,
          cliente: f["Razon Social Destinatario"] ?? null,
          ruc: String(f["RUC Destinatario"] ?? "").replace(/\D/g, "") || null,
          recibe: null,
          items: [],
        });
      }
      const g = guias.get(clave);
      // La hoja «Encabezado» trae quién recibe; la de «Detalle», los ítems.
      const obs = String(f["Observaciones"] ?? "").trim();
      if (/^encabezado$/i.test(hoja)) {
        if (obs) g.recibe = obs;
        continue;
      }
      const descripcion = String(f["Descripcion"] ?? "").trim();
      if (!descripcion) continue;
      g.items.push({
        n: f["N Item"] ?? null,
        descripcion,
        cantidad: f["Cantidad"] ?? null,
        codigo: f["Codigo"] != null ? String(f["Codigo"]).trim() : null,
        serie: serieDe(descripcion),
      });
    }
  }
}

const lista = [...guias.values()].sort((a, b) => String(a.emitida).localeCompare(String(b.emitida)));
writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), ruta: RUTA, guias: lista }, null, 1), "utf8");

const items = lista.flatMap((g) => g.items);
const conSerie = items.filter((i) => i.serie);
const series = new Set(conSerie.map((i) => i.serie));
const rucs = new Set(lista.map((g) => g.ruc).filter(Boolean));
const porAnio = {};
for (const g of lista) {
  const a = String(g.emitida ?? "").slice(0, 4) || "?";
  porAnio[a] = (porAnio[a] ?? 0) + 1;
}

console.log(`Archivos leídos: ${archivos.length}${problemas.length ? ` (${problemas.length} con problema)` : ""}`);
console.log(`Guías: ${lista.length}  ·  ítems: ${items.length}  ·  con serie: ${conSerie.length}  ·  series distintas: ${series.size}`);
console.log(`RUC distintos: ${rucs.size}`);
console.log("Por año:", Object.entries(porAnio).sort().map(([a, n]) => `${a}: ${n}`).join(" · "));
console.log("Motivos:", [...new Set(lista.map((g) => g.motivo).filter(Boolean))].join(" · "));
for (const p of problemas) console.log(`  ✗ ${p.archivo}: ${p.error}`);
console.log(`\nGuardado en ${SALIDA}`);
