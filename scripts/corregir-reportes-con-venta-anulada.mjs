// Los reportes diarios YA GUARDADOS no se arreglan solos.
//
// La 0174 corrigió el conteo de ventas anuladas en la vista y en las tres
// funciones que calculan métricas. Pero `reportes_diarios` guarda una FOTO del
// día: el reporte del 01-09 de Katerine quedó con la venta de Sierra Travel
// (2 250 USD) escrita adentro, y el cierre se anuló recién el 04-09.
//
// NO SE REGENERA EL REPORTE ENTERO, a propósito. El reporte trae también la
// agenda —«pendiente hoy», «vencidas», «mañana»— y esos números se calculan
// contra el estado ACTUAL de las oportunidades. Volver a correr la función hoy
// para el 01-09 daría una agenda que nunca existió ese día. Así que se toca
// solo lo que está mal: la lista de ventas y sus dos totales. Lo demás —las
// gestiones, las cotizaciones, los leads— pasó de verdad y se queda.
//
// Queda anotado dentro del propio reporte, en `ajuste_0174`, para que dentro
// de un mes se sepa por qué ese día cambió.
//
// Uso:  node --env-file=.env.local scripts/corregir-reportes-con-venta-anulada.mjs

import pg from "pg";

const bd = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p = []) => (await bd.query(s, p)).rows;

const tc = Number((await q(`select valor from parametros where clave = 'tc_usd_pen'`))[0]?.valor ?? 3.75);

// Los reportes cuya lista de ventas tiene MÁS de lo que hoy sigue vivo.
const afectados = await q(`
  select r.id, r.fecha, r.comercial_id, p.codigo_comercial, p.nombre,
         r.contenido->'ventas' ventas_guardadas,
         r.contenido->'resumen' resumen
    from reportes_diarios r join perfiles p on p.id = r.comercial_id
   where jsonb_array_length(coalesce(r.contenido->'ventas', '[]'::jsonb)) >
         (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id
           where o.comercial_id = r.comercial_id and v.fecha_venta = r.fecha and v.anulada_at is null)
   order by r.fecha`);

if (afectados.length === 0) {
  console.log("No hay ningún reporte guardado con ventas anuladas adentro.");
  await bd.end();
  process.exit(0);
}

console.log(`${afectados.length} reporte(s) por corregir.\n`);

await bd.query("begin");
try {
  for (const r of afectados) {
    const fecha = r.fecha.toISOString().slice(0, 10);

    // Las ventas que HOY siguen vivas ese día, con la misma forma que arma
    // reporte_diario_comercial.
    const vivas = await q(`
      select cu.razon_social cliente, v.monto_total monto, v.moneda::text moneda
        from ventas v
        join oportunidades o on o.id = v.oportunidad_id
        join cuentas cu on cu.id = o.cuenta_id
       where o.comercial_id = $1 and v.fecha_venta = $2 and v.anulada_at is null
       order by v.monto_total desc`, [r.comercial_id, fecha]);

    // Y las que se le quitan, para poder decirlo por escrito.
    const quitadas = await q(`
      select cu.razon_social cliente, v.monto_total monto, v.moneda::text moneda,
             i.codigo cierre
        from ventas v
        join oportunidades o on o.id = v.oportunidad_id
        join cuentas cu on cu.id = o.cuenta_id
        left join informes_cierre i on i.venta_id = v.id
       where o.comercial_id = $1 and v.fecha_venta = $2 and v.anulada_at is not null`,
      [r.comercial_id, fecha]);

    const nuevasVentas = vivas.map((v) => ({
      cliente: v.cliente,
      monto: Number(v.monto),
      moneda: v.moneda,
      monto_usd: v.moneda === "USD" ? Number(v.monto) : Number(v.monto) / tc,
    }));
    const montoUsd = nuevasVentas.reduce((a, v) => a + v.monto_usd, 0);
    const nota = quitadas
      .map((x) => `Se quitó la venta de ${x.cliente} (${Number(x.monto).toLocaleString("es-PE")} ${x.moneda})` +
        (x.cierre ? `: el cierre ${x.cierre} fue anulado.` : ": la venta fue anulada."))
      .join(" ");

    console.log(`${fecha} · ${r.codigo_comercial} ${r.nombre}`);
    console.log(`   antes:   ${r.resumen.ventas} venta(s) · ${r.resumen.monto_vendido_usd} USD`);
    console.log(`   después: ${nuevasVentas.length} venta(s) · ${montoUsd} USD`);
    console.log(`   motivo:  ${nota}`);

    await bd.query(`
      update reportes_diarios
         set contenido = jsonb_set(
               jsonb_set(
                 jsonb_set(contenido, '{ventas}', $2::jsonb),
                 '{resumen,ventas}', to_jsonb($3::int)),
               '{resumen,monto_vendido_usd}', to_jsonb($4::numeric))
             || jsonb_build_object('ajuste_0174', $5::text)
       where id = $1`,
      [r.id, JSON.stringify(nuevasVentas), nuevasVentas.length, montoUsd, nota]);
  }

  await bd.query("commit");
  console.log("\nAplicado.");
} catch (e) {
  await bd.query("rollback");
  console.error("Revertido por error:", e.message);
  process.exit(1);
}

console.log("\n== COMPROBACIÓN ==");
console.table(await q(`
  select r.fecha, p.codigo_comercial com,
         jsonb_array_length(r.contenido->'ventas') ventas,
         r.contenido->'resumen'->>'monto_vendido_usd' monto,
         r.contenido->>'ajuste_0174' ajuste
    from reportes_diarios r join perfiles p on p.id = r.comercial_id
   where r.contenido ? 'ajuste_0174' order by r.fecha`));
await bd.end();
