// Fusiona las cuentas que tienen exactamente el mismo nombre. Son las que el
// importador no pudo unir porque ninguna traía documento: sin RUC no había con
// qué comparar más que el texto.
//
// ⚠️ EL RIESGO Y CÓMO SE ACOTA. Nombre idéntico NO prueba que sean la misma
// empresa. Tres filtros, en orden de importancia:
//
//   1. NOMBRES COMODÍN FUERA. "SIN NOMBRE" está en 104 cuentas y son 104
//      clientes DISTINTOS a los que Central no les anotó el nombre. Ver
//      lib-fusionar-cuentas.mjs.
//   2. NOMBRES CORTOS O DE UNA SOLA PALABRA FUERA. "ND", "LOGISMINSA" solo
//      pasa si además coincide algo más; dos empresas pueden llamarse igual
//      con un nombre genérico de una palabra.
//   3. Se exige una SEÑAL ADICIONAL de que son la misma: mismo teléfono de
//      contacto, mismo departamento, o que una de las dos no tenga ninguna
//      historia (una ficha vacía duplicada no arrastra nada que perder).
//
// Lo que no pasa los filtros queda listado para revisión humana, no se toca.
//
// Por defecto solo muestra el plan. Para ejecutarlo: --ejecutar
// Uso: node --env-file=.env.local scripts/fusionar-cuentas-mismo-nombre.mjs [--ejecutar]

import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { esComodin, fusionar, historia, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const EJECUTAR = process.argv.includes("--ejecutar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const normalizar = (t) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

const { rows: cuentas } = await bd.query(
  `select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.comercial_id, c.departamento,
          (select string_agg(distinct t.telefono_normalizado, ',') from contactos t
            where t.cuenta_id = c.id and t.telefono_normalizado is not null and t.telefono_normalizado <> '') telefonos
   from cuentas c where c.tipo_doc = 'SIN_DOC'`,
);

const grupos = new Map();
for (const c of cuentas) {
  if (esComodin(c.razon_social)) continue;
  const clave = normalizar(c.razon_social);
  if (clave.length < 12) continue; // demasiado corto para fiarse solo del texto
  if (!grupos.has(clave)) grupos.set(clave, []);
  grupos.get(clave).push(c);
}

const aFusionar = [];
const aRevisar = [];

for (const [clave, filas] of grupos) {
  if (filas.length < 2) continue;
  const conHistoria = [];
  for (const f of filas) conHistoria.push({ ...f, h: await historia(bd, f.id), act: await ultimaActividad(bd, f.id) });

  // Señal adicional: teléfono compartido, mismo departamento, o alguna copia
  // completamente vacía.
  const telefonos = conHistoria.flatMap((f) => (f.telefonos ?? "").split(",").filter(Boolean));
  const compartenTelefono = new Set(telefonos).size < telefonos.length;
  const deptos = new Set(conHistoria.map((f) => f.departamento).filter(Boolean));
  const mismoDepto = deptos.size === 1 && conHistoria.every((f) => f.departamento);
  const algunaVacia = conHistoria.some((f) => f.h.ops + f.h.cots + f.h.leads + f.h.ventas === 0);

  if (!compartenTelefono && !mismoDepto && !algunaVacia) {
    aRevisar.push({ clave, nombres: conHistoria.map((f) => f.razon_social), motivo: "sin señal extra de que sean la misma" });
    continue;
  }

  // Sobrevive la de más historia; a igualdad, la de nombre más largo (suele
  // ser la menos truncada). La cartera va a la de actividad más reciente.
  const orden = [...conHistoria].sort(
    (a, b) =>
      b.h.ventas - a.h.ventas ||
      b.h.cots - a.h.cots ||
      b.h.ops - a.h.ops ||
      b.razon_social.length - a.razon_social.length,
  );
  const [queda, ...seVan] = orden;
  const masReciente = [...conHistoria].sort((a, b) => (b.act > a.act ? 1 : -1))[0];
  aFusionar.push({
    queda,
    seVan,
    carteraId: masReciente.comercial_id ?? queda.comercial_id,
    cambiaCartera: (masReciente.comercial_id ?? queda.comercial_id) !== queda.comercial_id,
    razon: compartenTelefono ? "mismo teléfono" : mismoDepto ? "mismo departamento" : "una copia vacía",
  });
}

console.log(EJECUTAR ? "EJECUTANDO\n" : "PLAN (nada se toca; agregue --ejecutar)\n");
console.log(`Grupos a fusionar: ${aFusionar.length} (${aFusionar.reduce((a, g) => a + g.seVan.length, 0)} fichas se van)`);
console.log(`Grupos para revisar a mano: ${aRevisar.length}`);
console.log(`Cambian de dueño: ${aFusionar.filter((g) => g.cambiaCartera).length}\n`);
for (const g of aFusionar.slice(0, 12)) {
  console.log(`${g.queda.razon_social.slice(0, 46).padEnd(46)} ← ${g.seVan.length} copia(s) · ${g.razon}`);
  console.log(`   queda con ${g.queda.h.cots} cot · ${g.queda.h.ops} op · ${g.queda.h.ventas} ventas`);
}
if (aRevisar.length) {
  console.log("\nPara revisar a mano (primeros 8):");
  for (const r of aRevisar.slice(0, 8)) console.log(`  ${r.nombres.join(" ⁄ ").slice(0, 90)}`);
}

if (!EJECUTAR) {
  writeFileSync("scripts/data/cuentas-a-revisar.json", JSON.stringify(aRevisar, null, 1));
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  let idas = 0;
  for (const g of aFusionar) {
    for (const v of g.seVan) {
      await fusionar(bd, g.queda.id, v.id, { carteraId: g.carteraId });
      idas++;
    }
  }
  await bd.query("commit");
  console.log(`\nFichas fusionadas: ${idas} en ${aFusionar.length} grupos.`);
  writeFileSync(
    "scripts/data/fusiones-por-nombre.json",
    JSON.stringify(
      aFusionar.map((g) => ({
        queda: g.queda.razon_social,
        seVan: g.seVan.map((v) => v.razon_social),
        razon: g.razon,
        cambiaCartera: g.cambiaCartera,
      })),
      null,
      1,
    ),
  );
  writeFileSync("scripts/data/cuentas-a-revisar.json", JSON.stringify(aRevisar, null, 1));
} catch (e) {
  await bd.query("rollback");
  console.error("\nNADA se fusionó — la transacción se revirtió:", e.message);
  process.exitCode = 1;
}
await bd.end();
