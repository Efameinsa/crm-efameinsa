// ============================================================
// CRM EFAMEINSA · Devolver a su comercial los clientes que se llevó postventa
// ============================================================
// Reparación de lo que arregla la migración 0080. Entre el 24 y el 25 de
// agosto, cada contacto que Central derivó a Post Venta se llevó la CUENTA del
// cliente: `asignar_lead` le entregaba la cartera a quien recibía el lead, y
// postventa entró al CRM como un perfil comercial más (0075).
//
// A QUIÉN SE LE DEVUELVE, sin adivinar. `asignaciones` guarda de qué comercial
// salió cada cuenta al derivarla (`de_comercial`): esa es la fuente. Si el
// cliente no tenía dueño antes, vuelve a quedar SIN dueño — no se le regala a
// nadie; ya lo asignará gerencia el día que haya venta.
//
// QUÉ NO SE TOCA: los casos de postventa. La oportunidad que Central derivó al
// área se queda con el área, que es su trabajo. Lo que vuelve es el cliente.
//
// Uso: node --env-file=.env.local scripts/devolver-clientes-de-postventa.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: pv } = await bd.query(
  `select id, nombre, codigo_comercial from perfiles where es_postventa and rol = 'comercial'`,
);
if (pv.length === 0) {
  console.error("✗ No hay ningún perfil marcado como postventa.");
  process.exit(1);
}
const idsPv = pv.map((p) => p.id);

// Cuentas que hoy figuran en la cartera de postventa, con el comercial del que
// salieron según el registro de asignaciones.
const { rows: cuentas } = await bd.query(
  `select c.id, c.razon_social, c.cartera_desde::date,
          (select a.de_comercial
             from asignaciones a
            where a.cuenta_id = c.id and a.a_comercial = any($1::uuid[])
            order by a.created_at limit 1) as devolver_a,
          (select count(*) from oportunidades o
            where o.cuenta_id = c.id and not o.comercial_id = any($1::uuid[])
              and o.etapa::text not in ('venta','rechazada','derivada')) as abiertas_de_otros
     from cuentas c
    where c.comercial_id = any($1::uuid[])
    order by c.razon_social`,
  [idsPv],
);

if (cuentas.length === 0) {
  console.log("\nNo hay ningún cliente en la cartera de postventa. Nada que devolver.\n");
  await bd.end();
  process.exit(0);
}

const { rows: perfiles } = await bd.query(`select id, nombre, codigo_comercial from perfiles`);
const nombreDe = (id) => {
  const p = perfiles.find((x) => x.id === id);
  return p ? `${p.codigo_comercial ?? "—"} ${p.nombre}` : "sin dueño";
};

console.log(`\nClientes hoy en la cartera de ${pv.map((p) => p.codigo_comercial).join("/")}: ${cuentas.length}\n`);
for (const c of cuentas) {
  console.log(`  ${c.razon_social}`);
  console.log(`     desde   : ${new Date(c.cartera_desde).toISOString().slice(0, 10)}`);
  console.log(`     vuelve a: ${c.devolver_a ? nombreDe(c.devolver_a) : "SIN DUEÑO (no lo tenía antes)"}`);
  console.log(`     recupera: ${c.abiertas_de_otros} oportunidad(es) abiertas que hoy no puede abrir su dueño`);
}

if (!APLICAR) {
  console.log("\nNada se ha modificado. Agregá --aplicar para hacerlo.\n");
  await bd.end();
  process.exit(0);
}

let devueltas = 0;
for (const c of cuentas) {
  // `cartera_desde` vuelve a la fecha de la asignación anterior si la hay: es
  // el dato que decide cuándo el cliente se vuelve liberable a los 6 meses, y
  // dejarlo en la fecha de la derivación a postventa le regalaría al comercial
  // seis meses que no le corresponden.
  await bd.query(
    `update cuentas c set
       comercial_id = $2::uuid,
       cartera_desde = case when $2::uuid is null then null else coalesce(
         (select a.created_at::date from asignaciones a
           where a.cuenta_id = c.id and a.a_comercial = $2::uuid
           order by a.created_at desc limit 1),
         c.cartera_desde)
       end
     where c.id = $1::uuid`,
    [c.id, c.devolver_a],
  );
  devueltas++;
  console.log(`  · ${c.razon_social} → ${c.devolver_a ? nombreDe(c.devolver_a) : "sin dueño"}`);
}

console.log(`\n✓ ${devueltas} cliente(s) devueltos. Los casos de postventa siguen con el área.\n`);
await bd.end();
