// FASE 4 — Carga en el CRM el JSON que produjo scripts/parsear-cotizaciones.mjs.
//
// Va a `cotizaciones_historicas` (migración 0036) y no a `cotizaciones`: esa
// tabla asigna el correlativo por trigger y es inmutable, y su serie ya emitió
// los números de las pruebas. El histórico es de solo consulta.
//
// Además del volcado hace dos cruces que son los que le dan valor:
//   · asesor → perfil. Se busca por codigo_comercial Y por codigo_anterior,
//     porque las cotizaciones viejas están firmadas con el código que la
//     persona tenía entonces (Brenda firmó cientos como C8 y hoy es C1).
//   · cliente → cuenta del CRM, por teléfono normalizado (identificador
//     fuerte) y, si no, por razón social exacta. Sin coincidencia queda null:
//     enlazar al cliente equivocado ensucia su ficha, y aquí no hay ningún
//     monto en juego que justifique arriesgarse.
//
// Uso:
//   node --env-file=.env.local scripts/importar-cotizaciones-historicas.mjs [--aplicar]

import { Client } from "pg";
import { readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const ORIGEN = "scripts/data/cotizaciones-historicas.json";
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const tel = (t) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length > 9 && d.startsWith("51") ? d.slice(2) : d || null; };

const cot = JSON.parse(readFileSync(ORIGEN, "utf8"));
console.log(`\n${cot.length} cotizaciones en ${ORIGEN}`);

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// --- Mapa de asesores, incluyendo códigos ya retirados ---
const { rows: perfiles } = await c.query(
  `select id, nombre, codigo_comercial, codigo_anterior from perfiles where rol = 'comercial'`);
const porCodigo = new Map();
for (const p of perfiles) {
  if (p.codigo_comercial) porCodigo.set(p.codigo_comercial.toUpperCase(), p);
  if (p.codigo_anterior) porCodigo.set(p.codigo_anterior.toUpperCase(), p); // C8 → Brenda (hoy C1)
}
console.log("asesores conocidos:", [...porCodigo.keys()].join(", "));

// --- Índices de cuentas para el cruce ---
const { rows: cuentas } = await c.query(`select id, razon_social from cuentas`);
const { rows: contactos } = await c.query(
  `select cuenta_id, telefono_normalizado from contactos where telefono_normalizado is not null and length(telefono_normalizado) >= 8`);
const porRazon = new Map();
for (const x of cuentas) { const k = norm(x.razon_social); if (k && !porRazon.has(k)) porRazon.set(k, x.id); }
const porTel = new Map();
for (const x of contactos) if (!porTel.has(x.telefono_normalizado)) porTel.set(x.telefono_normalizado, x.cuenta_id);
console.log(`índice: ${porRazon.size} razones sociales, ${porTel.size} teléfonos`);

// --- Preparar filas ---
const filas = [];
const stats = { sinAsesor: 0, asesorDesconocido: new Map(), cuentaTel: 0, cuentaRazon: 0, sinCuenta: 0 };
for (const x of cot) {
  const cod = x.asesorCodigo?.toUpperCase() ?? null;
  const perfil = cod ? porCodigo.get(cod) : null;
  if (!cod) stats.sinAsesor++;
  else if (!perfil) stats.asesorDesconocido.set(cod, (stats.asesorDesconocido.get(cod) ?? 0) + 1);

  const t = tel(x.telefono);
  let cuentaId = t ? porTel.get(t) : null;
  if (cuentaId) stats.cuentaTel++;
  else {
    cuentaId = porRazon.get(norm(x.cliente)) ?? null;
    if (cuentaId) stats.cuentaRazon++; else stats.sinCuenta++;
  }

  filas.push([
    x.serie, x.correlativo, x.anio,
    x.correlativo && x.anio ? `${x.correlativo}-${String(x.anio).slice(2)}` : null,
    x.fecha, (x.cliente ?? "(sin cliente)").slice(0, 300), t, x.correo, x.atencion,
    perfil?.id ?? null, cod, x.items ?? [], x.montoSinIgv, x.fuenteMonto,
    x.preciosEquipos ?? [], x.nEquipos, x.validezDias, x.base,
    cuentaId,
  ]);
}

console.log("\nPLAN:");
console.table([{
  cotizaciones: filas.length,
  "con asesor": filas.filter((f) => f[9]).length,
  "con cuenta del CRM": filas.filter((f) => f[18]).length,
  "con monto": filas.filter((f) => f[12] != null).length,
}]);
console.log(`  cuenta por teléfono: ${stats.cuentaTel} · por razón social: ${stats.cuentaRazon} · sin cruzar: ${stats.sinCuenta}`);
console.log(`  sin código de asesor en el documento: ${stats.sinAsesor}`);
if (stats.asesorDesconocido.size) {
  console.log(`  ⚠️ códigos firmados que no existen como perfil: ${[...stats.asesorDesconocido].map(([k, n]) => `${k}×${n}`).join(", ")}`);
  console.log("     (esas cotizaciones se cargan sin comercial: hay que crear el perfil o fusionarlo, no adivinar)");
}

if (!APLICAR) {
  console.log("\nSimulación — no se escribió nada. Repita con --aplicar.");
  await c.end();
  process.exit(0);
}

try {
  await c.query("begin");
  await c.query("truncate cotizaciones_historicas"); // recarga completa: la fuente son los documentos, no el CRM
  const COLS = 19;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const vals = lote.map((_, j) => `(${Array.from({ length: COLS }, (_, k) => `$${j * COLS + k + 1}`).join(",")})`).join(",");
    await c.query(
      `insert into cotizaciones_historicas
       (serie, correlativo, anio, codigo, fecha, cliente, telefono, correo, atencion,
        comercial_id, asesor_codigo, items, monto_sin_igv, fuente_monto, precios_equipos,
        n_equipos, validez_dias, archivo, cuenta_id)
       values ${vals} on conflict (serie, archivo) do nothing`,
      lote.flat(),
    );
    process.stdout.write(`\r  ${Math.min(i + 500, filas.length)}/${filas.length}…`);
  }
  await c.query("commit");
  console.log("\n✓ Cargado.");
} catch (e) {
  await c.query("rollback");
  console.error("\n✗ Error — se revirtió todo:", e.message);
  await c.end();
  process.exit(1);
}

const { rows: fin } = await c.query(`
  select serie, count(*)::int as n, count(comercial_id)::int as con_asesor,
         count(cuenta_id)::int as con_cuenta, count(monto_sin_igv)::int as con_monto,
         max(correlativo) filter (where anio = 2026) as ultimo_2026
  from cotizaciones_historicas group by serie order by serie`);
console.table(fin);
const { rows: porCom } = await c.query(`
  select coalesce(p.codigo_comercial, '—') as cod, coalesce(p.nombre, '(sin asesor)') as nombre,
         count(*)::int as cotizaciones, count(ch.monto_sin_igv)::int as con_monto
  from cotizaciones_historicas ch left join perfiles p on p.id = ch.comercial_id
  group by 1, 2 order by 3 desc`);
console.table(porCom);
await c.end();
