// Quita las ventas históricas duplicadas que dejó la importación del Excel.
//
// QUÉ PASÓ (detectado por Darwin el 20-08 mirando la ficha de HILANDERIA DE
// ALGODÓN PERUANO: tres compras idénticas de US$ 96.000 el mismo día):
// en las hojas COTIZ de los comerciales, una venta con varios equipos ocupa
// UNA FILA POR EQUIPO, y en todas se repite el importe TOTAL de la venta. El
// importador creó una oportunidad y una venta por cada fila, así que esa venta
// quedó contada tantas veces como equipos tenía.
//
// POR QUÉ SON DUPLICADOS Y NO VENTAS DISTINTAS — tres evidencias:
//   1. comparten el mismo Nº de presupuesto, y un presupuesto es una venta;
//   2. comparten cliente, fecha e importe EXACTO;
//   3. cuando una cotización tiene varios equipos, sus precios son distintos
//      (p. ej. 29.500 / 21.900 / 11.999 en el archivo de documentos). Tres
//      importes idénticos no son tres equipos: es el total repetido.
//
// De cada grupo se conserva la fila más antigua y se borran las demás junto
// con la oportunidad y la actividad que el importador creó para ellas. Se
// comprueba antes que no cuelgue nada más (cotizaciones del CRM, adjuntos).
//
// Uso:
//   node --env-file=.env.local scripts/deduplicar-ventas-historicas.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// Grupos de ventas idénticas: mismo cliente, fecha, importe y Nº de
// presupuesto. `is not distinct from` no hace falta porque group by ya trata
// los NULL como iguales entre sí.
const SQL_GRUPOS = `
  with g as (
    select o.cuenta_id, v.fecha_venta, v.monto_total, v.referencia_historica,
           count(*) as n,
           array_agg(v.id order by v.created_at, v.id) as ventas,
           array_agg(v.oportunidad_id order by v.created_at, v.id) as ops
    from ventas v
    join oportunidades o on o.id = v.oportunidad_id
    where v.origen = 'historico_excel'
    group by 1,2,3,4
    having count(*) > 1
  )
  select * from g`;

const { rows: grupos } = await c.query(SQL_GRUPOS);
const ventasSobrantes = grupos.flatMap((g) => g.ventas.slice(1));
const opsSobrantes = grupos.flatMap((g) => g.ops.slice(1));
const usdInflado = grupos.reduce((s, g) => s + Number(g.monto_total) * (Number(g.n) - 1), 0);

console.log(`\nGrupos duplicados: ${grupos.length}`);
console.log(`Ventas a eliminar: ${ventasSobrantes.length} (se conserva la más antigua de cada grupo)`);
console.log(`Oportunidades a eliminar: ${opsSobrantes.length}`);
console.log(`Monto inflado que se corrige: US$ ${Math.round(usdInflado).toLocaleString("es-PE")}`);

// Control de seguridad: no borrar una oportunidad de la que cuelgue algo que
// no sea la actividad del propio importador.
const { rows: [riesgo] } = await c.query(
  `select
     (select count(*)::int from cotizaciones where oportunidad_id = any($1)) as cotizaciones,
     (select count(*)::int from actividades where oportunidad_id = any($1)) as actividades,
     (select count(*)::int from actividades where oportunidad_id = any($1) and adjuntos <> '[]'::jsonb) as con_adjuntos,
     (select count(*)::int from ventas where oportunidad_id = any($1) and not (id = any($2))) as ventas_ajenas`,
  [opsSobrantes, ventasSobrantes],
);
console.log(`\nDe esas oportunidades cuelgan: ${riesgo.actividades} actividades (${riesgo.con_adjuntos} con adjuntos), ${riesgo.cotizaciones} cotizaciones del CRM, ${riesgo.ventas_ajenas} ventas que NO son las sobrantes.`);
if (riesgo.cotizaciones > 0 || riesgo.con_adjuntos > 0 || riesgo.ventas_ajenas > 0) {
  console.error("\n✗ Hay información real colgando de esas oportunidades. No se borra nada: revisar a mano.");
  await c.end();
  process.exit(1);
}

console.log("\nEjemplos (los 5 grupos de mayor importe):");
for (const g of [...grupos].sort((a, b) => Number(b.monto_total) - Number(a.monto_total)).slice(0, 5)) {
  const { rows: [cu] } = await c.query(`select razon_social from cuentas where id = $1`, [g.cuenta_id]);
  console.log(`  ${String(g.fecha_venta).slice(0, 10)}  US$ ${String(Math.round(g.monto_total)).padStart(7)} × ${g.n}  ppto ${String(g.referencia_historica ?? "—").padEnd(10)} ${cu.razon_social.slice(0, 34)}`);
}

if (!APLICAR) {
  console.log("\nSimulación — no se borró nada. Repita con --aplicar.");
  await c.end();
  process.exit(0);
}

try {
  await c.query("begin");
  const { rowCount: nAct } = await c.query(`delete from actividades where oportunidad_id = any($1)`, [opsSobrantes]);
  const { rowCount: nVen } = await c.query(`delete from ventas where id = any($1)`, [ventasSobrantes]);
  const { rowCount: nOp } = await c.query(`delete from oportunidades where id = any($1)`, [opsSobrantes]);
  await c.query("commit");
  console.log(`\n✓ Eliminadas ${nVen} ventas, ${nOp} oportunidades y ${nAct} actividades.`);
} catch (e) {
  await c.query("rollback");
  console.error("\n✗ Error — se revirtió todo:", e.message);
  await c.end();
  process.exit(1);
}

const { rows: quedan } = await c.query(SQL_GRUPOS);
console.log(quedan.length === 0 ? "✓ No quedan duplicados." : `⚠️ Quedan ${quedan.length} grupos — revisar.`);

const { rows: [t] } = await c.query(
  `select count(*)::int as ventas, round(sum(monto_total))::int as usd from ventas where origen = 'historico_excel'`);
console.log(`Histórico ahora: ${t.ventas} ventas, US$ ${Number(t.usd).toLocaleString("es-PE")}`);
await c.end();
