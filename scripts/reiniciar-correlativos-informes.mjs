// Deja la numeración de los informes de cierre lista para arrancar en Nº 1
// (docs/11-plan-correcciones-prueba-23-08.md · ítem B8).
//
// Darwin, probando el 23-08: «vamos a empezar desde el informe número 1. Así
// que cuando esto funcione el día lunes, por defecto vamos a poner que corra
// ya el informe número 1».
//
// Qué encontró la verificación del 24-08 antes de correr esto:
//   · 2 informes EMITIDOS de la serie EFAMEINSA (001-2026 y 002-2026), del
//     viernes 21-08 14:24 — de la sesión en que se verificó el formulario en
//     producción. Son anteriores al snapshot del fin de semana, por eso la
//     limpieza del lunes no los tocó. Darwin confirmó que son pruebas suyas.
//   · el contador INFORME-OPEN-2026 estaba en 4 SIN ningún informe OPEN en la
//     base. Coincide con el documento real "INFORME OPEN Nº004-2026 —
//     CONGELADOS Y FRESCOS S.A.C." que está en la carpeta del proyecto, así
//     que probablemente se puso para continuar la numeración del papel.
//     ⚠️ Se advirtió que resetearlo puede duplicar documentos que ya existen
//     impresos; Darwin decidió resetearlo igual. Queda dicho acá.
//
// Uso: node --env-file=.env.local scripts/reiniciar-correlativos-informes.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const CLAVES = ["INFORME-EFAMEINSA-2026", "INFORME-OPEN-2026"];

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: informes } = await bd.query(
  `select i.id, i.serie, i.correlativo, i.codigo, i.created_at, i.emitido_at, c.razon_social
     from informes_cierre i left join cuentas c on c.id = i.cuenta_id
    order by i.created_at`,
);
const { rows: contadores } = await bd.query(
  `select clave, ultimo from correlativos where clave = any($1) order by clave`,
  [CLAVES],
);

console.log("=== INFORMES EN LA BASE ===");
for (const i of informes) {
  console.log(
    `  ${i.serie} ${i.codigo ?? "(borrador, sin número)"} · ${i.razon_social ?? "sin cuenta"} · creado ${i.created_at.toISOString().slice(0, 16)} · ${i.emitido_at ? "EMITIDO" : "borrador"}`,
  );
}
console.log("\n=== CONTADORES ===");
for (const c of contadores) console.log(`  ${c.clave} = ${c.ultimo}`);

const emitidos = informes.filter((i) => i.emitido_at);
const borradores = informes.filter((i) => !i.emitido_at);

console.log(`\n=== QUÉ HARÍA ===`);
console.log(`  borrar ${emitidos.length} informe(s) emitido(s): ${emitidos.map((i) => i.codigo).join(", ") || "—"}`);
console.log(`  dejar ${CLAVES.join(" y ")} en 0`);
if (borradores.length) {
  console.log(
    `  ⓘ quedan ${borradores.length} borrador(es) SIN emitir que NO se tocan (no gastaron número): ${borradores
      .map((b) => `${b.serie}/${b.razon_social ?? "sin cuenta"}`)
      .join(", ")} — revisar si son basura de pruebas viejas.`,
  );
}

if (!APLICAR) {
  console.log("\n(Dry-run: no se tocó nada. Correr con --aplicar.)");
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  // Los informes emitidos pueden estar protegidos igual que las cotizaciones
  // (migración 0012 usa el mismo patrón); se desactivan los triggers dentro de
  // la transacción, como en los demás scripts de limpieza de este repo.
  await bd.query("set local session_replication_role = replica");
  const del = await bd.query(`delete from informes_cierre where emitido_at is not null`);
  const upd = await bd.query(`update correlativos set ultimo = 0 where clave = any($1)`, [CLAVES]);
  await bd.query("commit");
  console.log(`\n✓ ${del.rowCount} informe(s) emitido(s) borrado(s) · ${upd.rowCount} contador(es) en 0.`);
} catch (e) {
  await bd.query("rollback");
  console.error("\n✗ Rollback:", e.message);
  process.exitCode = 1;
}

const { rows: fin } = await bd.query(`select clave, ultimo from correlativos where clave = any($1) order by clave`, [CLAVES]);
console.log("Contadores finales:", fin.map((r) => `${r.clave}=${r.ultimo}`).join(", "));
await bd.end();
