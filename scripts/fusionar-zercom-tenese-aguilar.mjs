// ============================================================
// CRM EFAMEINSA · Las cuatro fichas de ZERCOM PERU son un solo cliente
// ============================================================
// Katerine (C5), 27-08: «tenemos tres… es la misma persona, tendría que estar
// unido en uno solo… con el que ha comprado recientemente es Zercom Perú. Todo
// sea Zercom Perú y lo demás como histórico».
//
// Y son CUATRO, no tres: además de las tres que ella nombró existe la ficha de
// «ZERCOM PERU SAC» con su RUC propio, que es justamente el nombre nuevo.
//
//   · ZERCOM PERU SAC                          RUC 20600381840   ← queda
//   · AGUILAR PACARA JESUS GREGORIO            RUC 10407757519   (venta de
//     US$ 26.999 del 11-12-2025)
//   · TENESE INGENIERIA S.A.C.- AGUILAR PACARA RUC 20613734849   (19 gestiones)
//   · TENESE INGENIERIA S.A.C.- AGUILAR PACARA sin documento
//
// POR QUÉ ACÁ SÍ SE FUSIONA Y EN MONCAL NO. Katerine fue precisa en la
// diferencia: de este cliente dijo «lo demás queda como histórico» —ya no
// factura con esas razones sociales—; de Moncal dijo «trabajan con dos RUC, a
// veces me dicen mándame la factura con Moncal, a veces con Lavanderías». Un
// nombre que ya no se usa se fusiona; dos RUC vivos son un grupo económico
// (migración 0052), porque una factura se emite a UNO.
//
// LOS RUC QUE SE VAN NO SE PIERDEN: la fusión conserva un solo `num_doc`, así
// que los otros dos quedan escritos en las notas de la ficha. Son los que
// aparecen en las facturas viejas y alguien los va a buscar.
//
// LA CARTERA VUELVE A C5. La ficha de ZERCOM había quedado en la cuenta de
// postventa porque el Excel de Hever la trajo hoy y el importador pone los
// clientes nuevos en la cartera de quien los trabajó. Pero el cliente es de
// Katerine: suya es la venta y suyos son los diez presupuestos.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-zercom-tenese-aguilar.mjs
//   node --env-file=.env.local scripts/fusionar-zercom-tenese-aguilar.mjs --aplicar

import { Client } from "pg";
import { fusionar, historia } from "./lib-fusionar-cuentas.mjs";

const APLICAR = process.argv.includes("--aplicar");
const NOMBRE_FINAL = "ZERCOM PERU SAC.- AGUILAR PACARA JESUS GREGORIO -TENESE INGENIERIA S.A.C";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: fichas } = await bd.query(`
  select cu.id, cu.razon_social, cu.num_doc, cu.notas, p.codigo_comercial duenio
    from cuentas cu left join perfiles p on p.id = cu.comercial_id
   where cu.razon_social ilike '%ZERCOM%'
      or cu.razon_social ilike '%TENESE%'
      or upper(btrim(cu.razon_social)) = 'AGUILAR PACARA JESUS GREGORIO'
   order by cu.razon_social`);

const destino = fichas.find((f) => /ZERCOM/i.test(f.razon_social));
if (!destino) { console.error("No se encontró la ficha de ZERCOM PERU SAC."); await bd.end(); process.exit(1); }
const origenes = fichas.filter((f) => f.id !== destino.id);

const { rows: [c5] } = await bd.query(`select id, nombre from perfiles where codigo_comercial = 'C5' and activo`);

console.log("QUEDA UNA SOLA FICHA, llamada:");
console.log(`  ${NOMBRE_FINAL}`);
console.log(`  RUC ${destino.num_doc} · cartera de ${c5.nombre} (C5)\n`);
console.log("Se funden adentro:");
for (const f of fichas) {
  const h = await historia(bd, f.id);
  console.log(`  ${f.id === destino.id ? "→ (base)" : "   "} ${f.razon_social}`);
  console.log(`        RUC ${f.num_doc ?? "(sin documento)"} · de ${f.duenio} · ${JSON.stringify(h)}`);
}

// Los RUC que la fusión descarta quedan escritos, no se pierden.
const docsHistoricos = origenes.map((f) => f.num_doc).filter(Boolean);
const nota = `RUC anteriores del mismo cliente: ${docsHistoricos.join(" · ")}. Razones sociales históricas: ${origenes.map((f) => f.razon_social).join(" | ")}. Unificado el 27-08-2026 a pedido de Katerine (C5).`;
console.log(`\nSe anotará en la ficha:\n  ${nota}`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end();
  process.exit(0);
}

for (const o of origenes) {
  await fusionar(bd, destino.id, o.id, { carteraId: c5.id, nombreOficial: NOMBRE_FINAL });
  console.log(`✓ fusionada «${o.razon_social}»`);
}
await bd.query(
  `update cuentas set notas = case when notas is null or notas = '' then $2 else notas || E'\n\n' || $2 end
    where id = $1`, [destino.id, nota]);

const { rows: [final] } = await bd.query(`
  select cu.razon_social, cu.num_doc, p.codigo_comercial duenio,
         (select count(*) from oportunidades o where o.cuenta_id=cu.id)::int oportunidades,
         (select count(*) from ventas v join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=cu.id)::int ventas,
         (select count(*) from actividades a join oportunidades o on o.id=a.oportunidad_id where o.cuenta_id=cu.id)::int gestiones,
         (select count(*) from contactos ct where ct.cuenta_id=cu.id)::int contactos,
         (select count(*) from cotizaciones_historicas ch where ch.cuenta_id=cu.id)::int presupuestos
    from cuentas cu left join perfiles p on p.id=cu.comercial_id where cu.id=$1`, [destino.id]);
console.log("\nCómo quedó:");
console.table([final]);
console.log(`Ficha: /comercial/cartera/${destino.id}`);
await bd.end();
