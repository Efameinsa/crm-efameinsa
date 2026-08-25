// ============================================================
// CRM EFAMEINSA · La foto de cada equipo es del equipo, no del membrete
// ============================================================
// Reportado el 25-08: «CALE253 existe ficha pero no jala imagen». Jalaba, pero
// la equivocada: el cargador elegía LA IMAGEN MÁS GRANDE del .docx y en varias
// fichas la más pesada es el MEMBRETE escaneado de la papelería (96 KB), no la
// foto del equipo. El cliente veía una hoja con logo en lugar de la máquina.
//
// CÓMO SE DISTINGUE, medido y no adivinado. Se hashearon las imágenes de las
// 95 fichas: el membrete aparece en 72, los logos de plantilla en 8-12, y las
// fotos de producto en 1 a 6 (las familias comparten la foto real de fábrica,
// y eso es legítimo — la primera versión de este script las vetaba y dejaba
// sin foto a la familia UT075 entera). El corte va en 8: papelería es lo que
// aparece en 8 fichas o más.
//
// Y SOLO SE TOCA lo que está mal: los productos cuya foto SERVIDA es papelería.
// Las fotos curadas de antes (recortes de pantallazos, prestadas a propósito)
// no viven dentro de las fichas, así que no cruzan este umbral ni se tocan.
//
// El script compara la foto elegida con la que está sirviendo public/productos
// y solo reescribe las distintas. Si a una ficha no le sobrevive ninguna
// imagen, el equipo queda SIN foto (mejor sin foto que con el membrete).
//
// Uso: node --env-file=.env.local scripts/auditar-fotos-cargadas.mjs [--aplicar]

import { Client } from "pg";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CONVERTIDAS = "scripts/data/fichas-convertidas";
const DESTINO = "public/productos";
const PANTALLAS = new Set(["1440x900","1920x1080","1366x768","1536x864","1600x900","2560x1440","1280x720","1280x800","1680x1050","3840x2160"]);

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// Los equipos cuya foto salió del cargador de hoy (los 30 del maestro + los 2
// UT055), identificados por su ficha declarada.
const { rows: productos } = await bd.query(
  `select id, sku, foto_path, ficha->'origen'->>'ficha_tecnica' ft
     from productos
    where activo and sku is not null and ficha->'origen'->>'ficha_tecnica' is not null
    order by sku`,
);

/** El .docx legible para una ficha declarada (convertido si era .doc). */
function docxDe(ft) {
  const win = ft.split("\\").join("/");
  if (/\.docx$/i.test(win)) return existsSync(win) ? win : null;
  const conv = join(CONVERTIDAS, basename(win).replace(/\.doc$/i, ".docx"));
  return existsSync(conv) ? conv : null;
}

function imagenesDe(docx) {
  let lista;
  try { lista = execFileSync("unzip", ["-Z1", docx], { encoding: "utf-8" }).split("\n"); } catch { return []; }
  const out = [];
  for (const l of lista) {
    const interno = l.trim();
    if (!/^word\/media\/.*\.(png|jpe?g)$/i.test(interno)) continue;
    let buf;
    try { buf = execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64e6 }); } catch { continue; }
    out.push({ interno, buf, hash: createHash("sha1").update(buf).digest("hex") });
  }
  return out;
}

// ── Pasada 1: qué hash aparece en cuántas fichas distintas ──────────────────
const fichas = new Map(); // sku → imágenes
const enCuantas = new Map(); // hash → set de skus
for (const p of productos) {
  const docx = docxDe(p.ft);
  if (!docx) continue;
  const imgs = imagenesDe(docx);
  fichas.set(p.sku, { p, imgs });
  for (const i of imgs) {
    if (!enCuantas.has(i.hash)) enCuantas.set(i.hash, new Set());
    enCuantas.get(i.hash).add(p.sku);
  }
}
// El corte en 8 sale del histograma medido: membrete en 72 fichas, logos de
// plantilla en 8-12, fotos de producto (familias incluidas) en 1 a 6.
const compartidas = new Set([...enCuantas.entries()].filter(([, s]) => s.size >= 8).map(([h]) => h));
console.log(`fichas leídas: ${fichas.size} · imágenes de papelería (en ≥8 fichas): ${compartidas.size}\n`);

// ── Pasada 2: elegir la foto correcta y comparar con la servida ─────────────
function esPantallazo(buf) {
  if (buf.slice(1, 4).toString() !== "PNG") return false;
  return PANTALLAS.has(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
}
const cambios = [];
for (const [sku, { p, imgs }] of fichas) {
  const candidatas = imgs.filter((i) => !compartidas.has(i.hash) && i.buf.length >= 3000 && !esPantallazo(i.buf));
  const mejor = candidatas.sort((a, b) => b.buf.length - a.buf.length)[0] ?? null;

  const actual = p.foto_path ? join(DESTINO, basename(p.foto_path)) : null;
  const hashActual = actual && existsSync(actual)
    ? createHash("sha1").update(readFileSync(actual)).digest("hex")
    : null;

  const eraPapeleria = hashActual !== null && compartidas.has(hashActual);
  // Solo dos casos se corrigen: la foto servida es papelería, o el producto no
  // tiene foto y su ficha sí trae una de producto. Todo lo demás se respeta —
  // hay fotos curadas a mano que no salieron de la ficha, y están bien así.
  if (!eraPapeleria && !(p.foto_path === null && mejor)) continue;
  if (mejor && hashActual === mejor.hash) continue;
  cambios.push({ p, mejor, eraPapeleria });
  console.log(
    `  ${sku.padEnd(11)} ${eraPapeleria ? "⚠ servía el MEMBRETE" : p.foto_path ? "foto distinta a la de su ficha" : "sin foto y la ficha sí trae"}` +
    ` → ${mejor ? `${mejor.interno} (${Math.round(mejor.buf.length / 1024)} KB)` : "SIN FOTO (solo papelería en la ficha)"}`,
  );
}

if (!APLICAR) {
  console.log(`\n${cambios.length} foto(s) por corregir. Nada se ha modificado — agregá --aplicar.\n`);
  await bd.end();
  process.exit(0);
}

for (const { p, mejor } of cambios) {
  if (p.foto_path) {
    const viejo = join(DESTINO, basename(p.foto_path));
    if (existsSync(viejo)) unlinkSync(viejo);
  }
  if (mejor) {
    const ext = mejor.interno.match(/\.(png|jpe?g)$/i)[1].toLowerCase().replace("jpeg", "jpg");
    const nombre = `${p.sku.toLowerCase()}.${ext}`;
    writeFileSync(join(DESTINO, nombre), mejor.buf);
    await bd.query(`update productos set foto_path = $2, updated_at = now() where id = $1`, [p.id, `/productos/${nombre}`]);
    console.log(`  ✓ ${p.sku} → /productos/${nombre}`);
  } else {
    await bd.query(`update productos set foto_path = null, updated_at = now() where id = $1`, [p.id]);
    console.log(`  ✓ ${p.sku} → sin foto (era solo papelería)`);
  }
}
console.log(`\n✓ ${cambios.length} corregida(s).`);
await bd.end();
