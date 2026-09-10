// ============================================================
// Las fichas que solo son mantenimiento pasan a PV1 (Santos, 10-09)
// ============================================================
// Ariana, mirando su cuenta de COMERCIAL: «hemos visto a QUISPE GIL THOMY
// VICENTE y él es seguimiento para que compre mantenimiento; se supone que eso
// debe estar en su cuenta de postventa1 y no en su cuenta de comercial».
// Y lo mismo con TRINIDAD ROBLES ANDERSON DANY y VILCARANO CURASMA MAURO.
//
// POR QUÉ SEGUÍAN AHÍ. Ayer se movieron los EXPEDIENTES de mantenimiento de C4
// a PV1, pero no las FICHAS: la regla de la 0080 dice que el cliente se queda
// con quien lo vendió. Acá esa regla no aplica —el «otro» es ella misma con la
// otra cuenta—, y el efecto era que en su vista de comercial le seguían
// apareciendo clientes cuyo único asunto abierto es un preventivo.
//
// QUIÉNES SE MUEVEN. No los tres a mano: los que cumplen la regla. Una ficha de
// C4 pasa a PV1 cuando NINGUNO de sus expedientes es comercial y AL MENOS UNO
// es de PV1. Son 22 y los tres que nombró están adentro.
//
// LO QUE NO SE TOCA:
// · Las 12 fichas de C4 cuyo mantenimiento es de RUBÍ (PV). Ahí el «otro» sí es
//   otra persona, y moverlas es una decisión de gerencia, no un ordenamiento.
// · Las 103 fichas mezcladas —le compran equipos Y mantenimiento—: esas son de
//   la comercial, y su preventivo ya vive en PV1 desde ayer.
// · Los expedientes. Cada uno se queda con quien lo está trabajando, incluido
//   el de Rubí en TRINIDAD ROBLES. `reasignar_cartera` no sirve acá justamente
//   por eso: arrastra todas las oportunidades de la cuenta.
//
//   node --env-file=.env.local scripts/_fichas-de-mantenimiento-a-pv1.mjs
//   node --env-file=.env.local scripts/_fichas-de-mantenimiento-a-pv1.mjs --aplicar
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const MOTIVO =
  "Ordenamiento del 10-09: la ficha solo tiene expedientes de mantenimiento y el preventivo lo lleva Ariana " +
  "desde su cuenta de postventa (PV1). Se mueve la ficha para que no le siga apareciendo en su vista de " +
  "comercial. Los expedientes no se tocaron: cada uno sigue con quien lo trabaja.";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: [c4] } = await bd.query(`select id, nombre from perfiles where codigo_comercial = 'C4'`);
const { rows: [pv1] } = await bd.query(`select id, nombre from perfiles where codigo_comercial = 'PV1'`);
const { rows: [gerencia] } = await bd.query(
  `select id from perfiles where rol = 'gerencia' and activo order by nombre limit 1`);

const REGLA = `
  with f as (
    select cu.id, cu.razon_social,
      count(*) filter (where o.tipo_postventa is null)                  comercial,
      count(*) filter (where p.codigo_comercial = 'PV1')                de_pv1,
      count(*) filter (where p.codigo_comercial not in ('PV','PV1'))    de_otro
    from cuentas cu
    join oportunidades o on o.cuenta_id = cu.id
    join perfiles p on p.id = o.comercial_id
   where cu.comercial_id = $1
   group by 1, 2)
  select id, razon_social from f
   where comercial = 0 and de_pv1 > 0 and de_otro = 0
   order by razon_social`;

const { rows: mover } = await bd.query(REGLA, [c4.id]);
console.log(`De ${c4.nombre} (C4) a ${pv1.nombre} (PV1): ${mover.length} fichas.\n`);
console.table(mover.map((c) => ({ cliente: c.razon_social.slice(0, 46) })));

// Lo que queda afuera, dicho a propósito: es lo que hay que preguntar.
const { rows: deRubi } = await bd.query(`
  with f as (
    select cu.id, cu.razon_social,
      count(*) filter (where o.tipo_postventa is null)   comercial,
      count(*) filter (where p.codigo_comercial = 'PV1') de_pv1,
      count(*) filter (where p.codigo_comercial = 'PV')  de_pv
    from cuentas cu
    join oportunidades o on o.cuenta_id = cu.id
    join perfiles p on p.id = o.comercial_id
   where cu.comercial_id = $1 group by 1, 2)
  select razon_social from f where comercial = 0 and de_pv1 = 0 and de_pv > 0 order by 1`, [c4.id]);
console.log(`\nSe quedan en C4 porque su mantenimiento es de Rubí (PV), no de Ariana: ${deRubi.length}`);
for (const c of deRubi) console.log(`  · ${c.razon_social}`);

if (!APLICAR) {
  console.log("\n(ensayo: no se tocó nada — para hacerlo, --aplicar)");
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  const ids = mover.map((c) => c.id);
  const { rowCount } = await bd.query(
    `update cuentas set comercial_id = $2::uuid, cartera_desde = current_date, updated_at = now()
      where id = any($1::uuid[])`, [ids, pv1.id]);
  await bd.query(
    `insert into asignaciones (cuenta_id, de_comercial, a_comercial, motivo, decidida_por, notas)
     select unnest($1::uuid[]), $2::uuid, $3::uuid, 'decision_gerencia'::motivo_asignacion, $4::uuid, $5`,
    [ids, c4.id, pv1.id, gerencia?.id ?? null, MOTIVO]);
  await bd.query("commit");
  console.log(`\n✓ ${rowCount} fichas movidas a PV1. Ningún expediente cambió de dueño.`);
} catch (e) {
  await bd.query("rollback");
  console.error("✗ no se movió nada:", e.message);
  await bd.end();
  process.exit(1);
}

const { rows: [quedan] } = await bd.query(
  `select count(*) n from cuentas where comercial_id = $1`, [c4.id]);
const { rows: [tiene] } = await bd.query(
  `select count(*) n from cuentas where comercial_id = $1`, [pv1.id]);
console.log(`C4 queda con ${quedan.n} fichas · PV1 con ${tiene.n}.`);
await bd.end();
