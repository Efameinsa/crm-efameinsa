// ============================================================
// CRM EFAMEINSA · MONCAL y LAVANDERÍAS DEL INTERIOR: mismo dueño, dos RUC
// ============================================================
// Katerine (C5), 27-08: «Moncal tiene otro RUC, su última compra fue con
// Lavanderías del Interior… trabajan con dos RUC. Hay días en los que me dicen
// cotízame con Moncal, cotízame con Lavanderías. No, mándame la factura con
// Moncal. A veces depende mucho de ellos. Pero son la misma empresa».
//
// POR ESO NO SE FUSIONAN. Es la diferencia exacta con el caso de Zercom, donde
// ella dijo «lo demás queda como histórico»: ahí las razones sociales viejas ya
// no se usan y una sola ficha es lo correcto. Acá los dos RUC están vivos y una
// factura se emite a UNO. Fusionarlas destruiría el RUC con el que a veces pide
// que le facturen, y la próxima cotización saldría a nombre equivocado.
//
// Para esto existe el grupo económico de la migración 0052 —la misma solución
// que ya se usó para «CONGELADOS Y FRESCOS - MARINASOL»—: las dos fichas
// siguen enteras, cada una con su RUC, y el comercial ve el peso real del
// cliente en vez de negociar a ciegas con la mitad.
//
// La madre es MONCAL S.A.C.: es la que tiene la historia larga (8
// oportunidades y 5 ventas contra 1 oportunidad).
//
// Uso:
//   node --env-file=.env.local scripts/agrupar-moncal-lavanderias.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: fichas } = await bd.query(`
  select cu.id, cu.razon_social, cu.num_doc, cu.cuenta_padre_id, p.codigo_comercial duenio,
         (select count(*) from oportunidades o where o.cuenta_id=cu.id)::int ops,
         (select count(*) from ventas v join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=cu.id)::int ventas
    from cuentas cu left join perfiles p on p.id=cu.comercial_id
   where cu.razon_social ~* 'MONCAL'
   order by (select count(*) from oportunidades o where o.cuenta_id=cu.id) desc`);

if (fichas.length < 2) {
  console.log("No hay dos fichas que agrupar."); await bd.end(); process.exit(0);
}
const madre = fichas[0];
const hijas = fichas.slice(1);

console.log("MADRE DEL GRUPO:");
console.log(`  ${madre.razon_social} · RUC ${madre.num_doc} · ${madre.ops} oportunidades, ${madre.ventas} ventas`);
console.log("\nSE CUELGAN DE ELLA (siguen enteras, con su propio RUC):");
for (const h of hijas) console.log(`  ${h.razon_social} · RUC ${h.num_doc} · ${h.ops} oportunidades, ${h.ventas} ventas`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end(); process.exit(0);
}

for (const h of hijas) {
  await bd.query(`update cuentas set cuenta_padre_id = $1 where id = $2`, [madre.id, h.id]);
  console.log(`✓ ${h.razon_social} queda dentro del grupo`);
}

const { rows: grupo } = await bd.query(`
  select cu.razon_social, cu.num_doc,
         case when cu.id = $1 then 'madre' else 'del grupo' end rol,
         (select count(*) from ventas v join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=cu.id)::int ventas,
         (select coalesce(sum(v.monto_total),0) from ventas v join oportunidades o on o.id=v.oportunidad_id
           where o.cuenta_id=cu.id)::numeric comprado_usd
    from cuentas cu where cu.id = $1 or cu.cuenta_padre_id = $1`, [madre.id]);
console.log("\nEl grupo, como lo va a ver Katerine:");
console.table(grupo);
console.log(`Ficha de la madre: /comercial/cartera/${madre.id}`);
await bd.end();
