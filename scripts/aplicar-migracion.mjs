// Aplica supabase/migrations/*.sql (solo las nuevas) y supabase/seed.sql
// directamente contra la base de datos, sin pasar por el SQL Editor del
// dashboard. Lleva registro de qué migraciones ya corrieron en la tabla
// `_migraciones_aplicadas`, así que correr esto de nuevo tras agregar un
// archivo nuevo en supabase/migrations/ solo ejecuta ese archivo.
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

async function main() {
  await cliente.connect();
  try {
    await cliente.query(
      `create table if not exists _migraciones_aplicadas (
         archivo text primary key,
         aplicado_at timestamptz not null default now()
       )`,
    );

    const { rows: aplicadas } = await cliente.query(
      "select archivo from _migraciones_aplicadas",
    );
    const yaAplicadas = new Set(aplicadas.map((r) => r.archivo));

    const migraciones = readdirSync(DIR_MIGRACIONES)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let pendientes = 0;
    for (const archivo of migraciones) {
      if (yaAplicadas.has(archivo)) {
        console.log(`= Ya aplicada: ${archivo}`);
        continue;
      }
      pendientes++;
      const sql = readFileSync(join(DIR_MIGRACIONES, archivo), "utf8");
      console.log(`→ Ejecutando ${archivo}`);
      await cliente.query("begin");
      try {
        await cliente.query(sql);
        await cliente.query(
          "insert into _migraciones_aplicadas (archivo) values ($1)",
          [archivo],
        );
        await cliente.query("commit");
      } catch (err) {
        await cliente.query("rollback");
        throw err;
      }
    }

    // El seed es idempotente (ON CONFLICT DO NOTHING) — se re-ejecuta siempre.
    console.log("→ Ejecutando seed.sql");
    await cliente.query(readFileSync(ARCHIVO_SEED, "utf8"));

    console.log(
      pendientes > 0
        ? `\n✓ ${pendientes} migración(es) nueva(s) aplicada(s) y seed corrido.`
        : "\n✓ No había migraciones nuevas; seed corrido igual.",
    );
  } finally {
    await cliente.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Error aplicando migración/seed:\n", err.message);
  process.exit(1);
});
