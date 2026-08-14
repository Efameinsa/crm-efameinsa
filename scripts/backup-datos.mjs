// Respaldo completo de la base de datos a NDJSON (una tabla = un archivo,
// una fila = una línea JSON), comprimido a un único .zip con
// Compress-Archive de PowerShell (no se asume pg_dump instalado — no lo
// está en este equipo). El esquema completo vive en supabase/migrations/
// (git), así que zip + migraciones reconstruyen todo en CUALQUIER Postgres,
// sin depender de Supabase. Ver docs/respaldo-y-restauracion.md.
//
// Uso:
//   node --env-file=.env.local scripts/backup-datos.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_BACKUPS = join(RAIZ, "backups");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Corran con: node --env-file=.env.local scripts/backup-datos.mjs");
  process.exit(1);
}

function fechaHoy() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tamañoLegible(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await cliente.connect();

  const fecha = fechaHoy();
  const dirFecha = join(DIR_BACKUPS, fecha);
  mkdirSync(dirFecha, { recursive: true });

  const { rows: tablas } = await cliente.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );

  const conteoPorTabla = {};

  for (const { table_name: tabla } of tablas) {
    const { rows } = await cliente.query(`select * from "${tabla}"`);
    const lineas = rows.map((fila) => JSON.stringify(fila)).join("\n");
    writeFileSync(join(dirFecha, `${tabla}.ndjson`), lineas ? lineas + "\n" : "", "utf8");
    conteoPorTabla[tabla] = rows.length;
    console.log(`→ ${tabla}: ${rows.length} filas`);
  }

  const { rows: migraciones } = await cliente.query(
    `select archivo from _migraciones_aplicadas order by archivo desc limit 1`,
  ).catch(() => ({ rows: [] }));

  const manifiesto = {
    fecha,
    generado_at: new Date().toISOString(),
    conteo_por_tabla: conteoPorTabla,
    migracion_mas_alta: migraciones[0]?.archivo ?? null,
  };
  writeFileSync(join(dirFecha, "manifiesto.json"), JSON.stringify(manifiesto, null, 2), "utf8");

  await cliente.end();

  const rutaZip = join(DIR_BACKUPS, `backup-${fecha}.zip`);
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${dirFecha}\\*' -DestinationPath '${rutaZip}' -Force`,
    ],
    { stdio: "inherit" },
  );

  rmSync(dirFecha, { recursive: true, force: true });

  const tamaño = statSync(rutaZip).size;
  const totalFilas = Object.values(conteoPorTabla).reduce((a, b) => a + b, 0);
  console.log(`\n✓ Backup listo: ${rutaZip}`);
  console.log(`  ${tablas.length} tablas, ${totalFilas.toLocaleString("es-PE")} filas totales, ${tamañoLegible(tamaño)}`);

  const historico = readdirSync(DIR_BACKUPS).filter((f) => f.endsWith(".zip"));
  console.log(`  ${historico.length} backup(s) en total en ${DIR_BACKUPS}`);
}

main().catch((err) => {
  console.error("\n✗ Error generando el backup:\n", err.message);
  process.exit(1);
});
