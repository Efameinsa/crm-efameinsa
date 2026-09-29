// Aplica UNA migración por nombre de archivo y la anota en `_migraciones_aplicadas`,
// igual que aplicar-migracion.mjs pero sin recorrer la carpeta ni correr el seed.
// Para cuando la rama no trae las migraciones de otras ramas ya aplicadas.
//
//   node --env-file=.env.local scripts/_aplicar-una-migracion.mjs 0328_x.sql [--probar]
//
// --probar la ejecuta y la deshace (rollback): dice si corre, sin dejar nada.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const archivo = process.argv[2];
const probar = process.argv.includes("--probar");
if (!archivo || !/^\d{4}[a-z]?_[\w-]+\.sql$/.test(archivo)) {
  console.error("Uso: _aplicar-una-migracion.mjs <archivo.sql> [--probar]");
  process.exit(1);
}
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");

const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await cliente.connect();
try {
  const { rows } = await cliente.query("select 1 from _migraciones_aplicadas where archivo = $1", [archivo]);
  if (rows.length) {
    console.log(`= Ya aplicada: ${archivo}`);
  } else {
    await cliente.query("begin");
    try {
      await cliente.query("set local lock_timeout = '5s'");
      await cliente.query(sql);
      await cliente.query("insert into _migraciones_aplicadas (archivo) values ($1)", [archivo]);
      await cliente.query(probar ? "rollback" : "commit");
      console.log(probar ? `✓ ${archivo} corre bien (deshecha, no quedó nada)` : `✓ Aplicada: ${archivo}`);
    } catch (err) {
      await cliente.query("rollback");
      throw err;
    }
  }
} catch (err) {
  console.error("✗", err.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
