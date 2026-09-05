// Restaura un backup generado por scripts/backup-datos.mjs. Trunca TODAS las
// tablas de public y vuelve a insertar desde el .ndjson de cada una, con
// `session_replication_role = replica` (desactiva triggers y FKs mientras
// carga, así el orden de las tablas no importa y no se disparan triggers de
// negocio con datos históricos).
//
// PELIGRO: esto SOBREESCRIBE por completo la base a la que apunta
// DATABASE_URL. Nunca correr contra producción como prueba — solo contra una
// base local o de desarrollo. No hay prompt interactivo (sin stdin en este
// entorno): se exige el flag --confirmo-sobrescribir a propósito.
//
// Uso:
//   node --env-file=.env.local scripts/restaurar-datos.mjs --archivo backups/backup-2026-08-14.zip --confirmo-sobrescribir

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const idxArchivo = args.indexOf("--archivo");
const archivoZip = idxArchivo !== -1 ? args[idxArchivo + 1] : null;
const confirmado = args.includes("--confirmo-sobrescribir");

if (!archivoZip) {
  console.error(
    "Uso: node --env-file=.env.local scripts/restaurar-datos.mjs --archivo <ruta.zip> --confirmo-sobrescribir",
  );
  process.exit(1);
}
if (!existsSync(archivoZip)) {
  console.error(`No se encontró el archivo: ${archivoZip}`);
  process.exit(1);
}
if (!confirmado) {
  console.error(
    "Esto SOBREESCRIBE por completo los datos de la base a la que apunta DATABASE_URL.\n" +
      "Nunca lo corran contra producción como prueba.\n" +
      "Si están seguros, agreguen el flag --confirmo-sobrescribir.",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}

const dirTemp = join(RAIZ, "backups", `.restaurar-tmp-${Date.now()}`);

function insertarFilas(client, tabla, filas) {
  const promesas = filas.map((linea) => {
    const fila = JSON.parse(linea);
    const columnas = Object.keys(fila);
    if (columnas.length === 0) return Promise.resolve();
    const marcadores = columnas.map((_, i) => `$${i + 1}`).join(", ");
    const nombresCol = columnas.map((c) => `"${c}"`).join(", ");
    const valores = columnas.map((c) => fila[c]);
    return client.query(`insert into "${tabla}" (${nombresCol}) values (${marcadores})`, valores);
  });
  return Promise.all(promesas);
}

async function main() {
  console.log(`→ Descomprimiendo ${archivoZip}…`);
  mkdirSync(dirTemp, { recursive: true });
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Expand-Archive -Path '${archivoZip}' -DestinationPath '${dirTemp}' -Force`],
    { stdio: "inherit" },
  );

  const manifiestoPath = join(dirTemp, "manifiesto.json");
  if (existsSync(manifiestoPath)) {
    const manifiesto = JSON.parse(readFileSync(manifiestoPath, "utf8"));
    console.log(`  Backup del ${manifiesto.fecha} (migración más alta al respaldar: ${manifiesto.migracion_mas_alta})`);
  }

  // El respaldo de siempre deja los .ndjson en la raíz; el completo
  // (scripts/respaldo-completo.mjs) los pone en base/datos/. Se aceptan los
  // dos, para que haya un solo camino de vuelta.
  const dirDatos = existsSync(join(dirTemp, "base", "datos")) ? join(dirTemp, "base", "datos") : dirTemp;

  // auth-users.ndjson y storage-objects.ndjson no son tablas de public: se
  // restauran aparte, con el proveedor de identidad que se vaya a usar.
  const archivosNdjson = readdirSync(dirDatos)
    .filter((f) => f.endsWith(".ndjson") && !f.startsWith("auth-") && !f.startsWith("storage-"));
  const tablas = archivosNdjson.map((f) => basename(f, ".ndjson"));
  if (tablas.length === 0) {
    console.error("El zip no contiene archivos .ndjson — ¿es un backup válido?");
    process.exit(1);
  }

  const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    await cliente.query("begin");
    await cliente.query("set local session_replication_role = replica");

    const listaTablas = tablas.map((t) => `"${t}"`).join(", ");
    console.log(`→ Truncando ${tablas.length} tablas…`);
    await cliente.query(`truncate table ${listaTablas} restart identity cascade`);

    for (const tabla of tablas) {
      const contenido = readFileSync(join(dirDatos, `${tabla}.ndjson`), "utf8");
      const filas = contenido.split("\n").filter(Boolean);
      if (filas.length > 0) await insertarFilas(cliente, tabla, filas);
      console.log(`→ ${tabla}: ${filas.length} filas restauradas`);
    }

    await cliente.query("commit");
    console.log("\n✓ Restauración completada.");
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    await cliente.end();
  }

  rmSync(dirTemp, { recursive: true, force: true });
}

main().catch((err) => {
  rmSync(dirTemp, { recursive: true, force: true });
  console.error("\n✗ Error restaurando el backup:\n", err.message);
  process.exit(1);
});
