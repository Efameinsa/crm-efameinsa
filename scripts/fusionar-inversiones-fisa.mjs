// ============================================================
// CRM EFAMEINSA · «INVERSIONES FISA S.A.» estaba dos veces en la cartera de C4
// ============================================================
// Darwin, 27-08: «Ariana tiene duplicado inversiones fisa s.a., júntalo».
//
// Las dos son de C4 y se llaman igual; la diferencia es que una tiene el RUC
// cargado y la otra no. Queda la que tiene RUC —es la que se puede volver a
// cruzar contra SUNAT y contra el próximo Excel— y se le muda encima todo lo
// de la otra.
//
// NO SE TOCA «PORFISA CONTRATISTAS GENERALES S.A.C.», que aparece si uno busca
// «FISA» pero es otra empresa con otro RUC.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-inversiones-fisa.mjs
//   node --env-file=.env.local scripts/fusionar-inversiones-fisa.mjs --aplicar

import { Client } from "pg";
import { fusionar, historia, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: candidatas } = await bd.query(`
  select cu.id, cu.razon_social, cu.num_doc, cu.comercial_id, cu.cartera_desde,
         p.codigo_comercial duenio
    from cuentas cu left join perfiles p on p.id = cu.comercial_id
   where upper(btrim(cu.razon_social)) = 'INVERSIONES FISA S.A.'
   order by (cu.num_doc is null), cu.cartera_desde`);

if (candidatas.length < 2) {
  console.log(`Hay ${candidatas.length} cuenta(s) con ese nombre: no hay nada que fusionar.`);
  await bd.end();
  process.exit(0);
}

// La que tiene documento se queda: es la que permite volver a cruzarla.
const destino = candidatas.find((c) => c.num_doc) ?? candidatas[0];
const origenes = candidatas.filter((c) => c.id !== destino.id);

console.log("QUEDA:");
console.log(`  ${destino.razon_social} · RUC ${destino.num_doc ?? "(sin RUC)"} · ${destino.duenio}`);
console.log(`  ${JSON.stringify(await historia(bd, destino.id))}`);
for (const o of origenes) {
  console.log("\nSE FUSIONA Y DESAPARECE:");
  console.log(`  ${o.razon_social} · RUC ${o.num_doc ?? "(sin RUC)"} · ${o.duenio}`);
  console.log(`  ${JSON.stringify(await historia(bd, o.id))}`);
}

// La cartera se queda con quien tuvo la actividad más reciente, que es la regla
// de la librería. Acá las dos son de C4, así que no cambia de manos.
const fechas = await Promise.all(candidatas.map(async (c) => ({ c, f: await ultimaActividad(bd, c.id) })));
const carteraId = fechas.sort((a, b) => new Date(b.f) - new Date(a.f))[0].c.comercial_id;
const { rows: [duenioFinal] } = await bd.query(`select codigo_comercial from perfiles where id = $1`, [carteraId]);
console.log(`\nLa cartera queda en: ${duenioFinal?.codigo_comercial ?? "sin dueño"} (por actividad más reciente)`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end();
  process.exit(0);
}

for (const o of origenes) {
  await fusionar(bd, destino.id, o.id, { carteraId });
  console.log(`\n✓ Fusionada ${o.id} dentro de ${destino.id}`);
}

const { rows: [final] } = await bd.query(`
  select cu.razon_social, cu.num_doc, cu.departamento, cu.distrito, p.codigo_comercial duenio,
         (select count(*) from oportunidades o where o.cuenta_id=cu.id)::int oportunidades,
         (select count(*) from contactos ct where ct.cuenta_id=cu.id)::int contactos,
         (select count(*) from actividades a join oportunidades o2 on o2.id=a.oportunidad_id
           where o2.cuenta_id=cu.id)::int gestiones
    from cuentas cu left join perfiles p on p.id = cu.comercial_id where cu.id = $1`, [destino.id]);
console.log("\nCómo quedó la ficha única:");
console.table([final]);

const { rows: [quedan] } = await bd.query(
  `select count(*)::int n from cuentas where upper(btrim(razon_social)) = 'INVERSIONES FISA S.A.'`);
console.log(`Cuentas con ese nombre ahora: ${quedan.n} (debe ser 1)`);
console.log(`Ficha: /comercial/cartera/${destino.id}`);

await bd.end();
