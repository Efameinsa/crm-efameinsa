// Completa la ASIGNACIÓN de los leads históricos de publicidad con lo que
// registró Central en su maestro (U:\SEGUIMIENTO DE PROSPECTOS-2026.xls,
// hoja "Seguimiento"): a qué comercial se derivó y cuándo.
//
// Contexto (2026-08-18): los 450 leads de Google Ads del año figuran en el
// CRM como 'historico' (gestionados fuera del sistema) sin oportunidad, así
// que el embudo real de marketing mostraba 450 → 0 asignados → 0 ventas.
// Cruzando por teléfono normalizado, 226 aparecen en Central y 215 tienen
// comercial. Eso es lo que este script escribe en leads.asignado_a /
// asignado_at (solo si están vacíos). NO crea oportunidades — meterlas
// abiertas ensuciaría el pipeline de cada comercial con trabajo viejo, y
// cerrarlas exigiría inventar un motivo. El embudo cuenta como "asignado" a
// quien tenga oportunidad en el CRM o asignado_a (ver lib/marketing.ts).
//
// Lo que Central NO tiene: el desenlace. Se verificó (teléfono, nombre y
// nº de cotización vs ventas históricas): ninguno de los 450 terminó en una
// venta registrada. Ese 0 es real.
//
// Uso:
//   node --env-file=.env.local scripts/enlazar-leads-central.mjs [--archivo "U:/SEGUIMIENTO DE PROSPECTOS-2026.xls"] [--aplicar]

import XLSX from "xlsx";
import { Client } from "pg";

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : porDefecto;
}
const ARCHIVO = leerArgumento("archivo", "U:/SEGUIMIENTO DE PROSPECTOS-2026.xls");
const APLICAR = process.argv.includes("--aplicar");

const norm = (t) => {
  if (!t) return null;
  const d = String(t).replace(/\D/g, "");
  return d.length > 9 && d.startsWith("51") ? d.slice(2) : d || null;
};
const excelFecha = (serial) => {
  if (typeof serial !== "number" || serial <= 0) return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const wb = XLSX.readFile(ARCHIVO);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Seguimiento"], { header: 1, defval: null });
const H = rows[0];
const col = (n) => H.findIndex((h) => typeof h === "string" && h.trim().toUpperCase().startsWith(n));
const C = { codigo: col("CODIGO"), tel: col("TELÉFONO"), fAsig: col("FECHA/ASIG"), asignadoA: col("ASIGNADO A"), nCom: col("N° DE COMERCIAL"), area: col("AREA") };
for (const [k, v] of Object.entries(C)) if (v < 0) throw new Error(`columna no encontrada: ${k}`);

// Última fila de Central por teléfono (si el contacto entró varias veces, la
// asignación vigente es la más reciente).
const central = new Map();
for (const r of rows.slice(1)) {
  const t = norm(r[C.tel]);
  if (t) central.set(t, r);
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
try {
  const { rows: perfiles } = await pg.query("select id, codigo_comercial from perfiles where rol = 'comercial'");
  const idPorCodigo = new Map(perfiles.map((p) => [p.codigo_comercial, p.id]));

  const { rows: leads } = await pg.query(
    "select id, telefono_normalizado from leads where fuente in ('google_ads','meta_ads') and asignado_a is null and telefono_normalizado is not null",
  );
  const cambios = [];
  let enCentral = 0, sinComercial = 0, comercialDesconocido = 0;
  const porCodigo = {};
  for (const l of leads) {
    const r = central.get(l.telefono_normalizado);
    if (!r) continue;
    enCentral++;
    const codigo = "C" + String(r[C.nCom] ?? "").replace(/\D/g, "");
    if (codigo === "C") { sinComercial++; continue; }
    const comercialId = idPorCodigo.get(codigo);
    if (!comercialId) { comercialDesconocido++; continue; }
    porCodigo[codigo] = (porCodigo[codigo] ?? 0) + 1;
    cambios.push({ leadId: l.id, comercialId, asignadoAt: excelFecha(r[C.fAsig]), codigoCentral: r[C.codigo] });
  }
  console.log(`Leads de publicidad sin asignar con teléfono: ${leads.length}`);
  console.log(`  encontrados en Central: ${enCentral}`);
  console.log(`  con comercial reconocido (se asignan): ${cambios.length} → ${JSON.stringify(porCodigo)}`);
  console.log(`  en Central pero sin nº de comercial: ${sinComercial} · con código sin perfil en el CRM: ${comercialDesconocido}`);
  console.log(`  no aparecen en Central: ${leads.length - enCentral}`);

  if (!APLICAR) {
    console.log("\n=== SIMULACIÓN (sin --aplicar, no se escribe nada) ===");
  } else {
    await pg.query("begin");
    let n = 0;
    for (const c of cambios) {
      const r = await pg.query(
        `update leads set asignado_a = $2, asignado_at = coalesce($3::timestamptz, asignado_at, recibido_at),
           mensaje = case when $4::text is null then mensaje else concat_ws(' · ', mensaje, 'Central: ' || $4::text) end
         where id = $1 and asignado_a is null`,
        [c.leadId, c.comercialId, c.asignadoAt ? `${c.asignadoAt}T12:00:00-05:00` : null, c.codigoCentral ?? null],
      );
      n += r.rowCount;
    }
    await pg.query("commit");
    console.log(`\n✓ ${n} leads actualizados con la asignación de Central`);
  }
} catch (e) {
  await pg.query("rollback").catch(() => {});
  console.error("✗", e.message);
  process.exit(1);
} finally {
  await pg.end();
}
