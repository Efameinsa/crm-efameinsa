// ============================================================
// Las 23 cuentas que Ariana pidió sacar de sus pendientes (Santos, 10-09)
// ============================================================
// «A la señorita Ariana quiere que esto le salga como rechazado […] para que ya
// no le aparezca en su vista pendiente».
//
// Se hace exactamente lo que hace el botón de la ficha (`cambiarEtapa` en
// src/lib/acciones/oportunidades.ts): etapa `rechazada`, el motivo elegido y
// `cerrada_at` con la fecha —«no es que se cerró, es que no se vuelve»—. Nada
// más: la cuenta sigue en su cartera y las actividades quedan como están.
//
// Motivo elegido por Santos: 5 · «Solo consultaba / sin intención».
//
// Antes de tocar nada guarda el estado anterior en scripts/data/, para poder
// devolverlas una por una si alguna no correspondía.
import { Client } from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const MOTIVO = 5;
const CUENTAS = [
  "b712efab-1b21-4ecc-9093-68970e2dba96","b82c8204-c6e6-4f2b-aa12-f7690a94b9ca","887f7769-f3b1-4492-ab3f-0daaffa70e35",
  "065ca168-9483-4d8f-9e4d-da13a84ffd54","f5f5279d-1240-4c60-bc45-5c230a94e9ce","7944b5ae-aa8f-4fd4-8af6-b7961499ce9d",
  "6166ff47-3c18-41d7-8a20-5b143323b65a","5c9eed07-eec5-4183-ad97-a333f634cd2a","45bc1857-ca74-4bea-b3ad-2d0cf1f55110",
  "6219d886-9e00-446d-a394-769dbc67946e","cb07ce39-ed44-4ca2-9e9b-1ff4a2642649","80daa062-d0e7-4ea4-893a-3448fc5c0982",
  "5c5ee176-c17a-4018-a9a3-ccb9d2188873","8905fea3-f9e5-447d-814f-68a8ba99f709","8ea570cb-6e86-4ad3-b818-d788c1f3213c",
  "0434e3b1-e7fd-4e64-a1f5-3b250f6ecf3e","2c87e3e8-5e94-4af6-a6f3-5b8e95938349","8a1fa725-20de-4d10-a117-6ea795a9b0c9",
  "395736c8-da47-4867-8ccd-1d1ed9f415dc","f6d000ef-4dc4-4cf2-b597-5ffc10e9e801","476d70c0-0cd6-4f7b-8f19-8692ec998c19",
  "02e944be-8210-4dd5-a2ab-27dd7713ef44","5d3cbb27-bfd8-4ce7-80a0-f9f080b09792","f5e88ee4-2734-47cd-a5ce-54e26622a855",
  "a1e8f700-f93c-44ec-bc76-5040433b7238",
];
const ARIANA = "eaf777d9-280f-4d71-98c1-b98db80bf3d7";
// Las cuatro etapas que las vistas del comercial dan por cerradas.
const CERRADAS = ["venta", "rechazada", "derivada", "historico"];

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const pendientesDeAriana = async () =>
  (await c.query(
    `select count(*)::int as n from oportunidades where comercial_id=$1 and etapa <> all($2)`,
    [ARIANA, CERRADAS],
  )).rows[0].n;

const { rows: abiertas } = await c.query(
  `select o.id, o.etapa, o.motivo_rechazo_id, o.cerrada_at, cu.razon_social
     from oportunidades o join cuentas cu on cu.id = o.cuenta_id
    where o.cuenta_id = any($1) and o.etapa <> all($2)
    order by cu.razon_social`,
  [CUENTAS, CERRADAS],
);

console.log(`Ariana tiene ${await pendientesDeAriana()} oportunidades abiertas en total.`);
console.log(`De esos 23 clientes, ${abiertas.length} están abiertas:\n`);
for (const o of abiertas) console.log(`  ${o.etapa.padEnd(12)} ${o.razon_social}`);

if (!APLICAR) {
  console.log("\n(en seco — para aplicarlo: --aplicar)");
  await c.end();
  process.exit(0);
}

mkdirSync("scripts/data", { recursive: true });
const respaldo = `scripts/data/rechazo-ariana-10-09-antes.json`;
writeFileSync(respaldo, JSON.stringify(abiertas, null, 1));
console.log(`\nEstado anterior guardado en ${respaldo}`);

const { rowCount } = await c.query(
  `update oportunidades
      set etapa = 'rechazada', motivo_rechazo_id = $3, cerrada_at = now(), updated_at = now()
    where id = any($1) and etapa <> all($2)`,
  [abiertas.map((o) => o.id), CERRADAS, MOTIVO],
);
console.log(`\n✓ ${rowCount} oportunidades rechazadas con el motivo ${MOTIVO}.`);
console.log(`Ariana queda con ${await pendientesDeAriana()} abiertas.`);
await c.end();
