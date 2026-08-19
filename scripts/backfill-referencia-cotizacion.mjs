// Rellena ventas.referencia_historica (Nro_PPTO de la hoja COTIZ, ej.
// "1505-24") y equipo_historico en las 847 ventas importadas. El emparejado
// venta↔fila usa (comercial, fecha, monto) — la importación no guardó un id
// de fila; cuando varias filas comparten la clave se asignan en orden (en la
// práctica son la misma venta repetida con el mismo ppto, caso ADYSEM).
//
// Uso: node --env-file=.env.local scripts/backfill-referencia-cotizacion.mjs [--aplicar]

import { Client } from "pg";
import ventas from "./data/ventas-historicas-COTIZ-v2.json" with { type: "json" };

const APLICAR = process.argv.includes("--aplicar");

const excelFecha = (n) => (typeof n === "number" && n > 0 ? new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10) : null);
function parseMonto(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  let s = String(raw).trim();
  if (!s || /^\d+-\d+$/.test(s)) return null;
  s = s.replace(/^S\/\.?\s*/i, "").replace(/^(US\$|USD|\$)\s*/i, "").trim();
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = s.length - lc - 1 === 2 ? s.replace(/,(?=[^,]*$)/, ".").replace(/,/g, "") : s.replace(/,/g, "");
  else if (ld > -1 && (s.match(/\./g) || []).length > 1) s = s.replace(/\.(?=.*\.)/g, "");
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const filas = ventas
  .map((v) => ({
    carpeta: v.comercialCarpeta,
    fecha: excelFecha(v.fEstado) ?? excelFecha(v.fAccion),
    monto: parseMonto(v.monto),
    ppto: v.ppto ? String(v.ppto).trim() : null,
    equipo: v.equipo ? String(v.equipo).replace(/\s+/g, " ").trim() : null,
  }))
  .filter((v) => v.monto != null && (v.ppto || v.equipo));

const porClave = new Map();
for (const f of filas) {
  const k = `${f.carpeta}|${f.fecha}|${f.monto}`;
  if (!porClave.has(k)) porClave.set(k, []);
  porClave.get(k).push(f);
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
try {
  const { rows: dbVentas } = await pg.query(`
    select v.id, v.fecha_venta::text fecha, v.monto_total::float monto, p.codigo_comercial carpeta
    from ventas v join oportunidades o on o.id = v.oportunidad_id join perfiles p on p.id = o.comercial_id
    where v.origen = 'historico_excel' and v.referencia_historica is null
    order by v.created_at`);
  let asignadas = 0, sinMatch = 0;
  const updates = [];
  for (const v of dbVentas) {
    const k = `${v.carpeta}|${v.fecha.slice(0, 10)}|${v.monto}`;
    const candidatos = porClave.get(k);
    if (!candidatos || candidatos.length === 0) { sinMatch++; continue; }
    const f = candidatos.shift();
    updates.push([v.id, f.ppto, f.equipo]);
    asignadas++;
  }
  console.log(`Ventas históricas sin referencia: ${dbVentas.length} · con match: ${asignadas} · sin match: ${sinMatch}`);
  if (!APLICAR) { console.log("=== SIMULACIÓN (sin --aplicar) ==="); process.exit(0); }
  await pg.query("begin");
  for (const [id, ppto, equipo] of updates) {
    await pg.query("update ventas set referencia_historica = $2, equipo_historico = $3 where id = $1", [id, ppto, equipo]);
  }
  await pg.query("commit");
  console.log(`✓ ${updates.length} ventas actualizadas con su referencia de cotización.`);
} catch (e) {
  await pg.query("rollback").catch(() => {});
  console.error("✗", e.message);
  process.exit(1);
} finally {
  await pg.end();
}
