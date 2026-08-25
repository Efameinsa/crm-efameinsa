// Devuelve a las fichas las líneas que el extractor había descartado por error.
//
// QUÉ PASÓ. En scripts/extraer-ficha-tecnica.mjs, el filtro que quita los
// rótulos de la tabla de cabecera empezaba así:
//
//     /^(marca|modelo|capacidad|panel|controles|...)/i
//
// y ese "panel" se llevaba por delante, además de los rótulos, el SUBTÍTULO de
// sección «PANELES» / «PANEL FRONTAL» y viñetas legítimas que empiezan con esa
// palabra («Panel superior e inferior en acero estructural…»). Resultado: 24
// fichas de secadora salían al cliente sin una de sus cuatro secciones.
// Detectado el 25-08 comparando el PDF de la SECA758 contra su Word original.
//
// POR QUÉ UN SCRIPT APARTE Y NO VOLVER A CORRER LA EXTRACCIÓN COMPLETA. Desde
// que se extrajeron las fichas se corrigieron a mano el voltaje de 27 equipos,
// la foto de 9, el segmento de la TITAN LIGHT y la ficha de las torres. Volver
// a correr el pipeline pisaría todo eso. Este script toca ÚNICAMENTE
// `ficha.caracteristicas`, y solo si el cambio es una ADICIÓN pura: si el
// re-parseo quitara alguna línea que hoy está guardada, no aplica nada y lo
// reporta, porque eso significaría que la ficha se editó después.
//
// Uso:
//   node --env-file=.env.local scripts/reparar-subtitulos-fichas.mjs            (solo informa)
//   node --env-file=.env.local scripts/reparar-subtitulos-fichas.mjs --aplicar

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const BARRA_INVERTIDA = String.fromCharCode(92);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// — Copiado tal cual de extraer-ficha-tecnica.mjs, con el filtro ya corregido —

function textoConParrafos(docx) {
  try {
    const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: "latin1",
    });
    return Buffer.from(xml, "latin1")
      .toString("utf-8")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, " ")
      .replace(/<[^>]*>/g, "")
      .split("\n")
      .map((l) => l.replace(/[ \t ]+/g, " ").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// VERBATIM de extraer-ficha-tecnica.mjs. Tienen que ser idénticas: al copiarlas
// "mejorándolas" —cambiar \b por $— «DIMENSIONES GENERALES» dejó de cortar la
// sección y las medidas de la SECA758 se colaron dentro de las características,
// duplicando lo que ya vive en ficha.medidas. Acá se repara un filtro, nada más.
const SECCIONES = [
  { clave: "dimensiones", re: /^DIMENSIONES\s+DE\s+LA\s+M[AÁ]QUINA/i },
  { clave: "dimensiones", re: /^ESPECIFICACIONES?\s+T[EÉ]CNICAS?/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  { clave: "medidas", re: /^DIMENSIONES\b/i },
  { clave: "caracteristicas", re: /^DISE[NÑ]O DE CONSTRUCCI[OÓ]N/i },
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: "caracteristicas", re: /^AUTOMATIZACI[OÓ]N|^PROGRAMADOR\b/i },
  { clave: "caracteristicas", re: /^MONITOREO Y CONTROL|^SEGURIDAD Y ALARMAS/i },
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];

function caracteristicasDe(ruta) {
  const lineas = textoConParrafos(ruta);
  if (lineas.length === 0) return null;
  const out = [];
  let dentro = false;
  for (const linea of lineas) {
    const sec = SECCIONES.find((s) => s.re.test(linea));
    if (sec !== undefined) {
      dentro = sec.clave === "caracteristicas";
      continue;
    }
    if (!dentro) continue;
    if (linea.length < 6 || linea.length > 320) continue;
    const esRotuloDeTabla =
      /^(marca|modelo|capacidad|panel|controles|autom[aá]tico|item\b)/i.test(linea) &&
      linea !== linea.toUpperCase() &&
      linea.length <= 60;
    if (esRotuloDeTabla) continue;
    out.push(linea);
  }
  return [...new Set(out)];
}

// — Comparación —

const { data: productos, error } = await db
  .from("productos")
  .select("id, sku, nombre, ficha")
  .eq("activo", true)
  .order("sku");
if (error) throw new Error(error.message);

const arreglar = [];
const conflicto = [];
let sinCambio = 0;
let sinFicha = 0;

for (const p of productos) {
  const ruta = p.ficha?.origen?.ficha_tecnica;
  if (!ruta) {
    sinFicha++;
    continue;
  }
  const win = ruta.split(BARRA_INVERTIDA).join("/");
  if (!existsSync(win)) {
    sinFicha++;
    continue;
  }
  const nuevas = caracteristicasDe(win);
  if (!nuevas || nuevas.length === 0) {
    sinFicha++;
    continue;
  }
  const guardadas = Array.isArray(p.ficha.caracteristicas) ? p.ficha.caracteristicas : [];
  const perdidas = guardadas.filter((c) => !nuevas.includes(c));
  const recuperadas = nuevas.filter((c) => !guardadas.includes(c));
  if (recuperadas.length === 0 && perdidas.length === 0) {
    sinCambio++;
    continue;
  }
  // Si el re-parseo QUITA algo que hoy está guardado, la ficha se editó a mano
  // después de extraerla: no se toca, se avisa.
  if (perdidas.length > 0) conflicto.push({ p, recuperadas, perdidas });
  else arreglar.push({ p, nuevas, recuperadas });
}

console.log(`\nCatálogo: ${productos.length} equipos activos`);
console.log(`  sin ficha .docx localizable : ${sinFicha}`);
console.log(`  ya estaban bien             : ${sinCambio}`);
console.log(`  a reparar                   : ${arreglar.length}`);
console.log(`  con conflicto (no se tocan) : ${conflicto.length}\n`);

for (const { p, recuperadas } of arreglar) {
  console.log(`${p.sku.padEnd(12)} +${recuperadas.length}  ${recuperadas.map((r) => `«${r.slice(0, 60)}»`).join("  ")}`);
}
if (conflicto.length) {
  console.log("\nCON CONFLICTO — el re-parseo quitaría líneas que hoy están guardadas:");
  for (const { p, perdidas, recuperadas } of conflicto) {
    console.log(`${p.sku.padEnd(12)} +${recuperadas.length} / -${perdidas.length}`);
    perdidas.forEach((x) => console.log(`   - ${x.slice(0, 90)}`));
  }
}

if (!APLICAR) {
  console.log(`\nNada se ha modificado. Para reparar los ${arreglar.length}:`);
  console.log("  node --env-file=.env.local scripts/reparar-subtitulos-fichas.mjs --aplicar\n");
  process.exit(0);
}

let hechos = 0;
for (const { p, nuevas } of arreglar) {
  const ficha = { ...p.ficha, caracteristicas: nuevas };
  const { error: e } = await db.from("productos").update({ ficha }).eq("id", p.id);
  if (e) console.error(`  ✗ ${p.sku}: ${e.message}`);
  else hechos++;
}
console.log(`\n✓ ${hechos} fichas reparadas.\n`);
