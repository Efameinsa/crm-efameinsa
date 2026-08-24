// Comprueba, contra la base real, lo que pidió el área comercial el 24-08:
// «en semi industriales ya están definidos los precios, pero en industriales
// por lo general se necesita aprobar por gerencia, así que mejor siempre pida
// aprobación».
//
// Todo corre dentro de una transacción que SIEMPRE se revierte: crea
// cotizaciones de prueba, mira cómo quedan y deshace. No deja nada en
// producción ni mueve correlativos (que ahora se asignan al enviar).
//
// Se simula la sesión del comercial con `set local role authenticated`, porque
// crear_cotizacion() usa auth.uid() y es_backoffice().
//
// Uso: node --env-file=.env.local scripts/probar-aprobacion-industrial.mjs

import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

let fallos = 0;
const ok = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`  ${bien ? "✓" : "✗"} ${texto}${detalle ? ` — ${detalle}` : ""}`);
};

async function comoComercial(id, fn) {
  await bd.query(`set local role authenticated`);
  await bd.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await bd.query(`reset role`);
  }
}

/** Un equipo del segmento pedido, con su precio piso vigente. */
async function equipo(segmento) {
  const { rows } = await bd.query(
    `select p.id, p.marca, p.modelo, p.segmento, pp.tier, pp.precio
       from productos p
       join precios_producto pp on pp.producto_id = p.id and pp.vigente_hasta is null
      where p.activo and p.segmento = $1
        and pp.tier = (case when p.segmento = 'semi_industrial' then 'deseado' else 'base' end)::tier_precio
      limit 1`,
    [segmento],
  );
  if (rows.length === 0) throw new Error(`No hay equipo ${segmento} con precio piso`);
  return rows[0];
}

await bd.query("begin");
try {
  const { rows: ops } = await bd.query(`
    select o.id, o.comercial_id from oportunidades o
    where o.comercial_id is not null and o.cuenta_id is not null
      and o.updated_at < now() - interval '12 hours'
    limit 1`);
  if (ops.length === 0) throw new Error("No hay una oportunidad vieja para la prueba");
  const op = ops[0];

  const ind = await equipo("industrial");
  const semi = await equipo("semi_industrial");
  console.log(`industrial de prueba : ${ind.marca} ${ind.modelo} · piso ${ind.precio}`);
  console.log(`semi de prueba       : ${semi.marca} ${semi.modelo} · piso ${semi.precio}\n`);

  const crear = (items) =>
    comoComercial(op.comercial_id, async () => {
      const { rows } = await bd.query(`select crear_cotizacion($1, 'EFAMEINSA', $2::jsonb) id`, [
        op.id,
        JSON.stringify(items),
      ]);
      return rows[0].id;
    });

  const estado = async (id) => {
    const { rows } = await bd.query(
      `select c.estado_aprobacion,
              count(*) filter (where ci.requiere_aprobacion)::int requieren,
              count(*)::int items
         from cotizaciones c join cotizacion_items ci on ci.cotizacion_id = c.id
        where c.id = $1 group by 1`,
      [id],
    );
    return rows[0];
  };

  // 1. Industrial AL PRECIO DE LISTA. Antes salía auto-aprobado.
  const a = await estado(
    await crear([{ producto_id: ind.id, cantidad: 1, precio_unitario: Number(ind.precio) }]),
  );
  ok(a.estado_aprobacion === "pendiente_gerencia", "un industrial al precio de lista va a gerencia", a.estado_aprobacion);
  ok(a.requieren === 1, "y el equipo queda marcado para decidir", `${a.requieren}/${a.items}`);

  // 2. Semi-industrial al precio de lista: sigue saliendo solo.
  const b = await estado(
    await crear([{ producto_id: semi.id, cantidad: 1, precio_unitario: Number(semi.precio) }]),
  );
  ok(b.estado_aprobacion === "auto_aprobada", "un semi-industrial al precio de lista NO molesta a gerencia", b.estado_aprobacion);
  ok(b.requieren === 0, "y no aparece nada por decidir", `${b.requieren}/${b.items}`);

  // 3. Semi-industrial POR DEBAJO del piso: la regla vieja sigue viva.
  const c = await estado(
    await crear([{ producto_id: semi.id, cantidad: 1, precio_unitario: Number(semi.precio) - 100 }]),
  );
  ok(c.estado_aprobacion === "pendiente_gerencia", "un semi-industrial bajo el piso sigue yendo a gerencia", c.estado_aprobacion);

  // 4. Mezcla: solo el industrial se decide, el semi en lista queda de contexto.
  const idMix = await crear([
    { producto_id: ind.id, cantidad: 1, precio_unitario: Number(ind.precio) },
    { producto_id: semi.id, cantidad: 1, precio_unitario: Number(semi.precio) },
  ]);
  const d = await estado(idMix);
  ok(d.estado_aprobacion === "pendiente_gerencia", "una cotización mixta va a gerencia", d.estado_aprobacion);
  ok(d.requieren === 1 && d.items === 2, "y solo se decide sobre el industrial", `${d.requieren} de ${d.items}`);

  // 5. No se puede enviar sin aprobar: es la barrera que protege al cliente.
  let bloqueado = false;
  try {
    await bd.query(`update cotizaciones set estado = 'enviada', enviada_at = now() where id = $1`, [idMix]);
  } catch {
    bloqueado = true;
  }
  ok(bloqueado, "y no se puede enviar mientras gerencia no la apruebe");
} finally {
  await bd.query("rollback");
  console.log("\n(Todo revertido: la base quedó como estaba.)");
}

await bd.end();
process.exit(fallos > 0 ? 1 : 0);
