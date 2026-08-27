// ============================================================
// CRM EFAMEINSA · La venta del 05-08 es de Lavanderías del Interior, y por 283.64
// ============================================================
// Katerine (C5) mostró la fila de su Excel: presupuesto 380-26, 05/08/2026,
// «se hace venta», C4_VENTA, **US$ 283.64**. En el CRM esa misma venta está
// —se reconoce por `referencia_historica = '380-26'` y por su gestión «se hace
// venta» del mismo día— pero con dos cosas mal:
//
//   1. El monto quedó en US$ 155.73 en vez de US$ 283.64.
//   2. Está colgada de MONCAL S.A.C., cuando el presupuesto 380-26 de la serie
//      OPEN se emitió a nombre de LAVANDERÍAS DEL INTERIOR S.A.C. Katerine:
//      «su última compra fue con Lavanderías del Interior».
//
// Las dos fichas siguen existiendo con su propio RUC —son el grupo económico
// que se armó hoy, porque el cliente elige con cuál facturar—; lo único que se
// mueve es esta venta a la ficha que corresponde.
//
// Y se le da vuelta al nombre de esa ficha para que lidere la razón social con
// la que compran hoy, igual que se hizo con Zercom: el nombre actual adelante,
// el histórico detrás.
//
// Uso:
//   node --env-file=.env.local scripts/corregir-venta-lavanderias-del-interior.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const MONTO_CORRECTO = 283.64;
const NOMBRE_NUEVO = "LAVANDERIAS DEL INTERIOR S.A.C. - MONCAL S.A.C";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: [venta] } = await bd.query(`
  select v.id, v.monto_total, v.fecha_venta, v.referencia_historica,
         o.id op_id, cu.id cuenta_id, cu.razon_social
    from ventas v join oportunidades o on o.id = v.oportunidad_id join cuentas cu on cu.id = o.cuenta_id
   where v.referencia_historica = '380-26' and v.fecha_venta = '2026-08-05'`);
if (!venta) { console.error("No se encontró la venta 380-26 del 05-08-2026."); await bd.end(); process.exit(1); }

const { rows: [destino] } = await bd.query(`
  select id, razon_social, num_doc from cuentas where num_doc = '20612325201'`);
if (!destino) { console.error("No se encontró la ficha de Lavanderías del Interior."); await bd.end(); process.exit(1); }

console.log("LA VENTA");
console.log(`  presupuesto ${venta.referencia_historica} · ${venta.fecha_venta.toISOString().slice(0, 10)}`);
console.log(`  monto   : US$ ${venta.monto_total}  →  US$ ${MONTO_CORRECTO.toFixed(2)}`);
console.log(`  cliente : ${venta.razon_social}  →  ${destino.razon_social} (RUC ${destino.num_doc})`);
console.log(`\nLA FICHA se renombra a:\n  ${NOMBRE_NUEVO}`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end(); process.exit(0);
}

await bd.query(`update oportunidades set cuenta_id = $1 where id = $2`, [destino.id, venta.op_id]);
await bd.query(`update ventas set monto_total = $1 where id = $2`, [MONTO_CORRECTO, venta.id]);
await bd.query(`update cuentas set razon_social = $2 where id = $1`, [destino.id, NOMBRE_NUEVO]);

// `ultima_venta_at` la mantiene un trigger sobre `ventas`, que no se entera de
// que la oportunidad cambió de cuenta. Se recalcula a mano en las dos fichas.
for (const id of [venta.cuenta_id, destino.id]) {
  await bd.query(`
    update cuentas set ultima_venta_at = (
      select max(v.fecha_venta)::timestamptz from ventas v
       join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = $1
    ) where id = $1`, [id]);
}

const { rows: grupo } = await bd.query(`
  select cu.razon_social, cu.num_doc, cu.ultima_venta_at::date ultima_venta,
         case when cu.cuenta_padre_id is null then 'madre' else 'del grupo' end rol,
         (select count(*) from ventas v join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=cu.id)::int ventas,
         (select coalesce(sum(v.monto_total),0) from ventas v join oportunidades o on o.id=v.oportunidad_id
           where o.cuenta_id=cu.id)::numeric comprado_usd
    from cuentas cu
   where cu.id = $1 or cu.cuenta_padre_id = $1 or cu.id = $2
   order by rol`, [venta.cuenta_id, destino.id]);
console.log("\nCómo quedó el grupo:");
console.table(grupo);
console.log(`Ficha: /comercial/cartera/${destino.id}`);
await bd.end();
