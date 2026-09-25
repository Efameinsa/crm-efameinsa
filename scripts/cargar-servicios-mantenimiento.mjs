/**
 * LOS SERVICIOS DE MANTENIMIENTO PREVENTIVO EN EL CATÁLOGO (25-09).
 *
 * Santos, 25-09 10:30: «estas son las fichas técnicas, pero de servicio de
 * mantenimiento… su cotización va acompañada con la ficha, algo similar que
 * hacen las comerciales: cotizan equipo y les juntan la ficha del equipo».
 * Fuentes: P:\SERVICIO DE MANTENIMEINTO PRECIO Y CODIFICACION.xlsx (código,
 * marca, modelo, precio en USD + IGV) y un .docx por servicio en P:\ con el
 * trabajo del técnico por sistema.
 *
 * Cada Word se empareja con su fila del Excel POR LA DESCRIPCIÓN DEL EQUIPO
 * (la línea «ITEM I: …» del Word contra la descripción del Excel), no solo por
 * el código: los códigos traen tipeos (SERVMA… / SERMA…, UC40 / UCT40) y uno
 * está repetido. El SKU es el código del Excel; si se repite, el del Word.
 *
 * Solo AGREGA productos nuevos (segmento y categoría «servicio», precio base
 * en USD, neto: el PDF suma el IGV). No toca los que ya existen.
 *
 * Uso: node --env-file=.env.local scripts/cargar-servicios-mantenimiento.mjs          (prueba)
 *      APLICAR=1 node --env-file=.env.local scripts/cargar-servicios-mantenimiento.mjs
 */
import fs from "node:fs";
import JSZip from "jszip";
import XLSX from "xlsx";
import { Client } from "pg";
import { parrafosDeXml, leerFichaDeServicio } from "../src/lib/fichas/ficha-servicio.mjs";

const CARPETA = "P:/";
const EXCEL = `${CARPETA}SERVICIO DE MANTENIMEINTO PRECIO Y CODIFICACION.xlsx`;

const norm = (s) => String(s ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const fichas = (s) => new Set(norm(s).split(" ").filter((t) => t.length >= 2));
function parecido(a, b) {
  const A = fichas(a), B = fichas(b);
  let c = 0;
  for (const t of A) if (B.has(t)) c++;
  return c / Math.max(1, Math.min(A.size, B.size));
}

async function parrafos(ruta) {
  const z = await JSZip.loadAsync(fs.readFileSync(ruta));
  return parrafosDeXml(await z.file("word/document.xml").async("string"));
}

// El lector vive en el CRM (lo usa también «Cambiar el Word» del catálogo).
const leerFicha = leerFichaDeServicio;

const filas = XLSX.utils
  .sheet_to_json(XLSX.readFile(EXCEL).Sheets[XLSX.readFile(EXCEL).SheetNames[0]], { header: 1, defval: null })
  .slice(1)
  .filter((r) => r[8])
  .map((r) => ({
    n: r[0],
    descripcion: String(r[1] ?? "").replace(/^[\s:]+/, "").replace(/\s+/g, " ").trim(),
    marca: String(r[5] ?? "").trim(),
    modelo: String(r[6] ?? "").trim(),
    precio: Number(String(r[7] ?? "").replace(/[^0-9.]/g, "")),
    codigo: String(r[8]).trim(),
  }));

const archivos = fs.readdirSync(CARPETA).filter((f) => f.toLowerCase().endsWith(".docx"));
const docs = [];
for (const f of archivos) {
  const ps = await parrafos(CARPETA + f);
  const { equipo, bloques } = leerFicha(ps);
  const codigo = f.split("-")[0].trim();
  const titulo = f.replace(/\.docx$/i, "").slice(codigo.length + 1).trim();
  docs.push({ archivo: f, codigo, titulo, equipo, bloques });
}

// Emparejar en tres pasadas, de lo más seguro a lo menos: (1) código idéntico;
// (2) código con los tipeos conocidos corregidos (SERVMA→SERMA, SERMANT→SERMAT,
// UC40→UCT40); (3) la descripción más parecida, EXIGIENDO que el modelo del
// Excel aparezca en la ficha: una descripción parecida de otro modelo
// (UWT105 por UWT130) no es la misma ficha.
const canonico = (c) => c.toUpperCase().replace(/^SERVMA/, "SERMA").replace(/^SERMANT/, "SERMAT").replace(/^SERMA(?!T)/, "SERMAT").replace(/UC(\d)/, "UCT$1");
const compacto = (x) => norm(x).replace(/ /g, "");
const tieneModelo = (fila, d) => compacto(`${d.equipo} ${d.titulo}`).includes(compacto(fila.modelo).replace(/^G(?=\d)/, "")) ;
const usados = new Set();
const pares = filas.map((fila) => ({ fila, doc: null, como: "" }));
for (const p of pares) {
  const d = docs.find((x) => x.codigo === p.fila.codigo && !usados.has(x.archivo));
  if (d) { p.doc = d; p.como = "código"; usados.add(d.archivo); }
}
for (const p of pares.filter((x) => !x.doc)) {
  const d = docs.find((x) => !usados.has(x.archivo) && canonico(x.codigo) === canonico(p.fila.codigo) && tieneModelo(p.fila, x));
  if (d) { p.doc = d; p.como = "código con tipeo corregido"; usados.add(d.archivo); }
}
for (const p of pares.filter((x) => !x.doc)) {
  const candidatos = docs
    .filter((d) => !usados.has(d.archivo) && tieneModelo(p.fila, d))
    .map((d) => ({ d, s: parecido(p.fila.descripcion, d.equipo) }))
    .sort((a, b) => b.s - a.s);
  if (candidatos[0] && candidatos[0].s >= 0.85 && (candidatos[1]?.s ?? 0) < candidatos[0].s) {
    p.doc = candidatos[0].d; p.como = `descripción y modelo (${Math.round(candidatos[0].s * 100)} %)`; usados.add(candidatos[0].d.archivo);
  }
}

// SKU: el código del Excel; si se repite dentro del Excel, el del Word.
const vistos = new Set();
for (const p of pares) {
  p.sku = vistos.has(p.fila.codigo) && p.doc ? p.doc.codigo : p.fila.codigo;
  vistos.add(p.sku);
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const { rows: existentes } = await pg.query("select sku from productos where sku = any($1)", [pares.map((p) => p.sku)]);
const yaEstan = new Set(existentes.map((r) => r.sku));

for (const p of pares) {
  const f = p.fila;
  console.log(
    `${String(f.n).padStart(2)} ${p.sku.padEnd(16)} ${f.marca.padEnd(9)} ${f.modelo.padEnd(11)} US$ ${String(f.precio).padStart(5)}  ${
      p.doc ? `ficha: ${p.doc.codigo.padEnd(16)} por ${p.como}, ${p.doc.bloques.filter((b) => b.t === "subtitulo").length} sistemas, ${p.doc.bloques.filter((b) => b.t === "vineta").length} tareas` : "SIN FICHA"
    }${yaEstan.has(p.sku) ? "  (YA EXISTE: no se toca)" : ""}`,
  );
}
// LO QUE YA EXISTE, CONTRA EL EXCEL Y LAS FICHAS (25-09 tarde: llegaron las
// 11 fichas que faltaban y el Excel cambió). Se informa todo; ACTUALIZAR=1
// solo completa la ficha de los que no tenían (el precio lo gestiona Lesly).
const { rows: vivos } = await pg.query(
  `select p.id, p.sku, p.marca, p.modelo, p.nombre, p.activo, p.ficha,
     (select pp.precio from precios_producto pp where pp.producto_id = p.id and pp.tier = 'base'
       order by pp.vigente_hasta nulls first limit 1) precio
     from productos p where p.sku = any($1)`,
  [pares.map((p) => p.sku)],
);
const porSku = new Map(vivos.map((v) => [v.sku, v]));
const completar = [];
for (const p of pares) {
  const v = porSku.get(p.sku);
  if (!v) continue;
  const dif = [];
  if (Number(v.precio) !== p.fila.precio) dif.push(`precio CRM ${v.precio} ≠ Excel ${p.fila.precio}`);
  if (v.marca !== p.fila.marca) dif.push(`marca ${v.marca} ≠ ${p.fila.marca}`);
  if ((v.modelo ?? "") !== p.fila.modelo) dif.push(`modelo ${v.modelo} ≠ ${p.fila.modelo}`);
  const sinFicha = !(v.ficha?.bloques?.length);
  if (sinFicha && p.doc) { dif.push(`FICHA NUEVA: ${p.doc.archivo}`); completar.push({ v, p }); }
  if (dif.length) console.log(`  ${p.sku.padEnd(16)} ${dif.join(" · ")}`);
}
const enExcel = new Set(pares.map((p) => p.sku));
const { rows: todos } = await pg.query(`select sku, nombre, activo from productos where categoria = 'servicio' and sku like 'SER%'`);
for (const t of todos) if (!enExcel.has(t.sku)) console.log(`  YA NO ESTÁ EN EL EXCEL: ${t.sku} ${t.nombre}${t.activo ? "" : " (inactivo)"}`);
if (process.env.ACTUALIZAR === "1" && completar.length) {
  await pg.query("begin");
  for (const { v, p } of completar) {
    const ficha = { ...v.ficha, bloques: p.doc.bloques, nombre_ficha: p.doc.archivo, origen: { ...(v.ficha?.origen ?? {}), codigo_word: p.doc.codigo, ficha_completada: "2026-09-25" } };
    const nombreGenerico = /^SERVICIO DE MANTENIMIENTO PREVENTIVO \S+ \S+$/.test(v.nombre);
    await pg.query(`update productos set ficha = $2, nombre = $3, updated_at = now() where id = $1`, [v.id, ficha, nombreGenerico ? p.doc.titulo : v.nombre]);
  }
  await pg.query("commit");
  console.log(`✔ fichas completadas: ${completar.length}`);
}

const sobrantes = docs.filter((d) => !usados.has(d.archivo));
console.log(`\nWord sin fila en el Excel: ${sobrantes.map((d) => d.archivo).join(" | ") || "ninguno"}`);
console.log(`Total: ${pares.length} servicios, ${pares.filter((p) => p.doc).length} con ficha, ${pares.filter((p) => !p.doc).length} sin ficha, ${yaEstan.size} ya existían.`);

if (process.env.APLICAR === "1") {
  await pg.query("begin");
  let n = 0;
  for (const p of pares) {
    if (yaEstan.has(p.sku)) continue;
    const f = p.fila;
    const nombre = p.doc ? p.doc.titulo : `SERVICIO DE MANTENIMIENTO PREVENTIVO ${f.marca} ${f.modelo}`.replace(/\s+/g, " ");
    const ficha = {
      bloques: p.doc ? p.doc.bloques : [],
      descripcion_maestro: f.descripcion,
      nombre_ficha: p.doc ? p.doc.archivo : null,
      encabezado_extra: [{ rotulo: "Servicio", valor: "Mantenimiento preventivo" }],
      origen: { cargado: "2026-09-25", excel: "SERVICIO DE MANTENIMEINTO PRECIO Y CODIFICACION.xlsx", codigo_word: p.doc?.codigo ?? null },
    };
    const { rows } = await pg.query(
      `insert into productos (sku, marca, modelo, nombre, categoria, segmento, ficha, activo)
       values ($1, $2, $3, $4, 'servicio', 'servicio', $5, true) returning id`,
      [p.sku, f.marca, f.modelo, nombre, ficha],
    );
    await pg.query(`insert into precios_producto (producto_id, tier, precio, moneda) values ($1, 'base', $2, 'USD')`, [rows[0].id, f.precio]);
    n++;
  }
  await pg.query("commit");
  console.log(`✔ cargados ${n} servicios`);
}
await pg.end();
