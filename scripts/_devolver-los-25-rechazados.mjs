// ============================================================
// Los 25 que se rechazaron de golpe vuelven a la lista (gerencia, 10-09)
// ============================================================
// El 10-09 por la mañana, a pedido de Ariana, se rechazaron 25 oportunidades
// de su cartera con el motivo «Solo consultaba / sin intención», para que le
// dejaran de aparecer como pendientes.
//
// Esa misma tarde Carlos lo revisó en la reunión y lo dio por mal hecho:
//
//   «no puedes poner todo rechazado, rechazado, es más, no le puedes ni
//    siquiera pedir a Santos que lo rechace todo por rechazar, tenemos que
//    tener criterio […] si no lo vemos así, todo mejor lo rechazamos, no tiene
//    sentido».
//
// Y dijo qué corresponde en su lugar: llamar y, al que no compra hoy, marcarle
// «Compra a futuro», que es un resultado del catálogo y agenda la fecha —«esta
// compra a futuro te manda un calendario y eso es lo que se tiene que hacer»—.
// Ariana lo aceptó en la misma reunión: «Tendría que llamar a todos esos de ahí
// para poder dar un doble check».
//
// Esto DESHACE el rechazo, no lo reemplaza por otra decisión: cada una vuelve
// exactamente a la etapa en la que estaba (el respaldo se guardó antes de
// tocarlas) y queda como pendiente vencida, que es como tiene que verse algo
// que hay que volver a llamar. Quién decide si es «Compra a futuro», un rechazo
// con criterio o una venta, es ella, en la llamada.
//
//   node --env-file=.env.local scripts/_devolver-los-25-rechazados.mjs
//   node --env-file=.env.local scripts/_devolver-los-25-rechazados.mjs --aplicar
import { readFileSync } from "node:fs";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const RESPALDO = "scripts/data/rechazo-ariana-10-09-antes.json";
const NOTA =
  "Reunión de gerencia del 10-09: se deshace el rechazo en bloque de estas 25 oportunidades. " +
  "Carlos: «no puedes poner todo rechazado por rechazar, tenemos que tener criterio». " +
  "Hay que llamar y decidir una por una; al que no compra hoy le corresponde «Compra a futuro», " +
  "que agenda la fecha, y no el rechazo.";

const previas = JSON.parse(readFileSync(RESPALDO, "utf8"));
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: ahora } = await bd.query(
  `select o.id, o.etapa::text etapa, cu.razon_social, p.codigo_comercial cod
     from oportunidades o
     join cuentas cu on cu.id = o.cuenta_id
     join perfiles p on p.id = o.comercial_id
    where o.id = any($1::uuid[])`,
  [previas.map((o) => o.id)],
);
const porId = new Map(ahora.map((o) => [o.id, o]));

// Solo se devuelven las que siguen exactamente como las dejó el rechazo. Si
// alguien la trabajó después, esa decisión es más nueva y manda.
const devolver = previas.filter((p) => porId.get(p.id)?.etapa === "rechazada");
const tocadas = previas.filter((p) => porId.get(p.id) && porId.get(p.id).etapa !== "rechazada");

console.log(`Respaldadas el 10-09: ${previas.length}`);
console.log(`Siguen rechazadas y vuelven: ${devolver.length}`);
if (tocadas.length) console.log(`Alguien ya las trabajó después, se dejan como están: ${tocadas.length}`);
console.table(devolver.slice(0, 30).map((p) => ({
  cliente: (porId.get(p.id)?.razon_social ?? "").slice(0, 40),
  vuelve_a: p.etapa,
})));

if (!APLICAR) {
  console.log("\n(ensayo: no se tocó nada — para hacerlo, --aplicar)");
  await bd.end();
  process.exit(0);
}

const { rows: [gerencia] } = await bd.query(
  `select id from perfiles where rol = 'gerencia' and activo order by nombre limit 1`);

await bd.query("begin");
try {
  let n = 0;
  for (const p of devolver) {
    await bd.query(
      `update oportunidades
          set etapa = $2::etapa_oportunidad, motivo_rechazo_id = $3, cerrada_at = $4, updated_at = now()
        where id = $1::uuid`,
      [p.id, p.etapa, p.motivo_rechazo_id, p.cerrada_at],
    );
    // Queda escrito en el expediente por qué volvió, sin mover la próxima
    // acción: la agenda la decide la llamada, no esto.
    await bd.query(
      `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
       values ($1::uuid, 'nota', $2, $3::uuid, now())`,
      [p.id, NOTA, gerencia?.id ?? null],
    );
    n++;
  }
  await bd.query("commit");
  console.log(`\n✓ ${n} oportunidades devueltas a su etapa, con la nota del acuerdo.`);
} catch (e) {
  await bd.query("rollback");
  console.error("✗ no se devolvió ninguna:", e.message);
  await bd.end();
  process.exit(1);
}

const { rows: [q] } = await bd.query(
  `select count(*) n from oportunidades o join perfiles p on p.id = o.comercial_id
    where p.codigo_comercial = 'C4' and o.etapa::text not in ('venta','rechazada','derivada','historico')`);
console.log(`C4 queda con ${q.n} oportunidades abiertas.`);
await bd.end();
