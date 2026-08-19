// Fusiona dos perfiles de comercial en uno solo: mueve TODO lo que apunta al
// perfil origen hacia el perfil destino, y deja el código del origen LIBRE
// para otra persona (perfil desactivado, sin código).
//
// Caso que lo motivó (reunión con el ing. Carlos, 19-08-2026): Brenda Taboada
// operó como C8 desde siempre hasta junio de 2026 y desde entonces es C1.
// Carlos: "entra todo a la chica que se llama ahora Brenda, pero el código va
// a ser C1… y C8 va a estar completamente vacío, libre". El poco historial que
// tenía el C1 anterior (otro gestor) se suma al de ella, por decisión suya.
//
// Se hace por script y no por SQL suelto porque:
//  · es una operación transaccional sobre ~9 tablas (si algo falla, nada queda
//    a medias: un comercial con la mitad de su cartera es peor que ninguno);
//  · va a repetirse (la rotación de comerciales es normal), así que se
//    parametriza en vez de dejar un script de un solo uso;
//  · imprime un ANTES y un DESPUÉS verificable, que es lo que gerencia va a
//    querer ver para confiar en el resultado.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-comerciales.mjs --de C8 --a C1 \
//        [--nombre "Brenda Taboada"] [--aplicar]
// Sin --aplicar solo simula (dry-run) y no toca nada.

import { Client } from "pg";

function arg(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : porDefecto;
}
const DE = arg("de");
const A = arg("a");
const NOMBRE = arg("nombre");
const APLICAR = process.argv.includes("--aplicar");

if (!DE || !A) {
  console.error("Faltan parámetros. Ej: --de C8 --a C1 --nombre \"Brenda Taboada\" [--aplicar]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const cliente = new Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

// Todas las columnas que referencian perfiles se descubren del catálogo, no se
// escriben a mano: si mañana se agrega una tabla con comercial_id, este script
// la incluye solo. Escribirlas a mano es cómo se pierde media cartera.
const { rows: columnas } = await cliente.query(`
  select tc.table_name as tabla, kcu.column_name as columna
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
    and ccu.table_name = 'perfiles' and ccu.column_name = 'id'
    and tc.table_schema = 'public'
  order by 1, 2`);

const { rows: perfiles } = await cliente.query(
  `select id, codigo_comercial, nombre, activo from perfiles where codigo_comercial = any($1)`,
  [[DE, A]],
);
const origen = perfiles.find((p) => p.codigo_comercial === DE);
const destino = perfiles.find((p) => p.codigo_comercial === A);
if (!origen) throw new Error(`No existe un comercial con código ${DE}`);
if (!destino) throw new Error(`No existe un comercial con código ${A}`);
if (origen.id === destino.id) throw new Error("El origen y el destino son el mismo perfil");

console.log(`\nFusión: ${DE} "${origen.nombre}" → ${A} "${destino.nombre}"${NOMBRE ? ` (renombrado a "${NOMBRE}")` : ""}`);
console.log(APLICAR ? "MODO: aplicar (se escriben los cambios)\n" : "MODO: simulación — nada se modifica (agregue --aplicar)\n");

async function contar(tabla, columna, id) {
  const { rows } = await cliente.query(`select count(*)::int as n from ${tabla} where ${columna} = $1`, [id]);
  return rows[0].n;
}

const antes = [];
for (const { tabla, columna } of columnas) {
  const [nDe, nA] = [await contar(tabla, columna, origen.id), await contar(tabla, columna, destino.id)];
  if (nDe || nA) antes.push({ "tabla.columna": `${tabla}.${columna}`, [DE]: nDe, [A]: nA, "→ total": nDe + nA });
}
console.log("ANTES:");
console.table(antes);
const totalAMover = antes.reduce((s, f) => s + f[DE], 0);
console.log(`Filas a mover: ${totalAMover}\n`);

if (!APLICAR) {
  console.log("Simulación terminada. Repita con --aplicar para ejecutar.");
  await cliente.end();
  process.exit(0);
}

try {
  await cliente.query("begin");
  for (const { tabla, columna } of columnas) {
    const { rowCount } = await cliente.query(
      `update ${tabla} set ${columna} = $1 where ${columna} = $2`,
      [destino.id, origen.id],
    );
    if (rowCount > 0) console.log(`  ${tabla}.${columna}: ${rowCount} fila(s) movida(s)`);
  }

  // El destino toma el nombre real y queda el rastro del código anterior, para
  // que Central pueda relacionar los papeles viejos que dicen "C8".
  await cliente.query(
    `update perfiles set nombre = coalesce($1, nombre), codigo_anterior = $2, activo = true where id = $3`,
    [NOMBRE, DE, destino.id],
  );
  // El origen queda desactivado y SIN código: así el código vuelve a estar
  // libre para asignárselo a otra persona sin chocar con este perfil.
  await cliente.query(
    `update perfiles set activo = false, codigo_comercial = null where id = $1`,
    [origen.id],
  );
  await cliente.query("commit");
  console.log("\n✓ Fusión aplicada.\n");
} catch (e) {
  await cliente.query("rollback");
  console.error("\n✗ Error — se revirtió todo, la base quedó como estaba:", e.message);
  await cliente.end();
  process.exit(1);
}

const despues = [];
for (const { tabla, columna } of columnas) {
  const [nDe, nA] = [await contar(tabla, columna, origen.id), await contar(tabla, columna, destino.id)];
  if (nDe || nA) despues.push({ "tabla.columna": `${tabla}.${columna}`, [`${DE} (debe ser 0)`]: nDe, [A]: nA });
}
console.log("DESPUÉS:");
console.table(despues);

const { rows: final } = await cliente.query(
  `select codigo_comercial, codigo_anterior, nombre, activo from perfiles where id = any($1) order by activo desc`,
  [[origen.id, destino.id]],
);
console.table(final);
const quedan = despues.reduce((s, f) => s + f[`${DE} (debe ser 0)`], 0);
console.log(quedan === 0 ? `✓ Sin filas huérfanas. El código ${DE} quedó libre.` : `⚠️ Quedan ${quedan} filas en el origen — revisar.`);

await cliente.end();
