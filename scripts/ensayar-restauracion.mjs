// Ensayo de restauración: se levanta el esquema del respaldo ENTERO en un
// esquema temporal de la misma base y se deshace todo al final. Sirve para
// saber que los .sql que dejamos guardados vuelven a construir el CRM, sin
// tocar nada de producción y sin necesitar otro Postgres a mano.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const DIR = join("backups", `respaldo-completo-${new Date().toISOString().slice(0, 10)}`, "base", "esquema");
const PRUEBA = "_ensayo_respaldo";
const PASOS = [
  "02-enums.sql", "03-tablas.sql", "04-indices.sql", "05-vistas.sql",
  "06-funciones.sql", "07-triggers.sql", "08-politicas-rls.sql", "10-comentarios.sql",
];

const bd = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
await bd.query("begin");

let fallas = 0;
try {
  await bd.query(`drop schema if exists ${PRUEBA} cascade`);
  await bd.query(`create schema ${PRUEBA}`);
  await bd.query(`set local search_path to ${PRUEBA}, public`);

  for (const paso of PASOS) {
    // El respaldo nombra todo como public.*; para el ensayo se redirige al
    // esquema de prueba. Es el único cambio: el contenido es idéntico.
    const texto = readFileSync(join(DIR, paso), "utf8").replaceAll("public.", `${PRUEBA}.`);
    try {
      await bd.query(texto);
      console.log(`  ok   ${paso}`);
    } catch (e) {
      fallas++;
      console.log(`  FALLA ${paso}\n        ${e.message}`);
      await bd.query("rollback to savepoint antes").catch(() => {});
    }
    await bd.query("savepoint antes").catch(() => {});
  }

  const [r] = (await bd.query(`
    select (select count(*) from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE') tablas,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1) funciones,
           (select count(*) from pg_policies where schemaname = $1) politicas,
           (select count(*) from pg_indexes where schemaname = $1) indices,
           (select count(*) from information_schema.views where table_schema = $1) vistas,
           (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace where n.nspname = $1 and not t.tgisinternal) triggers
  `, [PRUEBA])).rows;
  console.log("\nReconstruido en el esquema de ensayo:");
  console.table([r]);
} finally {
  await bd.query("rollback");
  await bd.end();
}
console.log(fallas === 0 ? "\nSin errores. El respaldo vuelve a levantar el CRM entero." : `\n${fallas} paso(s) con error.`);
