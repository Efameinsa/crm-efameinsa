// Fase 1 (dry-run, no escribe nada): cruza el Excel maestro de Lesly
// (V:\LESLY\CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx) contra las
// carpetas de catálogos/especificaciones técnicas que ella misma organizó
// en V:\LESLY\<MARCA> ok\{CATALOGOS,ESPECIFICACIONES TECNICAS}.
//
// Solo lee e imprime un reporte de cobertura — igual patrón que
// extraer-oportunidades-historicas.mjs: primero medir, después decidir.
//
// Uso: node scripts/cruzar-codificacion-equipos.mjs [--json salida.json]

import XLSX from "xlsx";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "V:/LESLY";
const EXCEL = `${RAIZ}/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx`;

// Una marca del Excel puede vivir en una carpeta con otro nombre (Alliance
// Laundry Systems es el fabricante detrás de PRIMUS y UNIMAC).
const CARPETA_POR_MARCA = {
  PRIMUS: "ALLIANCE ok",
  UNIMAC: "ALLIANCE ok",
  LG: "LG ok",
  GMP: "GMP ok",
  SAILSTAR: "SAILSTAR OK",
  ADC: "ADC OK",
};

function listarRecursivo(dir) {
  const out = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) out.push(...listarRecursivo(ruta));
    else out.push(ruta);
  }
  return out;
}

// "CATALOGOS" / "CATALAGO" (typo real en SAILSTAR) vs "ESPECIFICACIONES
// TECNICAS" / "ESPCIFICACIONES TECNICAS" (typo real en ADC) — normalizado
// por prefijo para no depender de la ortografía exacta de cada carpeta.
function tipoDeArchivo(ruta) {
  const partes = ruta.replace(/\\/g, "/").toUpperCase();
  if (partes.includes("/CATAL")) return "catalogo";
  if (partes.includes("/ESP")) return "especificacion";
  return "otro";
}

function normalizar(s) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

// El código va como primer token del nombre del archivo, separado por "-"
// o espacio: "LAV135-LAVADORA RX135-..." → LAV135. "LAV1351 -LAVADORA..."
// (con espacio antes del guion, typo real) también se cubre con trim.
function codigoDeArchivo(rutaArchivo) {
  const base = rutaArchivo.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  const primerToken = base.split(/[-\s]/)[0];
  return normalizar(primerToken);
}

function modeloDesdeEquipo(equipo) {
  // "MOD:RX135", "MOD. RX135", "MOD: UY240" — el separador y el espaciado
  // varían en el Excel real.
  const m = normalizar(equipo).match(/MOD\.?\s*:?\s*([A-Z0-9][A-Z0-9\-.]*)/);
  return m ? m[1] : null;
}

// familia+número de un modelo del Excel: "UCT040" → {familia:"UCT", numero:40}.
function familiaYNumero(modelo) {
  if (!modelo) return null;
  const m = modelo.match(/^([A-Z]+)-?(\d+)/);
  return m ? { familia: m[1], numero: Number(m[2]) } : null;
}

// Los catálogos comerciales agrupan varios modelos por archivo, casi
// siempre como rango: "RX80-RX105-RX135.pdf" o "UY180-280.pdf" (el segundo
// número, sin letras, hereda la familia del anterior). Se arma un rango
// [min,max] por familia detectada en el nombre del archivo.
function rangosDeArchivo(rutaArchivo) {
  // "SAILSTAR GP 50 -70" / "SS_17_23": la letra y el número van separados
  // por espacio/guion bajo en varios nombres reales — se pegan antes de
  // tokenizar para que cuenten como un solo modelo (GP50, SS17).
  const nombre = normalizar(rutaArchivo.split(/[\\/]/).pop()).replace(/([A-Z])[\s_]+(\d)/g, "$1$2");
  const tokens = nombre.match(/[A-Z]+\d+|\d+/g) ?? [];
  const rangos = [];
  let familiaActual = null;
  for (const t of tokens) {
    const m = t.match(/^([A-Z]+)(\d+)$/);
    if (m) {
      familiaActual = m[1];
      const n = Number(m[2]);
      const existente = rangos.find((r) => r.familia === familiaActual);
      if (existente) { existente.min = Math.min(existente.min, n); existente.max = Math.max(existente.max, n); }
      else rangos.push({ familia: familiaActual, min: n, max: n });
    } else if (familiaActual) {
      const n = Number(t);
      const existente = rangos.find((r) => r.familia === familiaActual);
      if (existente) { existente.min = Math.min(existente.min, n); existente.max = Math.max(existente.max, n); }
    }
  }
  return rangos;
}

// El Excel escribe el modelo con una letra de control en el medio que el
// catálogo comercial no repite (UCT040 → catálogo dice "UC..."; ADG-758V →
// catálogo dice "AD..."). Comparar solo el prefijo de 2 letras evita tener
// que mantener una lista de qué letra es "de control" para cada marca —
// dentro de una misma carpeta de marca no hay dos familias que compartan
// las primeras 2 letras (RX/FX/UY/UW/UC/UG/UT/US), así que no genera falsos
// positivos cruzados.
function mismaFamilia(a, b) {
  return a.slice(0, 2) === b.slice(0, 2);
}

function catalogosQueCoinciden(catalogos, modelo) {
  const fn = familiaYNumero(modelo);
  if (!fn) return [];
  return catalogos.filter((c) =>
    rangosDeArchivo(c).some((r) => mismaFamilia(r.familia, fn.familia) && fn.numero >= r.min && fn.numero <= r.max),
  );
}

const wb = XLSX.readFile(EXCEL);
const filas = XLSX.utils.sheet_to_json(wb.Sheets["Hoja1"], { header: 1, defval: "" });
const productos = filas
  .slice(3)
  .filter((f) => f[1] && String(f[1]).trim())
  .map((f) => ({
    codigo: normalizar(f[1]),
    equipo: String(f[2] ?? "").trim(),
    stock: Number(f[3]) || 0,
    marca: normalizar(f[4]),
    ubicacion: String(f[5] ?? "").trim(),
    valorVenta: Number(f[6]) || 0,
  }));

console.log(`Productos en el Excel: ${productos.length}`);

// Cachear listados de archivos por carpeta de marca (evita recorrer disco
// una vez por producto).
const archivosPorCarpeta = {};
for (const carpeta of new Set(Object.values(CARPETA_POR_MARCA))) {
  archivosPorCarpeta[carpeta] = listarRecursivo(join(RAIZ, carpeta));
}

const resultado = [];
for (const p of productos) {
  const carpeta = CARPETA_POR_MARCA[p.marca];
  if (!carpeta) {
    resultado.push({ ...p, error: `Sin carpeta mapeada para la marca "${p.marca}"` });
    continue;
  }
  const archivos = archivosPorCarpeta[carpeta];
  const especificaciones = archivos.filter((a) => tipoDeArchivo(a) === "especificacion");
  const catalogos = archivos.filter((a) => tipoDeArchivo(a) === "catalogo");

  const specExacta = especificaciones.find((a) => codigoDeArchivo(a) === p.codigo);
  const specAprox = !specExacta ? especificaciones.filter((a) => normalizar(a).includes(p.codigo)) : [];

  const modelo = modeloDesdeEquipo(p.equipo);
  // LG trae UN solo catálogo general ("Catalogo_equipos_semiindustriales_LG
  // 2026.pdf") que cubre todos los modelos — no tiene sentido buscar el
  // modelo dentro del nombre del archivo en ese caso.
  const catalogosCoinciden =
    catalogos.length === 1
      ? catalogos
      : modelo
        ? catalogosQueCoinciden(catalogos, modelo)
        : [];

  resultado.push({
    ...p,
    modelo,
    carpeta,
    especificacion: specExacta ?? null,
    especificacionAprox: specExacta ? [] : specAprox,
    catalogos: catalogosCoinciden,
  });
}

const conSpec = resultado.filter((r) => r.especificacion).length;
const conSpecAprox = resultado.filter((r) => !r.especificacion && r.especificacionAprox?.length).length;
const sinSpec = resultado.filter((r) => !r.especificacion && !r.especificacionAprox?.length).length;
const conCatalogo = resultado.filter((r) => r.catalogos?.length > 0).length;
const sinCatalogo = resultado.filter((r) => !r.catalogos || r.catalogos.length === 0).length;
const sinModelo = resultado.filter((r) => !r.modelo).length;

console.log(`\nEspecificación técnica: ${conSpec} exacta · ${conSpecAprox} aproximada (revisar) · ${sinSpec} sin ninguna`);
console.log(`Catálogo (foto/ficha comercial): ${conCatalogo} con al menos 1 · ${sinCatalogo} sin ninguno`);
console.log(`Sin modelo reconocible en la descripción (afecta el cruce de catálogo): ${sinModelo}`);

console.log("\n--- Sin especificación (ni exacta ni aproximada) ---");
resultado.filter((r) => !r.especificacion && !r.especificacionAprox?.length).forEach((r) => console.log(`  ${r.codigo} (${r.marca}) — ${r.equipo.slice(0, 70)}`));

console.log("\n--- Especificación aproximada (revisar coincidencia) ---");
resultado.filter((r) => r.especificacionAprox?.length).forEach((r) => console.log(`  ${r.codigo}: ${r.especificacionAprox.map((a) => a.split(/[\\/]/).pop()).join(" | ")}`));

console.log("\n--- Sin catálogo (foto) ---");
resultado.filter((r) => !r.catalogos || r.catalogos.length === 0).forEach((r) => console.log(`  ${r.codigo} (${r.marca}, modelo=${r.modelo ?? "?"}) — ${r.equipo.slice(0, 70)}`));

const idxJson = process.argv.indexOf("--json");
if (idxJson !== -1) {
  const salida = process.argv[idxJson + 1];
  writeFileSync(salida, JSON.stringify(resultado, null, 2));
  console.log(`\nEscrito: ${salida}`);
}
