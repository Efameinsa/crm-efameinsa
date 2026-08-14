// Aplica supabase/migrations/*.sql y supabase/seed.sql directamente contra la
// base de datos, sin pasar por el SQL Editor del dashboard.
//
// Uso:
//   node --env-file=.env.local scripts/aplicar-migracion.mjs
//
// Requiere DATABASE_URL en .env.local (Settings → Database → Connection string → URI).

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_MIGRACIONES = join(RAIZ, "supabase", "migrations");
const ARCHIVO_SEED = join(RAIZ, "supabase", "seed.sql");

if (!process.env.DATABASE_URL) {
  console.error(
    "Falta DATABASE_URL. Corran con: node --env-file=.env.local scripts/aplicar-migracion.mjs",
  );
  process.exit(1);
}

const cliente = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ejecutarArchivo(ruta) {
  const sql = readFileSync(ruta, "utf8");
  console.log(`→ Ejecutando ${ruta.replace(RAIZ, ".")}`);
  await cliente.query(sql);
}

async function main() {
  await cliente.connect();
  try {
    const migraciones = readdirSync(DIR_MIGRACIONES)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const archivo of migraciones) {
      await ejecutarArchivo(join(DIR_MIGRACIONES, archivo));
    }

    await ejecutarArchivo(ARCHIVO_SEED);

    console.log("\n✓ Migración y seed aplicados correctamente.");
  } finally {
    await cliente.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Error aplicando migración/seed:\n", err.message);
  process.exit(1);
});
