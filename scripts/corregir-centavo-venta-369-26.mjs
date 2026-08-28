// El céntimo que le rompía el cuadre a Katerine.
//
// Su consolidado de agosto suma US$ 97.824,02 y el CRM daba 97.824,01. Toda la
// diferencia está en una fila: la venta 369-26 del 03-08 (lavadora semi
// industrial LG TITAN MAX 17 kg, hotel Remanso) entró como US$ 3.771,18 y en su
// Excel dice 3.771,19. Es el mismo equipo y el mismo precio que la de GRUPO
// AGUI-TEL del 05-08, que sí quedó en 3.771,19: el céntimo se perdió al
// importar. Se corrige por el Excel, que es donde ella lleva la venta.
//
// Uso: node --env-file=.env.local scripts/corregir-centavo-venta-369-26.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const VENTA = "6689a7d7-5af8-4061-bb9d-4f4d611995fc";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: [v] } = await bd.query(
  `select v.id, v.monto_total, v.fecha_venta::date f, v.referencia_historica ref, cu.razon_social
     from ventas v join oportunidades o on o.id = v.oportunidad_id join cuentas cu on cu.id = o.cuenta_id
    where v.id = $1`, [VENTA]);
if (!v || v.ref !== "369-26" || v.monto_total !== "3771.18") {
  console.log("La venta no está como se esperaba — no se toca:"); console.table([v]);
  await bd.end(); process.exit(0);
}
console.log(`${v.razon_social} · ${String(v.f).slice(0,10)} · ${v.ref} · US$ ${v.monto_total} → 3771.19`);

if (!APLICAR) { console.log("\nSIMULACIÓN — para aplicarlo: --aplicar\n"); await bd.end(); process.exit(0); }

await bd.query(`update ventas set monto_total = 3771.19 where id = $1`, [VENTA]);

const { rows: [mes] } = await bd.query(
  `select count(*)::int n, coalesce(sum(v.monto_total),0)::numeric usd
     from ventas v join oportunidades o on o.id = v.oportunidad_id join perfiles p on p.id = o.comercial_id
    where p.codigo_comercial = 'C5' and v.moneda = 'USD'
      and v.fecha_venta between '2026-08-01' and '2026-08-31'`);
console.log(`Agosto de C5: ${mes.n} ventas · US$ ${mes.usd}`);
await bd.end();
