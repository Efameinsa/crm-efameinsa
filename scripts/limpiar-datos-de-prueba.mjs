// Borra lo que se cargó A MANO en el CRM durante las demos del 14 y 19 de
// agosto de 2026: la cuenta inventada, sus leads y contactos, y las
// oportunidades `origen='crm'` con todo lo que cuelga de ellas.
//
// Por qué se puede identificar sin ambigüedad: TODO lo real entró importado
// (`origen='historico_excel'`), así que `origen='crm'` es exactamente lo que
// alguien tecleó en pantalla. No se usa el nombre del cliente como criterio:
// buscar "test|demo|prueba" en la razón social devuelve CLIENTES REALES
// (TESTIGOS DE JEHOVÁ, CIVILTESTING, TESTRUCTURA, NICODEMO) — se borrarían
// cuentas de verdad.
//
// Por defecto solo muestra el plan. Para ejecutarlo: --ejecutar
// Uso: node --env-file=.env.local scripts/limpiar-datos-de-prueba.mjs [--ejecutar]

import { Client } from "pg";

const EJECUTAR = process.argv.includes("--ejecutar");
const CUENTAS_INVENTADAS = ["Sideral Prueba"];

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: cuentas } = await bd.query(
  "select id, razon_social from cuentas where razon_social = any($1)", [CUENTAS_INVENTADAS]);
const idsCuentas = cuentas.map((c) => c.id);

const { rows: ops } = await bd.query(
  `select o.id, o.etapa, c.razon_social
   from oportunidades o join cuentas c on c.id = o.cuenta_id
   where o.origen = 'crm' or o.cuenta_id = any($1)
   order by c.razon_social`, [idsCuentas]);
const idsOps = ops.map((o) => o.id);

async function detalle(sql, params) {
  const { rows } = await bd.query(sql, params);
  return rows;
}

const cots = await detalle(
  `select c.id, c.codigo, c.serie, c.total, cu.razon_social
   from cotizaciones c join oportunidades o on o.id=c.oportunidad_id join cuentas cu on cu.id=o.cuenta_id
   where c.oportunidad_id = any($1) order by c.created_at`, [idsOps]);
const ventas = await detalle(
  `select v.id, v.monto_total, v.moneda, v.fecha_venta, cu.razon_social
   from ventas v join oportunidades o on o.id=v.oportunidad_id join cuentas cu on cu.id=o.cuenta_id
   where v.oportunidad_id = any($1)`, [idsOps]);
const acts = await detalle(
  "select id, tipo, realizada_at from actividades where oportunidad_id = any($1) order by realizada_at", [idsOps]);
// Las gestiones tecleadas durante la demo NO siempre cuelgan de una
// oportunidad del CRM: en la reunión del 19 se registró una llamada sobre una
// oportunidad importada. Se reconocen porque el histórico entero entró como
// `tipo='nota'` — cualquier otro tipo se escribió en pantalla — y porque las
// firma la cuenta genérica de gerencia, que no es de ninguna persona real.
const actsSueltas = await detalle(
  `select a.id, a.tipo, a.realizada_at, cu.razon_social
   from actividades a
   join oportunidades o on o.id = a.oportunidad_id
   join cuentas cu on cu.id = o.cuenta_id
   join perfiles p on p.id = a.realizada_por
   where a.tipo <> 'nota' and o.origen <> 'crm' and p.nombre = 'Gerencia Comercial'`, []);
const leads = await detalle(
  "select id, codigo, nombre_contacto from leads where cuenta_id = any($1)", [idsCuentas]);
const contactos = await detalle("select id, nombre from contactos where cuenta_id = any($1)", [idsCuentas]);
// tareas_agenda cuelga del comercial, no de la oportunidad: no entra acá.
const asignaciones = await detalle("select id from asignaciones where cuenta_id = any($1)", [idsCuentas]);

console.log(EJECUTAR ? "EJECUTANDO EL BORRADO\n" : "PLAN (nada se borra; agregue --ejecutar)\n");
console.log(`Cuentas inventadas         ${cuentas.length}`);
for (const c of cuentas) console.log(`   · ${c.razon_social}`);
console.log(`Oportunidades escritas     ${ops.length}`);
for (const o of ops) console.log(`   · ${o.etapa.padEnd(12)} ${o.razon_social}`);
console.log(`Cotizaciones               ${cots.length}`);
for (const c of cots) console.log(`   · ${(c.codigo ?? "?").padEnd(9)} ${c.serie.padEnd(9)} ${String(c.total).padStart(9)} · ${c.razon_social?.slice(0, 40)}`);
console.log(`Ventas                     ${ventas.length}  (USD ${ventas.reduce((a, v) => a + Number(v.monto_total), 0).toLocaleString("es-PE")})`);
for (const v of ventas) console.log(`   · ${v.moneda} ${v.monto_total} del ${v.fecha_venta.toISOString().slice(0, 10)} · ${v.razon_social?.slice(0, 40)}`);
console.log(`Gestiones                  ${acts.length + actsSueltas.length}`);
for (const a of actsSueltas) console.log(`   · suelta: ${a.tipo} del ${a.realizada_at.toISOString().slice(0, 10)} · ${a.razon_social}`);
console.log(`Leads                      ${leads.length}`);
console.log(`Contactos                  ${contactos.length}`);
console.log(`Asignaciones de cartera    ${asignaciones.length}`);

// Lo que NO se toca, dicho explícitamente para que quede en el registro.
const { rows: intactos } = await bd.query(
  `select (select count(*) from ventas where origen='historico_excel')::int ventas,
          (select count(*) from oportunidades where origen='historico_excel')::int ops,
          (select count(*) from cotizaciones_historicas)::int cot_archivo,
          (select count(*) from cuentas)::int cuentas`);
console.log(`\nIntacto: ${intactos[0].ventas} ventas y ${intactos[0].ops} oportunidades del histórico, ${intactos[0].cot_archivo} cotizaciones del archivo, ${intactos[0].cuentas} cuentas.`);

if (!EJECUTAR) { await bd.end(); process.exit(0); }

// Todo en UNA transacción: si algo falla, no queda media limpieza.
await bd.query("begin");
try {
  // La migración 0012 vuelve inmutables los ítems de una cotización: su
  // trigger salta también al BORRAR, así que sin esto la limpieza se revierte
  // entera. `set local` dura solo esta transacción y desactiva los triggers,
  // incluidos los de clave foránea — por eso los ítems se borran a mano más
  // abajo en vez de confiar en el cascade.
  await bd.query("set local session_replication_role = replica");
  const borrar = async (etiqueta, sql, params) => {
    const { rowCount } = await bd.query(sql, params);
    console.log(`  ${etiqueta}: ${rowCount}`);
  };
  // Orden: de las hojas hacia la raíz, para no chocar con las claves foráneas.
  await borrar("ventas", "delete from ventas where oportunidad_id = any($1)", [idsOps]);
  await borrar("cotizacion_items", "delete from cotizacion_items where cotizacion_id in (select id from cotizaciones where oportunidad_id = any($1))", [idsOps]);
  await borrar("cotizaciones", "delete from cotizaciones where oportunidad_id = any($1)", [idsOps]);
  await borrar("actividades", "delete from actividades where oportunidad_id = any($1)", [idsOps]);
  await borrar("actividades sueltas", "delete from actividades where id = any($1)", [actsSueltas.map((a) => a.id)]);
  await borrar("asignaciones", "delete from asignaciones where cuenta_id = any($1)", [idsCuentas]);
  await borrar("oportunidades", "delete from oportunidades where id = any($1)", [idsOps]);
  await borrar("leads", "delete from leads where cuenta_id = any($1)", [idsCuentas]);
  await borrar("contactos", "delete from contactos where cuenta_id = any($1)", [idsCuentas]);
  await borrar("cuentas", "delete from cuentas where id = any($1)", [idsCuentas]);
  await bd.query("commit");
  console.log("\nListo.");
} catch (e) {
  await bd.query("rollback");
  console.error("\nNADA se borró — la transacción se revirtió:", e.message);
  process.exitCode = 1;
}
await bd.end();
