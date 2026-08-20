// Genera COPIAS aligeradas de los presupuestos históricos para poder subirlas
// y abrirlas desde el CRM.
//
// ┌─ REGLA NÚMERO UNO ────────────────────────────────────────────────────┐
// │ Los archivos de S:, T: y O: son los originales de la empresa y NO se   │
// │ tocan. El script los abre en modo lectura, escribe las copias en una   │
// │ carpeta local aparte y se niega a arrancar si la carpeta de salida     │
// │ cae dentro de alguna unidad de origen.                                 │
// └────────────────────────────────────────────────────────────────────────┘
//
// Por qué hace falta: son 5.497 PDF que pesan 2,26 GB (412 KB de promedio) y
// dos tercios de ese peso son fotos guardadas a resolución de imprenta. Para
// verlas en pantalla sobra con la mitad.
//
// Dos motores:
//  · gs (recomendado) — Ghostscript re-muestrea por RESOLUCIÓN REAL, así que
//    una lámina a página completa conserva nitidez y una foto chica se recorta
//    de verdad. Es la diferencia que importa: varias cotizaciones llevan
//    fichas comerciales con el texto dentro de la imagen.
//  · node (respaldo) — pdf-lib + canvas, sin instalar nada, pero recorta por
//    ancho en píxeles y no sabe a qué tamaño se imprime cada imagen.
//
// Cada copia se verifica antes de darla por buena: tiene que abrir y tener las
// mismas páginas que el original. Si algo no cuadra, o si la copia no resulta
// más liviana, se copia el ORIGINAL tal cual — nunca se pierde una cotización
// por ahorrar unos kilobytes.
//
// Uso:
//   node scripts/comprimir-cotizaciones.mjs [--salida RUTA] [--motor gs|node]
//        [--dpi 150] [--ancho 1000] [--calidad 0.6] [--limite 20] [--rehacer]

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, copyFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

const arg = (n, x = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : x;
};

// Las mismas raíces que usa scripts/parsear-cotizaciones.mjs.
const ORIGENES = [
  { ruta: "T:/", serie: "EFAMEINSA" },
  { ruta: "S:/", serie: "OPEN" },
  { ruta: "O:/PRESUPUESTOS EFAMEINSA", serie: "EFAMEINSA" },
  { ruta: "O:/PRESUPUESTO OPEN", serie: "OPEN" },
];

const SALIDA = resolve(arg("salida", "C:/Users/diseno/cotizaciones-comprimidas"));
const DPI = Number(arg("dpi", 150));
const CALIDAD = Number(arg("calidad", 0.6));
// 1000 px es un techo prudente: una lámina comercial a página completa queda
// en unos 150 ppp, que es donde el texto metido dentro de la imagen todavía
// se lee. A 700 px se pone borroso (comprobado contra el original).
const ANCHO = Number(arg("ancho", 1000));
const LIMITE = arg("limite") ? Number(arg("limite")) : Infinity;
const REHACER = process.argv.includes("--rehacer");
const CONCURRENCIA = 4;

// --- Salvaguarda: la salida jamás puede caer sobre los originales ---
for (const o of ORIGENES) {
  const raiz = resolve(o.ruta);
  if (SALIDA === raiz || SALIDA.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep)) {
    console.error(`NO. La carpeta de salida (${SALIDA}) está dentro de ${raiz}, que es origen.`);
    process.exit(1);
  }
}
if (/^[STO]:/i.test(SALIDA)) {
  console.error(`NO. La carpeta de salida (${SALIDA}) está en una unidad de originales.`);
  process.exit(1);
}

const GS = ["C:/Users/diseno/AppData/Local/Programs/gs/bin/gswin64c.exe", "C:/Program Files/gs/gs10.07.1/bin/gswin64c.exe"]
  .find((r) => existsSync(r));
const MOTOR = arg("motor", GS ? "gs" : "node");
if (MOTOR === "gs" && !GS) {
  console.error("No encontré gswin64c.exe. Instale Ghostscript o use --motor node.");
  process.exit(1);
}

const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/** Año a partir del nombre (Presu_1001-26 → 2026); si no se puede, "sin-anio". */
function anioDe(nombre) {
  const m = nombre.match(/-(\d{2})\s*[,.]/) ?? nombre.match(/-(\d{2})$/);
  return m ? `20${m[1]}` : "sin-anio";
}

function listarPdfs(raiz) {
  const salida = [];
  const recorrer = (dir) => {
    let entradas;
    try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const r = join(dir, e.name);
      if (e.isDirectory()) recorrer(r);
      else if (/\.pdf$/i.test(e.name)) salida.push(r);
    }
  };
  recorrer(raiz);
  return salida;
}

function correrGs(entrada, salida) {
  return new Promise((ok) => {
    const p = spawn(GS, [
      "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", "-dNOPAUSE", "-dBATCH", "-dQUIET", "-dSAFER",
      "-dDetectDuplicateImages=true", "-dCompressFonts=true", "-dSubsetFonts=true",
      "-dColorImageDownsampleType=/Bicubic", `-dColorImageResolution=${DPI}`, "-dDownsampleColorImages=true",
      "-dGrayImageDownsampleType=/Bicubic", `-dGrayImageResolution=${DPI}`, "-dDownsampleGrayImages=true",
      "-dMonoImageDownsampleType=/Subsample", `-dMonoImageResolution=${DPI * 2}`, "-dDownsampleMonoImages=true",
      "-dAutoFilterColorImages=false", "-sColorImageFilter=DCTEncode",
      `-sOutputFile=${salida}`, entrada,
    ], { windowsHide: true });
    p.on("error", () => ok(false));
    p.on("close", (c) => ok(c === 0));
  });
}

// La copia se verifica con un lector de PDF de verdad (pdf-lib): si abre y
// tiene las mismas páginas que el original, es buena. Contar con expresiones
// regulares no sirve — el PDF nuevo guarda los objetos comprimidos y el
// contador ingenuo devuelve cero, que es lo mismo que devolvería un archivo
// roto. Confundir esas dos cosas es justo lo que no puede pasar aquí.
let PDFDocument = null;
async function paginas(ruta) {
  if (!PDFDocument) ({ PDFDocument } = await import("pdf-lib"));
  try {
    const doc = await PDFDocument.load(readFileSync(ruta), { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

const manifiestoRuta = join(SALIDA, "manifiesto.json");
const manifiesto = existsSync(manifiestoRuta) && !REHACER ? JSON.parse(readFileSync(manifiestoRuta, "utf8")) : {};

const tareas = [];
for (const o of ORIGENES) {
  if (!existsSync(o.ruta)) { console.error(`· Origen no accesible, se omite: ${o.ruta}`); continue; }
  for (const ruta of listarPdfs(o.ruta)) tareas.push({ ruta, serie: o.serie });
}
console.log(`${tareas.length} PDF encontrados · motor ${MOTOR}${MOTOR === "gs" ? ` (${DPI} dpi)` : ` (${ANCHO} px, calidad ${CALIDAD})`}`);
console.log(`Salida: ${SALIDA}\nLos originales se abren solo para lectura.\n`);

let hechos = 0, copiados = 0, saltados = 0, fallidos = 0, antes = 0, despues = 0;
let comprimirNode = null;

async function procesar(t) {
  const nombre = basename(t.ruta);
  const clave = `${t.serie}/${anioDe(nombre)}/${slug(nombre.replace(/\.pdf$/i, ""))}-${createHash("sha1").update(t.ruta).digest("hex").slice(0, 6)}.pdf`;
  const destino = join(SALIDA, clave);
  const info = statSync(t.ruta);

  if (!REHACER && manifiesto[clave] && manifiesto[clave].origenBytes === info.size && existsSync(destino)) {
    saltados++; antes += info.size; despues += statSync(destino).size; return;
  }
  mkdirSync(dirname(destino), { recursive: true });

  let ok = false;
  if (MOTOR === "gs") ok = await correrGs(t.ruta, destino);
  else {
    if (!comprimirNode) ({ comprimir: comprimirNode } = await import("./lib-comprimir-pdf.mjs"));
    try { await comprimirNode(t.ruta, destino, { calidad: CALIDAD, anchoMax: ANCHO }); ok = true; } catch { ok = false; }
  }

  // Verificación: la copia tiene que abrir, pesar menos y tener las mismas
  // páginas. Si falla cualquiera de las tres, se guarda el original tal cual.
  let valida = false;
  if (ok && existsSync(destino)) {
    try {
      const pOrig = await paginas(t.ruta), pNuevo = await paginas(destino);
      valida = pNuevo > 0 && pNuevo === pOrig && statSync(destino).size < info.size;
      if (!valida && pNuevo !== pOrig) console.log(`  ⚠ páginas ${pOrig}→${pNuevo}: se guarda el original — ${nombre.slice(0, 50)}`);
    } catch { valida = false; }
  }
  if (!valida) {
    copyFileSync(t.ruta, destino);
    if (!ok) fallidos++; else copiados++;
  } else hechos++;

  manifiesto[clave] = {
    origen: t.ruta, serie: t.serie, archivo: nombre.replace(/\.pdf$/i, ""),
    origenBytes: info.size, bytes: statSync(destino).size, comprimido: valida,
  };
  antes += info.size; despues += statSync(destino).size;
}

const cola = tareas.slice(0, LIMITE);
let i = 0;
const t0 = Date.now();
await Promise.all(
  Array.from({ length: CONCURRENCIA }, async () => {
    while (i < cola.length) {
      const mio = cola[i++];
      await procesar(mio);
      const n = hechos + copiados + saltados + fallidos;
      if (n % 200 === 0) console.log(`  ${n}/${cola.length} · ${(despues / 1048576).toFixed(0)} MB acumulados`);
    }
  }),
);

writeFileSync(manifiestoRuta, JSON.stringify(manifiesto, null, 1));
console.log(
  `\nComprimidos ${hechos} · copiados sin comprimir ${copiados} · ya estaban ${saltados} · fallaron ${fallidos}\n` +
    `${(antes / 1048576).toFixed(0)} MB → ${(despues / 1048576).toFixed(0)} MB (${((despues / antes) * 100).toFixed(0)} %) ` +
    `en ${((Date.now() - t0) / 60000).toFixed(1)} min\nManifiesto: ${manifiestoRuta}`,
);
