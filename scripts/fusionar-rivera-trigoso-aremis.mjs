// ============================================================
// CRM EFAMEINSA · «RIVERA TRIGOSO JORGE RICARDO» estaba tres veces
// ============================================================
// Santos, 10-09, mirando la cartera de Ariana: «he buscado a esa persona y
// salen como tres diferentes y está asignado su ruc en uno de ellos pero son
// la misma persona, deberías de juntarlo».
//
// Las tres son el mismo señor con su lavandería, escritas de tres maneras:
//
//   · RIVERA TRIGOSO JORGE RICARDO - LAVANDERIA AREMIS   RUC 10452869107
//   · RIVERA TRIGOSO JORGE RICARDO-LAVANDERIA AREMIS     (sin RUC, sin espacios)
//   · RIVERA TRIGOSO JORGE RICARDO                       (sin RUC, sin la lavandería)
//
// El RUC empieza en 10: es el de una persona natural con negocio, construido
// sobre su DNI. Por eso el nombre de la ficha es un nombre de persona y no una
// razón social — y por eso el mismo señor entra unas veces con su nombre y
// otras con el de su lavandería.
//
// QUEDA LA QUE TIENE EL RUC. Es la regla de la casa (el RUC manda sobre el
// nombre) y es la única que se puede volver a cruzar contra SUNAT y contra el
// próximo Excel. Las otras dos le mudan encima su historia y desaparecen.
//
// LA CARTERA NO SE MUEVE: las tres ya son de Ariana (C4), así que esto no le
// quita ni le da un cliente a nadie. La librería igual aplica su regla —la
// cartera se queda con quien tuvo la actividad más reciente— y acá da lo mismo.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-rivera-trigoso-aremis.mjs
//   node --env-file=.env.local scripts/fusionar-rivera-trigoso-aremis.mjs --aplicar

import { Client } from "pg";
import { fusionar, historia, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const APLICAR = process.argv.includes("--aplicar");
const RUC = "10452869107";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// Se buscan por el nombre de la PERSONA, normalizado sin espacios ni signos:
// lo que separa a las tres fichas es justamente un guion pegado y la coletilla
// de la lavandería. No se toca ninguna otra cuenta que diga «AREMIS» sin ser
// de él.
const { rows: candidatas } = await bd.query(`
  select cu.id, cu.razon_social, cu.num_doc, cu.comercial_id, cu.cartera_desde,
         p.nombre duenio, p.codigo_comercial codigo
    from cuentas cu left join perfiles p on p.id = cu.comercial_id
   where regexp_replace(upper(cu.razon_social), '[^A-Z0-9]', '', 'g')
         like 'RIVERATRIGOSOJORGERICARDO%'
   order by (cu.num_doc is null), cu.cartera_desde`);

console.log(`Fichas encontradas: ${candidatas.length}`);
if (candidatas.length < 2) {
  console.log("No hay nada que fusionar.");
  await bd.end();
  process.exit(0);
}

const destino = candidatas.find((c) => c.num_doc === RUC);
if (!destino) {
  console.log(`ABORTA: ninguna de las fichas tiene el RUC ${RUC}. Revisar a mano antes de fusionar.`);
  await bd.end();
  process.exit(1);
}
const origenes = candidatas.filter((c) => c.id !== destino.id);

// Si alguna trajera OTRO documento, no son la misma persona: se para.
const conOtroDoc = origenes.filter((c) => c.num_doc && c.num_doc !== RUC);
if (conOtroDoc.length > 0) {
  console.log("ABORTA: hay fichas con OTRO documento, no se pueden dar por la misma persona:");
  console.table(conOtroDoc.map((c) => ({ razon_social: c.razon_social, num_doc: c.num_doc })));
  await bd.end();
  process.exit(1);
}

console.log("\nQUEDA:");
console.log(`  ${destino.razon_social}`);
console.log(`  RUC ${destino.num_doc} · ${destino.duenio} (${destino.codigo}) · ${JSON.stringify(await historia(bd, destino.id))}`);
for (const o of origenes) {
  console.log("\nSE FUSIONA Y DESAPARECE:");
  console.log(`  ${o.razon_social}`);
  console.log(`  ${o.num_doc ?? "(sin RUC)"} · ${o.duenio} (${o.codigo}) · ${JSON.stringify(await historia(bd, o.id))}`);
}

// Una consulta por vez: `pg` no admite dos a la vez sobre el mismo cliente y
// con Promise.all avisa que lo va a dejar de tolerar en la versión 9.
const fechas = [];
for (const c of candidatas) fechas.push({ c, f: await ultimaActividad(bd, c.id) });
const carteraId = fechas.sort((a, b) => new Date(b.f) - new Date(a.f))[0].c.comercial_id;
const { rows: [duenioFinal] } = await bd.query("select nombre, codigo_comercial from perfiles where id = $1", [carteraId]);
console.log(`\nLa cartera queda en: ${duenioFinal?.nombre ?? "sin dueño"} (${duenioFinal?.codigo_comercial ?? "—"}) — por actividad más reciente`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end();
  process.exit(0);
}

// EN UNA SOLA TRANSACCIÓN. `fusionar` son once updates y un delete por ficha:
// si el último fallara a mitad, el cliente quedaría con la historia mudada y
// la ficha vieja todavía en pie — lo peor de los dos mundos.
await bd.query("begin");
try {
  for (const o of origenes) {
    await fusionar(bd, destino.id, o.id, { carteraId });
    console.log(`✓ Fusionada «${o.razon_social}»`);
  }
  await bd.query("commit");
} catch (e) {
  await bd.query("rollback");
  console.log(`\nSE REVIRTIÓ TODO — ${e.message}`);
  await bd.end();
  process.exit(1);
}

const { rows: [final] } = await bd.query(`
  select cu.razon_social, cu.num_doc, cu.departamento, p.nombre duenio,
         (select count(*) from oportunidades o where o.cuenta_id=cu.id)::int expedientes,
         (select count(*) from contactos ct where ct.cuenta_id=cu.id)::int contactos,
         (select count(*) from cotizaciones_historicas ch where ch.cuenta_id=cu.id)::int cotiz_archivo,
         (select count(*) from actividades a join oportunidades o2 on o2.id=a.oportunidad_id
           where o2.cuenta_id=cu.id)::int gestiones
    from cuentas cu left join perfiles p on p.id = cu.comercial_id where cu.id = $1`, [destino.id]);
console.log("\nCómo quedó la ficha única:");
console.table([final]);

const { rows: [quedan] } = await bd.query(`
  select count(*)::int n from cuentas
   where regexp_replace(upper(razon_social), '[^A-Z0-9]', '', 'g') like 'RIVERATRIGOSOJORGERICARDO%'`);
console.log(`Fichas con ese nombre ahora: ${quedan.n} (debe ser 1)`);
console.log(`Ficha: /comercial/cartera/${destino.id}`);

await bd.end();
