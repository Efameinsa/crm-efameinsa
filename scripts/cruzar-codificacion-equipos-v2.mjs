// Fase 1b (dry-run, no escribe nada): amplía cruzar-codificacion-equipos.mjs.
// Ese primer cruce solo miraba V:\LESLY\<MARCA> ok — pero el material real
// vive repartido por TODO V:\: las carpetas numeradas viejas (01-16) Y el
// trabajo paralelo de Jean Paul (V:\PROYECTO ASIGNADO - JEAN PAUL), cuyas
// fichas técnicas están nombradas con el MISMO código del Excel de Lesly
// ("SECU30. SECADORA UT030E-...docx" → código SECU30) — mejor fuente que
// cualquier match difuso. Se ignoran "anterior"/"historico" (material
// superado, mismo criterio de la curación del 17-08) y solo se busca para
// los 92 códigos que YA están en el Excel — no se agregan productos nuevos.
//
// Uso: node scripts/cruzar-codificacion-equipos-v2.mjs [--json salida.json]

import XLSX from "xlsx";
import { readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";

const RAICES = [
  "V:/01. LAVADORAS",
  "V:/02. SECADORAS",
  "V:/05. CALANDRIAS - GMP",
  "V:/06. CALANDRIAS - UNIMAC",
  "V:/PROYECTO ASIGNADO - JEAN PAUL",
  // Se reincluye LESLY: el extractor de modelo de la Fase 1 se rompía con
  // "MOD: GMP 160.30A" (cortaba en el primer espacio → "GMP", perdía el
  // número) y por eso no encontraba catálogos que SÍ estaban ahí. Con el
  // extractor mejorado de este script conviene volver a mirar.
  "V:/LESLY",
];

function normalizar(s) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}
function compacto(s) {
  return normalizar(s).replace(/[^A-Z0-9]/g, "");
}

function listarRecursivo(dir) {
  const out = [];
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return out;
  }
  for (const nombre of entradas) {
    if (/ANTERIOR|HISTORICO/i.test(nombre)) continue; // material superado
    const ruta = join(dir, nombre);
    let st;
    try {
      st = statSync(ruta);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...listarRecursivo(ruta));
    else out.push(ruta);
  }
  return out;
}

// Mismo truco que cruzar-codificacion-equipos.mjs (Lesly separa por "-"),
// más el patrón de Jean Paul ("CODIGO. descripción.docx", separado por
// ". "). El código va SIEMPRE como primer token del nombre del archivo.
function codigoDeArchivo(rutaArchivo) {
  const base = rutaArchivo
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, "");
  const primerToken = base.split(/\.\s+|[-\s]/)[0].replace(/\.$/, "");
  return normalizar(primerToken);
}

function modeloDesdeEquipo(equipo) {
  // [^,]* (no solo A-Z0-9-.\s) porque el voltaje trae "/" ("220V/60HZ/3PH")
  // y sin coma después de "MOD:" ese texto forma parte de lo capturado — el
  // corte real se hace después, con esVoltajeOFrecuencia.
  const m = normalizar(equipo).match(/MOD\.?\s*:?\s*([A-Z0-9][^,]*?)(?:,|$)/);
  if (!m) return null;
  // Sin coma después de "MOD:" (pasa en varias filas), la captura sigue de
  // largo y se traga el voltaje/frecuencia ("G120.25 220V/60HZ/3PH"). A
  // diferencia del modelo (que puede tener un segundo token empezando en
  // dígito, ej. "GMP 160.30A"), el voltaje/frecuencia siempre trae "/" o es
  // puro número+V/HZ/PH/N ("220V", "380V", "3PH", "220/60/1PH").
  const esVoltajeOFrecuencia = (t) => t.includes("/") || /^\d+(V|HZ|PH|N)$/.test(t);
  const palabras = m[1].trim().split(/\s+/);
  const corte = palabras.findIndex(esVoltajeOFrecuencia);
  return (corte === -1 ? palabras : palabras.slice(0, corte)).slice(0, 3).join(" ");
}

console.log("Indexando V:\\ (puede tardar)...");
const archivos = RAICES.flatMap(listarRecursivo);
console.log(`Archivos indexados fuera de V:\\LESLY: ${archivos.length}`);
const archivosCompactos = archivos.map((a) => ({ ruta: a, compacto: compacto(a) }));

const wb = XLSX.readFile(EXCEL);
const filas = XLSX.utils.sheet_to_json(wb.Sheets["Hoja1"], { header: 1, defval: "" });
const productos = filas
  .slice(3)
  .filter((f) => f[1] && String(f[1]).trim())
  .map((f) => ({ codigo: normalizar(f[1]), equipo: String(f[2] ?? "").trim(), marca: normalizar(f[4]) }));

const archivoPrevio = readdirSync("scripts/data")
  .filter((f) => /^cruce-codificacion-equipos-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .map((f) => `scripts/data/${f}`)
  .pop();
const previo = JSON.parse(readFileSync(archivoPrevio, "utf-8"));
const previoPorCodigo = new Map(previo.map((p) => [p.codigo, p]));

const resultado = [];
for (const p of productos) {
  const antes = previoPorCodigo.get(p.codigo);
  const teniaSpec = Boolean(antes?.especificacion) || Boolean(antes?.especificacionAprox?.length);
  const teniaCat = Boolean(antes?.catalogos?.length);
  if (teniaSpec && teniaCat) continue; // ya completo en la Fase 1

  // Nivel 1 (alta confianza): prefijo de nombre de archivo == código,
  // igual que Lesly y Jean Paul nombran sus fichas.
  let specExacta = null;
  if (!teniaSpec) {
    specExacta = archivos.find((a) => /\.docx?$/i.test(a) && codigoDeArchivo(a) === p.codigo) ?? null;
  }

  // Nivel 2 (respaldo): el modelo (compacto) aparece en la ruta completa —
  // captura catálogos/brochures compartidos por varios códigos, organizados
  // por carpeta con el nombre del modelo, y sirve también para especificación
  // cuando el nivel 1 no encontró nada.
  const modelo = modeloDesdeEquipo(p.equipo);
  const modeloCompacto = modelo && modelo.length >= 3 ? compacto(modelo) : null;
  // "GMP 160.30A" en el Excel vs "GMP160.30" en el catálogo: la letra de
  // revisión final no siempre se repite en el nombre del archivo comercial.
  const modeloSinSufijo = modeloCompacto?.match(/^(.*\d)[A-Z]$/)?.[1] ?? null;
  // El Excel a veces omite la marca en el modelo ("MOD: G120.25") mientras
  // el catálogo comercial sí la repite ("GMP120.25...pdf") — se prueba
  // también <MARCA><número>, sin la letra suelta que el Excel puso delante.
  const marcaCompacta = compacto(p.marca);
  const modeloConMarca =
    modeloCompacto && !modeloCompacto.startsWith(marcaCompacta)
      ? marcaCompacta + modeloCompacto.replace(/^[A-Z]+/, "")
      : null;
  const candidatos = modeloCompacto
    ? archivosCompactos.filter(
        (a) =>
          a.compacto.includes(modeloCompacto) ||
          (modeloSinSufijo && a.compacto.includes(modeloSinSufijo)) ||
          (modeloConMarca && a.compacto.includes(modeloConMarca)),
      )
    : [];

  const specRespaldo = !teniaSpec && !specExacta
    ? candidatos.filter((c) => /\.docx?$/i.test(c.ruta)).map((c) => c.ruta)
    : [];
  const catCandidatos = !teniaCat
    ? candidatos.filter((c) => /\.pdf$/i.test(c.ruta)).map((c) => c.ruta)
    : [];

  if (specExacta || specRespaldo.length || catCandidatos.length) {
    resultado.push({
      codigo: p.codigo,
      marca: p.marca,
      equipo: p.equipo,
      modelo,
      especificacionExacta: specExacta,
      especificacionRespaldo: specRespaldo,
      catalogoCandidatos: catCandidatos,
    });
  }
}

const conSpecExacta = resultado.filter((r) => r.especificacionExacta).length;
const conSpecRespaldo = resultado.filter((r) => !r.especificacionExacta && r.especificacionRespaldo.length).length;
const conCat = resultado.filter((r) => r.catalogoCandidatos.length).length;

console.log(`\nCódigos con algún hallazgo nuevo: ${resultado.length}`);
console.log(`  especificación EXACTA (alta confianza): ${conSpecExacta}`);
console.log(`  especificación de respaldo (revisar, ${resultado.filter((r) => !r.especificacionExacta).reduce((a, r) => a + r.especificacionRespaldo.length, 0)} candidatos en total): ${conSpecRespaldo}`);
console.log(`  con al menos un candidato de catálogo: ${conCat}`);

console.log("\n--- Especificación EXACTA encontrada (código == prefijo del archivo) ---");
resultado.filter((r) => r.especificacionExacta).forEach((r) => console.log(`  ${r.codigo}: ${r.especificacionExacta}`));

console.log("\n--- Especificación de RESPALDO (revisar cuál corresponde, puede haber varias) ---");
resultado.filter((r) => !r.especificacionExacta && r.especificacionRespaldo.length).forEach((r) => {
  console.log(`  ${r.codigo} (modelo="${r.modelo}"):`);
  r.especificacionRespaldo.forEach((e) => console.log(`     ${e}`));
});

console.log("\n--- Catálogo candidato ---");
resultado.filter((r) => r.catalogoCandidatos.length).forEach((r) => {
  console.log(`  ${r.codigo} (modelo="${r.modelo}"):`);
  r.catalogoCandidatos.forEach((c) => console.log(`     ${c}`));
});

const sinNada = resultado.length === 0 ? [] : productos.filter((p) => {
  const antes = previoPorCodigo.get(p.codigo);
  const teniaSpec = Boolean(antes?.especificacion) || Boolean(antes?.especificacionAprox?.length);
  const teniaCat = Boolean(antes?.catalogos?.length);
  if (teniaSpec && teniaCat) return false;
  return !resultado.find((r) => r.codigo === p.codigo);
});
console.log(`\n--- Códigos que SIGUEN sin nada nuevo tras el barrido completo de V:\\ (${sinNada.length}) ---`);
sinNada.forEach((p) => console.log(`  ${p.codigo} (${p.marca}) — ${p.equipo.slice(0, 70)}`));

const idxJson = process.argv.indexOf("--json");
if (idxJson !== -1) {
  writeFileSync(process.argv[idxJson + 1], JSON.stringify({ resultado, sinNada }, null, 2));
  console.log(`\nEscrito: ${process.argv[idxJson + 1]}`);
}
