// Extrae el TEXTO de cada ficha/catálogo de V:\ y lo cachea en un JSON.
//
// Por qué hace falta: cruzar por nombre de archivo NO alcanza. Caso real que
// lo destapó (Darwin, 22-08): el archivo
// "LAVGIA13-LavadoraSecadora giant c max 13-10.2 kg OPL A GAS.docx" está
// nombrado con el código LAVGIA13 (la lavadora sola apilable), pero su
// contenido dice "LAVADORA – SECADORA SEMI INDUSTRIAL ... A Gas", que es el
// producto LAVTGIA13 (la torre). El nombre miente; el contenido no.
//
// Herramientas (ya disponibles en el entorno, ver docs del proyecto):
//   .docx → unzip -p ... word/document.xml  (es un zip con XML adentro)
//   .doc  → antiword
//   .pdf  → pdftotext -layout
//
// El resultado se cachea porque extraer 332 archivos tarda minutos y el
// cruce se va a correr muchas veces mientras se afinan las reglas.
//
// Uso: node scripts/extraer-texto-fichas.mjs [salida.json]

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SALIDA = process.argv[2] ?? "scripts/data/texto-fichas-2026-08-22.json";

const RAICES = [
  "V:/LESLY",
  "V:/01. LAVADORAS",
  "V:/02. SECADORAS",
  "V:/05. CALANDRIAS - GMP",
  "V:/06. CALANDRIAS - UNIMAC",
  "V:/PROYECTO ASIGNADO - JEAN PAUL",
];

function listarRecursivo(dir) {
  const out = [];
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return out;
  }
  for (const nombre of entradas) {
    // "anterior"/"historico" = material superado (criterio ya usado en la
    // curación del 17-08). "~$" = archivo temporal de Word, no es una ficha.
    if (/ANTERIOR|HISTORICO/i.test(nombre) || nombre.startsWith("~$")) continue;
    const ruta = join(dir, nombre);
    let st;
    try {
      st = statSync(ruta);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...listarRecursivo(ruta));
    else if (/\.(docx?|pdf)$/i.test(nombre)) out.push(ruta);
  }
  return out;
}

function limpiar(texto) {
  return texto
    .replace(/\s+/g, " ")
    .trim()
    // El cuerpo de estas fichas es siempre el mismo boilerplate de
    // características; lo que identifica al producto está en la cabecera.
    // Se guardan 6000 caracteres: sobra para cabecera + tabla de datos.
    .slice(0, 6000);
}

function extraer(ruta) {
  try {
    if (/\.docx$/i.test(ruta)) {
      const xml = execFileSync("unzip", ["-p", ruta, "word/document.xml"], {
        maxBuffer: 64 * 1024 * 1024,
        encoding: "latin1",
      });
      // Los <w:p> son párrafos: sin un separador explícito las palabras de
      // párrafos contiguos se pegan ("GASLAVADORA").
      const utf8 = Buffer.from(xml, "latin1").toString("utf-8");
      return limpiar(utf8.replace(/<\/w:p>/g, " \n ").replace(/<[^>]*>/g, " "));
    }
    if (/\.doc$/i.test(ruta)) {
      const salida = execFileSync("antiword", [ruta], { maxBuffer: 64 * 1024 * 1024, encoding: "latin1" });
      // antiword emite cp1252; se re-decodifica para no perder acentos/ñ.
      return limpiar(Buffer.from(salida, "latin1").toString("latin1"));
    }
    const salida = execFileSync("pdftotext", ["-layout", ruta, "-"], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf-8",
    });
    return limpiar(salida);
  } catch (e) {
    return { error: String(e.message ?? e).slice(0, 200) };
  }
}

const archivos = RAICES.flatMap(listarRecursivo);
console.log(`Archivos a procesar: ${archivos.length}`);

// Cache incremental: si ya se extrajo y el archivo no cambió, no re-procesa.
const cache = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf-8")) : {};
let nuevos = 0, fallos = 0, cacheados = 0;

for (const [i, ruta] of archivos.entries()) {
  const mtime = statSync(ruta).mtimeMs;
  if (cache[ruta]?.mtime === mtime) {
    cacheados++;
    continue;
  }
  const r = extraer(ruta);
  if (typeof r === "object") {
    cache[ruta] = { mtime, texto: "", error: r.error };
    fallos++;
  } else {
    cache[ruta] = { mtime, texto: r };
    nuevos++;
  }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${archivos.length}...`);
}

writeFileSync(SALIDA, JSON.stringify(cache, null, 1));

const vacios = Object.entries(cache).filter(([, v]) => !v.error && v.texto.length < 50);
console.log(`\nExtraídos ahora: ${nuevos} · ya en caché: ${cacheados} · con error: ${fallos}`);
console.log(`Sin texto útil (<50 chars, probable escaneo sin OCR): ${vacios.length}`);
vacios.slice(0, 20).forEach(([r]) => console.log(`   ${r}`));
console.log(`\nEscrito: ${SALIDA}`);
