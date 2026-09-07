/**
 * EL ASISTENTE NO PUEDE ESCRIBIR. Esto lo comprueba, no lo asume.
 *
 * La promesa que se le hizo a gerencia es que el chat solo consulta. Esa
 * promesa no puede depender de que el modelo se porte bien ni de que nadie
 * agregue después una herramienta descuidada. Acá se revisan las dos mitades:
 *
 *   1. El código: ninguna librería que el asistente usa llama a insert,
 *      update, upsert o delete.
 *   2. La base: ninguna función de Postgres que esas librerías invocan escribe
 *      en una tabla del CRM.
 *
 * Se corre con: npm run db:auditar-asistente
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const LIBRERIAS = [
  "src/lib/asistente/herramientas.ts",
  "src/lib/buscar-en-todo.ts",
  "src/lib/cierre-semanal.ts",
  "src/lib/historial-semanas.ts",
  "src/lib/reportes.ts",
  "src/lib/catalogo-operaciones.ts",
  "src/lib/buscar-equipo.ts",
  "src/lib/potenciales-semana.ts",
  "src/lib/periodo.ts",
];

/** Tablas temporales propias de una función: son su borrador, no datos del CRM. */
const BORRADORES = new Set(["_vd"]);

let fallas = 0;

// ── 1. El código ──────────────────────────────────────────────────────────
const rpcs = new Set();
for (const archivo of LIBRERIAS) {
  const texto = readFileSync(archivo, "utf8");
  const escrituras = [...texto.matchAll(/\.(insert|update|upsert|delete)\(/g)].map((m) => m[1]);
  if (escrituras.length > 0) {
    console.log(`  FALLA  ${archivo} llama a ${[...new Set(escrituras)].join(", ")}`);
    fallas++;
  }
  for (const m of texto.matchAll(/\.rpc\("([a-z0-9_]+)"/g)) rpcs.add(m[1]);
}
console.log(`Código: ${LIBRERIAS.length} archivos revisados, ${fallas} con escrituras.`);
console.log(`Funciones de base que usan: ${[...rpcs].sort().join(", ") || "ninguna"}`);

// ── 2. La base ────────────────────────────────────────────────────────────
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
for (const nombre of [...rpcs].sort()) {
  const { rows } = await bd.query(
    `select pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [nombre],
  );
  if (rows.length === 0) {
    console.log(`  FALLA  ${nombre}: no existe en la base`);
    fallas++;
    continue;
  }
  const sospechas = [];
  for (const { row: r } of rows.map((row) => ({ row }))) {
    for (const linea of r.def.split("\n")) {
      const l = linea.toLowerCase().trim();
      const m = l.match(/\b(insert\s+into|update|delete\s+from|truncate)\s+(?:only\s+)?([a-z0-9_."]+)/);
      // «create temp table … on commit drop» y lo que se escriba en ella no
      // son datos del CRM: viven lo que dura la consulta.
      if (m && !BORRADORES.has(m[2].replace(/"/g, ""))) sospechas.push(l.slice(0, 120));
    }
  }
  if (sospechas.length > 0) {
    console.log(`  FALLA  ${nombre} escribe:`);
    for (const s of sospechas) console.log(`         ${s}`);
    fallas++;
  } else {
    console.log(`  ok     ${nombre}`);
  }
}
await bd.end();

console.log(fallas === 0 ? "\nEl asistente es solo de consulta." : `\n${fallas} problema(s): revisar antes de desplegar.`);
process.exit(fallas === 0 ? 0 : 1);
