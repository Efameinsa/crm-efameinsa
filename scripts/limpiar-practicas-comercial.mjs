// ============================================================
// CRM EFAMEINSA · Saca del medio todo lo de práctica del área comercial
// ============================================================
// Darwin, 28-08, al cerrar el tema con Central: «eliminá todas las cuentas de
// prueba del área comercial, pruebas de todo tipo, para que no le estorben, y
// dejemos todo listo para que ella gestione».
//
// QUÉ BORRA, y por qué se puede identificar sin ambigüedad:
//   · Los contactos marcados `es_prueba` (los del banco de pruebas).
//   · Todo lo que cuelga de los comerciales de práctica C0 y LOG2 —clientes,
//     oportunidades, cotizaciones, gestiones—: son perfiles marcados
//     `es_prueba`, no hay nada real ahí.
//
// QUÉ NO TOCA:
//   · Los perfiles de práctica en sí (C0, LOG2, Central práctica): quedan para
//     poder volver a sembrar un ensayo cuando haga falta. Vacíos no estorban.
//   · El banco de PV0, que es el de postventa y lo usa otra área.
//   · Nada real: no se busca por «prueba» en la razón social, que devolvería
//     clientes de verdad (TESTIGOS DE JEHOVÁ, CIVILTESTING…). Se va por el
//     dueño y por la marca `es_prueba`, que no admite interpretación.
//
// Por defecto solo muestra el plan. Para ejecutarlo: --ejecutar
// Uso: node --env-file=.env.local scripts/limpiar-practicas-comercial.mjs [--ejecutar]

import { Client } from "pg";

const EJECUTAR = process.argv.includes("--ejecutar");
const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: perfiles } = await bd.query(
  "select id, nombre, codigo_comercial from perfiles where es_prueba and codigo_comercial = any($1)",
  [["C0", "LOG2"]],
);
const ids = perfiles.map((p) => p.id);
console.log(`Comerciales de práctica: ${perfiles.map((p) => p.codigo_comercial).join(", ") || "(ninguno)"}`);

const cuenta = async (titulo, sql, params = []) => {
  const { rows } = await bd.query(sql, params);
  console.log(`   ${String(rows[0].n).padStart(4)}  ${titulo}`);
  return Number(rows[0].n);
};

console.log("\nSe va a borrar:");
await cuenta("contactos marcados de práctica", "select count(*)::int n from leads where es_prueba");
await cuenta(
  "clientes de los comerciales de práctica",
  "select count(*)::int n from cuentas where comercial_id = any($1)",
  [ids],
);
await cuenta(
  "oportunidades suyas",
  "select count(*)::int n from oportunidades where comercial_id = any($1)",
  [ids],
);
await cuenta(
  "cotizaciones suyas",
  `select count(*)::int n from cotizaciones c join oportunidades o on o.id = c.oportunidad_id
    where o.comercial_id = any($1)`,
  [ids],
);

if (!EJECUTAR) {
  console.log("\nEnsayo: no se borró nada. Con --ejecutar se ejecuta.");
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  // Las cotizaciones enviadas son inmutables por diseño (migración 0012): un
  // disparador impide tocarles los equipos, y con razón —lo que salió al
  // cliente no se edita—. Para BORRAR lo de práctica hay que apagarlo un
  // momento; queda dentro de esta transacción y no toca ninguna real.
  await bd.query("set local session_replication_role = replica");
  // El orden importa: primero lo que apunta a la oportunidad, después la
  // oportunidad, después el cliente. Los contactos de práctica van al final
  // porque las oportunidades los referencian.
  const ops = (
    await bd.query(
      `select o.id from oportunidades o
        where o.comercial_id = any($1)
           or o.cuenta_id in (select id from cuentas where comercial_id = any($1))
           or o.lead_id in (select id from leads where es_prueba)`,
      [ids],
    )
  ).rows.map((r) => r.id);

  if (ops.length) {
    await bd.query(
      "delete from cotizacion_items where cotizacion_id in (select id from cotizaciones where oportunidad_id = any($1))",
      [ops],
    );
    await bd.query("delete from ventas where oportunidad_id = any($1)", [ops]).catch(() => {});
    await bd.query("delete from cotizaciones where oportunidad_id = any($1)", [ops]);
    await bd.query("delete from actividades where oportunidad_id = any($1)", [ops]);
    await bd.query("delete from oportunidades where id = any($1)", [ops]);
  }

  const { rowCount: leadsBorrados } = await bd.query("delete from leads where es_prueba");
  const { rowCount: cuentasBorradas } = await bd.query(
    "delete from cuentas where comercial_id = any($1)",
    [ids],
  );

  await bd.query("commit");
  console.log(
    `\n✓ Borrado: ${ops.length} oportunidad(es), ${leadsBorrados} contacto(s) de práctica y ${cuentasBorradas} cliente(s).`,
  );
  console.log("Los perfiles C0 y LOG2 quedan, vacíos, para poder volver a sembrar un ensayo.");
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}
await bd.end();
