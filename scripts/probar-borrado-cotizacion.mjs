// Comprueba, contra la base real y dentro de una transacción que SIEMPRE se
// revierte, que la migración 0065 hace lo que dice: un comercial borra sus
// borradores y NO puede borrar una cotización que ya salió al cliente.
//
// Se simula la sesión del comercial con `set local role authenticated` y
// request.jwt.claims, que es como Postgres evalúa auth.uid() en Supabase.
//
// Uso: node --env-file=.env.local scripts/probar-borrado-cotizacion.mjs

import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

let fallos = 0;
const ok = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`  ${bien ? "✓" : "✗"} ${texto}`);
};

async function comoComercial(id, fn) {
  await bd.query(`set local role authenticated`);
  await bd.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]);
  try {
    return await fn();
  } finally {
    await bd.query(`reset role`);
  }
}

await bd.query("begin");
try {
  const { rows: cot } = await bd.query(`
    select c.id, c.codigo, c.estado, o.comercial_id
    from cotizaciones c join oportunidades o on o.id = c.oportunidad_id
    where o.comercial_id is not null
    order by c.created_at desc`);

  const borrador = cot.find((c) => c.estado === "borrador" && !c.codigo);
  const enviada = cot.find((c) => c.estado === "enviada");

  if (borrador) {
    const n = await comoComercial(borrador.comercial_id, async () => {
      const r = await bd.query(`delete from cotizaciones where id = $1`, [borrador.id]);
      return r.rowCount;
    });
    ok(n === 1, `el dueño borra su borrador sin número (${n} fila)`);
  } else console.log("  (no hay borradores sin número para probar)");

  if (enviada) {
    const n = await comoComercial(enviada.comercial_id, async () => {
      const r = await bd.query(`delete from cotizaciones where id = $1`, [enviada.id]);
      return r.rowCount;
    });
    ok(n === 0, `el dueño NO puede borrar ${enviada.codigo}, que ya salió al cliente (${n} filas)`);
  } else console.log("  (no hay cotizaciones enviadas para probar)");

  // Un comercial ajeno tampoco.
  const { rows: otro } = await bd.query(
    `select id from perfiles where rol = 'comercial' and id <> $1 limit 1`,
    [borrador?.comercial_id ?? enviada?.comercial_id],
  );
  if (borrador && otro.length) {
    const n = await comoComercial(otro[0].id, async () => {
      const r = await bd.query(`delete from cotizaciones where id = $1`, [borrador.id]);
      return r.rowCount;
    });
    ok(n === 0, `otro comercial no puede borrar un borrador ajeno (${n} filas)`);
  }
} finally {
  await bd.query("rollback");
  console.log("\n(Todo revertido: la base quedó como estaba.)");
}

await bd.end();
process.exit(fallos > 0 ? 1 : 0);
