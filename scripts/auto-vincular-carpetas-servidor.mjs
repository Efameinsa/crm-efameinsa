// Vincula de un tirón las cuentas cuyo nombre coincide EXACTO (normalizado)
// con una carpeta del servidor — informes y/o fotos. Solo lo seguro: si dos
// carpetas de la misma clase normalizan igual, esa cuenta no se toca y queda
// para el flujo de sugerencias de la ficha. Autorizado por Santos el 31-08:
// «conecta de un tirón las que son seguras».
//
// Ensayo:  node --env-file=.env.local scripts/auto-vincular-carpetas-servidor.mjs
// Aplicar: node --env-file=.env.local scripts/auto-vincular-carpetas-servidor.mjs --aplicar
//
// Reversible: el vínculo es la columna cuentas.carpetas_servidor; este script
// solo escribe en cuentas que la tienen VACÍA (jamás pisa un vínculo hecho a
// mano) y deshacer todo es `update cuentas set carpetas_servidor = null`.
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const norm = (s) => (s ?? "")
  .toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Z0-9Ñ ]+/g, " ")
  .split(/\s+/).filter((p) => p && !["SA", "SAC", "SRL", "EIRL", "SCRL", "S", "A", "C", "E", "I", "R", "L"].includes(p))
  .join(" ");

const { rows: cuentas } = await pg.query(
  `select id, razon_social, nombre_comercial from cuentas where carpetas_servidor is null`,
);
const { rows: carpetas } = await pg.query(`select ruta, nombre, clase from carpetas_servidor`);

// nombre normalizado → { informes: ruta | null(ambigua), fotos: … }
const porNombre = new Map();
for (const f of carpetas) {
  const n = norm(f.nombre);
  if (n.length < 5) continue;
  const e = porNombre.get(n) ?? {};
  e[f.clase] = e[f.clase] === undefined ? f.ruta : null;
  porNombre.set(n, e);
}

const vinculos = [];
for (const c of cuentas) {
  const candidatos = [...new Set([norm(c.razon_social), norm(c.nombre_comercial)])].filter((x) => x.length >= 5);
  let informes = null, fotos = null, ambigua = false;
  for (const n of candidatos) {
    const e = porNombre.get(n);
    if (!e) continue;
    if (e.informes === null || e.fotos === null) ambigua = true;
    informes = informes ?? e.informes ?? null;
    fotos = fotos ?? e.fotos ?? null;
  }
  if (ambigua || (!informes && !fotos)) continue;
  const v = {};
  if (informes) v.informes = informes;
  if (fotos) v.fotos = fotos;
  vinculos.push({ id: c.id, nombre: c.razon_social, v });
}

console.log(`${APLICAR ? "APLICANDO" : "ENSAYO"} · ${vinculos.length} cuentas por vincular`);
console.log(`  con informes: ${vinculos.filter((x) => x.v.informes).length}`);
console.log(`  con fotos:    ${vinculos.filter((x) => x.v.fotos).length}`);
console.log("\nPrimeras 15 como muestra:");
for (const x of vinculos.slice(0, 15)) {
  console.log(` · ${x.nombre}`);
  if (x.v.informes) console.log(`     informes → ${x.v.informes}`);
  if (x.v.fotos) console.log(`     fotos    → ${x.v.fotos}`);
}

if (APLICAR) {
  await pg.query("begin");
  for (const x of vinculos) {
    // Solo si sigue vacía: otra sesión o un clic manual siempre ganan.
    await pg.query(`update cuentas set carpetas_servidor = $1::jsonb where id = $2 and carpetas_servidor is null`, [
      JSON.stringify(x.v),
      x.id,
    ]);
  }
  await pg.query("commit");
  console.log(`\n✓ ${vinculos.length} cuentas vinculadas.`);
} else {
  console.log("\n(ensayo: no se escribió nada — correr con --aplicar)");
}
await pg.end();
