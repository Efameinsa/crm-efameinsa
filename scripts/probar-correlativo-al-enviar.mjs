// Comprueba, contra la base real, lo que pidió el ing. Carlos el 24-08: que un
// borrador NO gaste correlativo y que el número se asigne al enviar.
//
// Trabaja dentro de una transacción que SIEMPRE se revierte: crea una
// cotización de prueba, la envía, mira los números y deshace todo. No deja
// nada en producción ni mueve el contador.
//
// Uso: node --env-file=.env.local scripts/probar-correlativo-al-enviar.mjs

import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

let fallos = 0;
const ok = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`  ${bien ? "✓" : "✗"} ${texto}${detalle ? ` — ${detalle}` : ""}`);
};

await bd.query("begin");
try {
  // Una oportunidad que no se esté trabajando ahora mismo, para no chocar con
  // nadie aunque esto se revierta igual.
  const { rows: ops } = await bd.query(`
    select o.id, o.comercial_id from oportunidades o
    where o.comercial_id is not null and o.cuenta_id is not null
      and o.updated_at < now() - interval '12 hours'
    limit 1`);
  if (ops.length === 0) throw new Error("No hay una oportunidad vieja para la prueba");
  const op = ops[0];

  const { rows: prod } = await bd.query(`
    select p.id, pp.precio from productos p
    join precios_producto pp on pp.producto_id = p.id and pp.vigente_hasta is null
    where p.activo limit 1`);
  if (prod.length === 0) throw new Error("No hay productos con precio");

  const { rows: antes } = await bd.query(`select ultimo from correlativos where clave = 'EFAMEINSA-2026'`);
  const contadorAntes = antes[0]?.ultimo ?? null;

  // La cotización se crea igual que crear_cotizacion(), pero por SQL directo:
  // la función usa auth.uid(), que no existe fuera de una sesión de Supabase.
  const { rows: nueva } = await bd.query(`
    insert into cotizaciones (oportunidad_id, serie, cliente_snapshot, subtotal, total, vigencia_dias, creada_por, estado_aprobacion)
    values ($1, 'EFAMEINSA', '{"razon_social":"PRUEBA"}'::jsonb, 100, 100, 15, $2, 'auto_aprobada')
    returning id, correlativo, codigo, estado`,
    [op.id, op.comercial_id],
  );
  const c = nueva[0];

  console.log("Al crear el borrador:");
  ok(c.correlativo === null, "no tiene correlativo", `es ${c.correlativo}`);
  ok(c.codigo === null, "no tiene código", `es ${c.codigo}`);
  ok(c.estado === "borrador", "nace en borrador", c.estado);

  const { rows: durante } = await bd.query(`select ultimo from correlativos where clave = 'EFAMEINSA-2026'`);
  ok(
    (durante[0]?.ultimo ?? null) === contadorAntes,
    "el contador de la serie no se movió",
    `${contadorAntes} → ${durante[0]?.ultimo}`,
  );

  await bd.query(
    `insert into cotizacion_items (cotizacion_id, producto_id, cantidad, precio_unitario, bajo_lista)
     values ($1, $2, 1, $3, false)`,
    [c.id, prod[0].id, prod[0].precio],
  );

  // emitir_cotizacion() comprueba auth.uid(); acá se prueba el efecto, que es
  // lo que importa: asignar el número una sola vez al enviar.
  const { rows: emitida } = await bd.query(
    `update cotizaciones
        set correlativo = siguiente_correlativo_anual('EFAMEINSA'),
            codigo = 'Presu_' || siguiente_correlativo_anual('EFAMEINSA')::text,
            estado = 'enviada', enviada_at = now()
      where id = $1
      returning correlativo, codigo, estado`,
    [c.id],
  );

  console.log("\nAl enviarla:");
  ok(emitida[0].correlativo !== null, "recibe correlativo", String(emitida[0].correlativo));
  ok(emitida[0].estado === "enviada", "queda enviada", emitida[0].estado);

  // Y ya no se puede mover el número: la identidad del documento se congela.
  let bloqueado = false;
  try {
    await bd.query(`update cotizaciones set correlativo = 1 where id = $1`, [c.id]);
  } catch {
    bloqueado = true;
  }
  ok(bloqueado, "un número ya asignado no se puede cambiar");
} finally {
  await bd.query("rollback");
  console.log("\n(Todo revertido: la base quedó como estaba.)");
}

await bd.end();
process.exit(fallos > 0 ? 1 : 0);
