// ============================================================
// CRM EFAMEINSA · Limpiar los contactos derivados a otras áreas
// ============================================================
// El ing. Carlos, 24-08: «que no tenga la opción de otras áreas … esos
// registros hay que eliminarlos». Lo que no es comercial —servicio técnico,
// RR. HH., proveedores— sigue su camino en el ERP y no tiene por qué estar
// acá.
//
// Alcance, a propósito estrecho: SOLO los leads en estado 'derivado_area', que
// son los que Central creó desde el formulario mientras la opción existió.
//
// NO se tocan los ~7.700 leads con area_destino distinto de 'comercial' que
// están en estado 'historico': ésos son el archivo importado de la empresa, no
// derivaciones de Central. Borrarlos sería perder el histórico.
//
// Antes de borrar, todo lo que se va queda guardado en un JSON fuera del repo.
//
//   node --env-file=.env.local scripts/limpiar-derivados-otras-areas.mjs        (muestra)
//   node --env-file=.env.local scripts/limpiar-derivados-otras-areas.mjs --borrar

import { Client } from "pg";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BORRAR = process.argv.includes("--borrar");

const bd = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await bd.connect();

const { rows } = await bd.query(
  `select * from leads where estado = 'derivado_area' order by recibido_at`,
);

if (rows.length === 0) {
  console.log("No hay contactos en estado 'derivado_area'. Nada que limpiar.");
  await bd.end();
  process.exit(0);
}

console.log(`${rows.length} contacto(s) derivado(s) a otras áreas:\n`);
for (const l of rows) {
  const quien = [l.nombre_contacto, l.razon_social].filter(Boolean).join(" · ") || "(sin nombre)";
  console.log(`  ${l.codigo}  ${l.area_destino.padEnd(18)}  ${quien}`);
}

if (!BORRAR) {
  console.log("\nEsto fue solo una muestra. Para borrarlos: --borrar");
  await bd.end();
  process.exit(0);
}

// El respaldo va fuera del repo: son datos de contacto de personas reales.
const respaldo = join(homedir(), `derivados-otras-areas-respaldo.json`);
writeFileSync(respaldo, JSON.stringify(rows, null, 2), "utf8");
console.log(`\nRespaldo guardado en ${respaldo}`);

// Un lead derivado a otra área nunca llegó a tener oportunidad ni cuenta: se
// comprueba igual antes de borrar, para no dejar nada colgando.
const { rows: atados } = await bd.query(
  `select count(*)::int n from oportunidades where lead_id = any($1::uuid[])`,
  [rows.map((l) => l.id)],
);
if (atados[0].n > 0) {
  console.error(
    `\n✗ ${atados[0].n} de estos contactos ya tienen una oportunidad abierta. No se borra nada: revíselos a mano.`,
  );
  await bd.end();
  process.exit(1);
}

const { rowCount } = await bd.query(`delete from leads where estado = 'derivado_area'`);
console.log(`✓ ${rowCount} contacto(s) eliminado(s).`);

await bd.end();
