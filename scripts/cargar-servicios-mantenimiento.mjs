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
  const x = await z.file("word/document.xml").async("string");
  return x
    .split("</w:p>")
    .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** El Word → { equipo, bloques }: cada sistema como subtítulo numerado y sus tareas como viñetas. */
function leerFicha(ps) {
  const equipo = (ps.find((p) => /^ITEM\s+[IVX]+\s*:/i.test(p)) ?? "").replace(/^ITEM\s+[IVX]+\s*:\s*/i, "").trim();
  const inicio = ps.findIndex((p) => /^DESCRIPCI[OÓ]N$/i.test(p));
  const cuerpo = ps.slice(inicio + 1);
  const bloques = [{ t: "titulo", texto: "TRABAJOS QUE INCLUYE EL SERVICIO" }];
  for (let i = 0; i < cuerpo.length; i++) {
    const p = cuerpo[i];
    if (/^[✓✔]+$/.test(p) || p === "") continue;
    if (/^\d{1,2}$/.test(p) && cuerpo[i + 1]) {
      bloques.push({ t: "subtitulo", texto: `${p}. ${cuerpo[i + 1]}` });
      i++;
      continue;
    }
    // Un sub-sistema dentro de un sistema («Descarga»): viene seguido de su ✓.
    if (/^[✓✔]+$/.test(cuerpo[i + 1] ?? "") && p.length < 40) {
      bloques.push({ t: "subtitulo", texto: p });
      continue;
    }
    bloques.push({ t: "vineta", texto: p });
  }
  return { equipo, bloques };
}

const filas = XLSX.utils
  .sheet_to_json(XLSX.readFile(EXCEL).Sheets["servicio de mantenimiento"], { header: 1, defval: null })
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
