// HYPER TECHNOLOGIES y CHAMBI ARISACA, fuera de la agenda de hoy (Santos, 10-09).
//
// Las dos las reactivó Ariana esta mañana desde «La base del Excel» y quedaron
// con la próxima acción para hoy. No son mantenimiento —el histórico de las dos
// es una cotización de equipos, de 2021 y de 2025—, así que no van a PV1: lo
// que corresponde es devolverlas al archivo, que es de donde salieron.
//
// Se deshace la reactivación, no se rechaza: la ficha sigue en su cartera y la
// oportunidad vuelve al histórico, donde se puede retomar el día que sirva.
//
//   node --env-file=.env.local scripts/_sacar-de-la-agenda-1009.mjs
//   node --env-file=.env.local scripts/_sacar-de-la-agenda-1009.mjs --aplicar
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const NOMBRES = ["%HYPER TECHNOLOG%", "%CHAMBI ARISACA%"];
const NOTA =
  "Se devuelve al archivo: la reactivación de hoy la sacó al calendario y no corresponde. " +
  "No es un caso de mantenimiento —su histórico es una cotización de equipos—, así que tampoco " +
  "pasa a postventa. Queda en el histórico, para retomarla cuando haya motivo (Santos, 10-09).";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(
  `select o.id, o.etapa::text etapa, cu.razon_social, to_char(o.proxima_accion_at,'YYYY-MM-DD') prox, o.proxima_accion
     from oportunidades o join cuentas cu on cu.id = o.cuenta_id
    where (cu.razon_social ilike any($1)) and o.etapa::text <> 'historico'
    order by cu.razon_social`, [NOMBRES]);

console.log(`En la agenda: ${rows.length}`);
console.table(rows.map((r) => ({ cliente: r.razon_social.slice(0, 40), etapa: r.etapa, para: r.prox, accion: r.proxima_accion })));

if (!rows.length) { console.log("Nada que sacar."); await bd.end(); process.exit(0); }
if (!APLICAR) { console.log("\n(ensayo: no se tocó nada — para hacerlo, --aplicar)"); await bd.end(); process.exit(0); }

const { rows: [gerencia] } = await bd.query(
  `select id from perfiles where rol = 'gerencia' and activo order by nombre limit 1`);
const ids = rows.map((r) => r.id);

await bd.query("begin");
try {
  await bd.query(
    `update oportunidades
        set etapa = 'historico', proxima_accion = null, proxima_accion_at = null,
            proxima_accion_hora = null, updated_at = now()
      where id = any($1::uuid[])`, [ids]);
  await bd.query(
    `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
     select unnest($1::uuid[]), 'nota', $2, $3::uuid, now()`, [ids, NOTA, gerencia?.id ?? null]);
  await bd.query("commit");
  console.log(`\n✓ ${ids.length} fuera de la agenda, de vuelta en el histórico.`);
} catch (e) {
  await bd.query("rollback");
  console.error("✗ no se tocó nada:", e.message);
  process.exit(1);
} finally {
  await bd.end();
}
