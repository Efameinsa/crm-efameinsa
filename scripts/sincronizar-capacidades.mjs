// ============================================================
// CRM EFAMEINSA · La capacidad del sistema = la celda «Capacidad» de la ficha
// ============================================================
// Reportado el 25-08: los UT030 salían como «14 kg» cuando sus Word dicen
// «14-16 kg». Dos causas encadenadas:
//
//   1. LAS FICHAS CAMBIARON DESPUÉS DE CARGARSE. Los UT030 se cargaron el
//      22-08 con lo que sus Word decían entonces («14 kg»); en la reunión de
//      HOY 10:25 las comerciales pidieron el rango («se ha puesto 14 kilos…
//      han solicitado que se modifique porque ellas cotizan así») y Jean Paul
//      editó los cuatro Word entre 11:56 y 12:02. Nadie volvió a extraer.
//      Y el chequeo de las 13:36 comparó solo las CARACTERÍSTICAS —idénticas—
//      y dio el visto bueno sin mirar la cabecera. Falsa tranquilidad.
//
//   2. EL EXTRACTOR NO SABÍA LEER RANGOS. Su patrón capturaba un solo número
//      pegado a «kg», así que «14-16 kg» habría quedado como «16 kg» aunque
//      se re-extrajera. Corregido en extraer-ficha-tecnica.mjs y acá.
//
// CÓMO LEE ESTE SCRIPT, y por qué no un regex suelto: un barrido por
// «N-N kg» en el texto pesca falsos rangos («7-40 kg» en la LAV350 es otra
// cosa, no su capacidad). Acá se busca la CELDA de la tabla de cabecera: la
// línea que dice «Capacidad» y, en las siguientes, la primera línea que ES
// un valor en kg. Es la misma celda que imprime el PDF.
//
// Uso: node --env-file=.env.local scripts/sincronizar-capacidades.mjs [--aplicar]

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CONVERTIDAS = "scripts/data/fichas-convertidas";

function textoConParrafos(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], { maxBuffer: 64e6, encoding: "latin1" });
  return Buffer.from(xml, "latin1").toString("utf-8")
    .replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]*>/g, "")
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
}
const docxDe = (ft) => {
  const w = ft.split("\\").join("/");
  if (/\.docx$/i.test(w)) return existsSync(w) ? w : null;
  const cv = join(CONVERTIDAS, basename(w).replace(/\.doc$/i, ".docx"));
  return existsSync(cv) ? cv : null;
};

/** La celda de capacidad: "14-16 kg", "14 -16kg", "10.2 kg", "2*14 KG". */
function capacidadDeCelda(linea) {
  const m = linea.match(/^(?:2\s*[*×]\s*)?(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*kgs?\.?$/i);
  if (!m) return null;
  const doble = /^2\s*[*×]/.test(linea) ? "2×" : "";
  return m[2] ? `${m[1]}-${m[2]} kg` : `${doble}${m[1]} kg`;
}

function capacidadDeFicha(docx) {
  const lineas = textoConParrafos(docx).slice(0, 20);
  const iCap = lineas.findIndex((l) => /^Capacidad$/i.test(l));
  // Con rótulo: el primer valor en kg de las líneas siguientes es su celda.
  const desde = iCap >= 0 ? iCap + 1 : 0;
  for (let i = desde; i < Math.min(desde + 10, lineas.length); i++) {
    const v = capacidadDeCelda(lineas[i]);
    if (v) return v;
  }
  return null;
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const { rows } = await bd.query(
  `select id, sku, capacidad, ficha->'origen'->>'ficha_tecnica' ft
     from productos where activo and ficha->'origen'->>'ficha_tecnica' is not null order by sku`,
);
const cambios = [];
for (const r of rows) {
  const d = docxDe(r.ft);
  if (!d) continue;
  let cap;
  try { cap = capacidadDeFicha(d); } catch { continue; }
  if (!cap || cap === r.capacidad) continue;
  // Las capacidades dobles de torre (2×14) ya están curadas a mano: no se pisan
  // con la lectura si la ficha no trae el formato de torre.
  if ((r.capacidad ?? "").includes("×") && !cap.includes("×")) continue;
  cambios.push({ r, cap });
  console.log(`  ${r.sku.padEnd(11)} «${r.capacidad ?? "—"}» → «${cap}»`);
}
console.log(`\n${cambios.length} capacidad(es) por sincronizar con su ficha.`);
if (!APLICAR) {
  console.log("Nada se ha modificado — agregá --aplicar.\n");
  await bd.end();
  process.exit(0);
}
for (const { r, cap } of cambios) {
  await bd.query(`update productos set capacidad = $2, updated_at = now() where id = $1`, [r.id, cap]);
}
console.log("✓ aplicado.");
await bd.end();
