// 03-09-2026 · Decisión de Carlos (reunión 11:41): «de la 447 a la 461 lo único que falta es subirlo, porque sí existen».
// cargada_por = admin@efameinsa.com (uuid); la carga se identifica por esa cuenta y la fecha.
// Carga a `cotizaciones_historicas` (solo consulta) los Word de antes del arranque del CRM que quedaron sin
// cargar: OPEN 448-461 (20 al 22-08) y EFAMEINSA 2177-2182, 2186 y 2187 (20 al 26-08). No toca `cotizaciones`
// ni los contadores. El 454 entra dos veces (Vidawasi e Ingeniería y Servicios) porque son dos documentos.
// Uso: node --env-file=.env.local scripts/cargar-word-previos-al-crm.mjs [--aplicar]
import { Client } from "pg";
import { readdirSync, statSync } from "node:fs";
const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p=[]) => (await bd.query(s, p)).rows;
const LOTE = [
  ["OPEN", 448, "C4"], ["OPEN", 449, "PV"], ["OPEN", 450, "C4"], ["OPEN", 451, "PV"], ["OPEN", 452, "C4"], ["OPEN", 453, "PV"],
  ["OPEN", 454, "PV"], ["OPEN", 455, "PV"], ["OPEN", 456, "PV"], ["OPEN", 457, "PV"], ["OPEN", 458, "PV"], ["OPEN", 459, null],
  ["OPEN", 460, "C4"], ["OPEN", 461, "C4"],
  ["EFAMEINSA", 2177, "C1"], ["EFAMEINSA", 2178, "C1"], ["EFAMEINSA", 2179, "C1"], ["EFAMEINSA", 2180, "C1"], ["EFAMEINSA", 2181, "C1"],
  ["EFAMEINSA", 2182, "C1"], ["EFAMEINSA", 2186, "C1"], ["EFAMEINSA", 2187, "C1"],
];
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const filas = [];
for (const [serie, n, asesor] of LOTE) {
  const dir = `U:/${serie}`;
  const docs = readdirSync(dir).filter(f => /\.docx?$/i.test(f) && new RegExp(`^Presu[_\s]*${n}\s*-\s*26`, "i").test(f));
  for (const f of docs) {
    const st = statSync(`${dir}/${f}`);
    if (serie === "EFAMEINSA" && st.mtime < new Date("2026-08-01")) continue; // los 448-461 de febrero son otra serie
    if (serie === "OPEN" && st.mtime < new Date("2026-08-01")) continue;
    const archivo = f.replace(/\.docx?$/i, "");
    const cliente = archivo.replace(/^Presu[_\s]*\d+\s*-\s*26[,;\s-]*/i, "").trim();
    const cuenta = (await q(`select id from cuentas where upper(razon_social) = $1 or upper(razon_social) like $2 limit 1`, [cliente.toUpperCase(), cliente.toUpperCase().replace(/ S\.?A\.?C?\.?$| E\.?I\.?R\.?L\.?$| S\.?A\.?$/, "") + "%"]))[0]?.id ?? null;
    const perfil = asesor ? (await q(`select id from perfiles where codigo_comercial = $1 and activo`, [asesor]))[0]?.id ?? null : null;
    filas.push({ serie, n, codigo: `${n}-26`, fecha: st.mtime.toISOString().slice(0, 10), cliente, archivo, asesor, perfil, cuenta });
  }
}
console.table(filas.map(f => ({ serie: f.serie, n: f.n, fecha: f.fecha, cliente: f.cliente.slice(0, 34), asesor: f.asesor, cuenta: f.cuenta ? "sí" : "no" })));
const ya = await q(`select serie::text serie, archivo from cotizaciones_historicas where anio = 2026 and ((serie='OPEN' and correlativo between 448 and 461) or (serie='EFAMEINSA' and correlativo in (2177,2178,2179,2180,2181,2182,2186,2187)))`);
console.log("ya cargadas antes:", ya.length);
if (!APLICAR) { console.log("== ENSAYO: nada cargado. Filas a cargar:", filas.length); await bd.end(); process.exit(0); }
let n = 0;
for (const f of filas) {
  const r = await bd.query(`insert into cotizaciones_historicas (serie, correlativo, anio, codigo, fecha, cliente, comercial_id, asesor_codigo, archivo, cuenta_id, cargada_por)
    values ($1, $2, 2026, $3, $4, $5, $6, $7, $8, $9, '7903ef3b-b139-4fa9-aaec-83f172ae7c69') on conflict (serie, archivo) do nothing`,
    [f.serie, f.n, f.codigo, f.fecha, f.cliente, f.perfil, f.asesor, f.archivo, f.cuenta]);
  n += r.rowCount;
}
console.log("== APLICADO: filas insertadas", n);
await bd.end();
