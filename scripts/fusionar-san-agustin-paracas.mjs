// ============================================================
// CRM EFAMEINSA · Las tres fichas de SAN AGUSTIN PARACAS S.A.C.
// ============================================================
// Katerine dijo que su venta no se había subido. Está subida: US$ 21.000 del
// 22-08-2026, serie OPEN, presupuesto Presu_438-26, con su gestión «se procede
// a firmar el contrato y realizar el cierre con lo acordado».
//
// LO QUE PASA ES QUE SU CLIENTE ESTÁ PARTIDO EN TRES, y la venta quedó en una
// ficha mientras el seguimiento de esta semana quedó en otra:
//
//   · SAN AGUSTIN PARACAS S.A.C.               RUC 20513242850  ← la venta
//   · SAN AGUSTIN PARACAS S.A.C.               sin documento    ← el cambio de
//     factura, el pago y el plano que pidió a Almacén (25, 26 y 27 de agosto)
//   · 20513242850 - SAN AGUSTIN PARACAS S.A.C. sin documento    ← una visita al
//     showroom de 2022, con el RUC pegado al nombre y el departamento errado
//
// Por eso al mirar su cliente no veía la venta: estaba mirando otra de las tres.
// No falta cargar nada — falta juntarlas. Crear la venta de nuevo habría
// duplicado US$ 21.000 en el reporte de gerencia.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-san-agustin-paracas.mjs [--aplicar]

import { Client } from "pg";
import { fusionar, historia } from "./lib-fusionar-cuentas.mjs";

const APLICAR = process.argv.includes("--aplicar");
const NOMBRE_FINAL = "SAN AGUSTIN PARACAS S.A.C.";
const RUC = "20513242850";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: fichas } = await bd.query(`
  select cu.id, cu.razon_social, cu.num_doc, cu.departamento, p.codigo_comercial duenio
    from cuentas cu left join perfiles p on p.id = cu.comercial_id
   where cu.razon_social ilike '%SAN AGUSTIN PARACAS%'
   order by (cu.num_doc is null)`);

const destino = fichas.find((f) => f.num_doc === RUC);
if (!destino) { console.error("No está la ficha con el RUC."); await bd.end(); process.exit(1); }
const origenes = fichas.filter((f) => f.id !== destino.id);

const { rows: [c5] } = await bd.query(`select id, nombre from perfiles where codigo_comercial='C5' and activo`);

console.log(`QUEDA: ${NOMBRE_FINAL} · RUC ${RUC} · ${c5.nombre} (C5)\n`);
for (const f of fichas) {
  const h = await historia(bd, f.id);
  const { rows: [v] } = await bd.query(`
    select coalesce(sum(v.monto_total),0)::numeric monto from ventas v
     join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=$1`, [f.id]);
  console.log(`  ${f.id === destino.id ? "→ base " : "  se une"} ${f.razon_social}`);
  console.log(`          doc ${f.num_doc ?? "(sin)"} · ${f.departamento ?? "?"} · ${JSON.stringify(h)} · vendido US$ ${v.monto}`);
}

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end(); process.exit(0);
}

for (const o of origenes) {
  await fusionar(bd, destino.id, o.id, { carteraId: c5.id, nombreOficial: NOMBRE_FINAL });
  console.log(`✓ fusionada «${o.razon_social}»`);
}

// La ficha con el RUC decía ICA; la de 2022 traía PASCO, que es un error de
// tipeo viejo. La fusión completa campos vacíos pero no pisa los llenos, así
// que ICA se mantiene. Se comprueba.
const { rows: [final] } = await bd.query(`
  select cu.razon_social, cu.num_doc, cu.departamento, p.codigo_comercial duenio,
         cu.ultima_venta_at::date ultima_venta,
         (select count(*) from oportunidades o where o.cuenta_id=cu.id)::int oportunidades,
         (select count(*) from ventas v join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=cu.id)::int ventas,
         (select coalesce(sum(v.monto_total),0) from ventas v join oportunidades o on o.id=v.oportunidad_id
           where o.cuenta_id=cu.id)::numeric vendido,
         (select count(*) from actividades a join oportunidades o on o.id=a.oportunidad_id where o.cuenta_id=cu.id)::int gestiones,
         (select count(*) from contactos ct where ct.cuenta_id=cu.id)::int contactos
    from cuentas cu left join perfiles p on p.id=cu.comercial_id where cu.id=$1`, [destino.id]);
console.log("\nCómo quedó:");
console.table([final]);

const { rows: [n] } = await bd.query(
  `select count(*)::int n from cuentas where razon_social ilike '%SAN AGUSTIN PARACAS%'`);
console.log(`Fichas con ese nombre: ${n.n} (debe ser 1)`);
console.log(`Ficha: /comercial/cartera/${destino.id}`);
await bd.end();
