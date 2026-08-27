// ============================================================
// CRM EFAMEINSA · Paso 1 · La lista de productos que manda
// ============================================================
// Orden de Darwin (27-08, tarde): «en el sistema solo estarán los productos
// que figuran en dicho Excel, todo lo demás será retirado». El Excel es
// `V:\Fichas tecnicas por codigo.xlsx`, que salió de
// `scripts/buscar-fichas-por-codigo.mjs` esa misma mañana.
//
// De dónde sale cada producto:
//   · hoja ENCONTRADOS       — todos, con su ruta al Word en «RUTA COMPLETA».
//   · hoja NO ENCONTRADOS    — solo los que Lesly pintó de AMARILLO: los
//     encontró después y dejó la ruta escrita en la columna «QUE PASA». Los
//     ROJOS todavía no aparecen y se listan aparte, sin ficha.
//
// El amarillo hay que leerlo del relleno de la celda (FFFF00) porque el color
// es el único dato que dice cuáles ya están; el texto de las dos filas es
// idéntico. Es la misma convención del maestro de Lesly (ver
// `cargar-resaltados-maestro3.mjs`).
//
// La ruta que dejó escrita a mano viene SIN extensión —y a veces con el
// nombre del archivo apenas distinto—, así que se resuelve contra el disco:
// se prueba .docx y .doc, y si no, se busca en la carpeta por prefijo.
//
// No toca la base ni el catálogo: solo escribe scripts/data/fichas-v/lista.json.
//
// Uso: node scripts/fichas-v-01-lista.mjs

import XLSX from "xlsx";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join, dirname, basename } from "node:path";

const EXCEL = "V:/Fichas tecnicas por codigo.xlsx";
const SALIDA = "scripts/data/fichas-v/lista.json";

/** Descomprime el xlsx a mano: hace falta el relleno de cada celda y las
 *  librerías de estilos de SheetJS no vienen en la edición libre. */
function leerZip(ruta) {
  const b = readFileSync(ruta);
  const archivos = new Map();
  let i = 0;
  while ((i = b.indexOf(Buffer.from("PK\x03\x04"), i)) !== -1) {
    const metodo = b.readUInt16LE(i + 8);
    const comprimido = b.readUInt32LE(i + 18);
    const nLargo = b.readUInt16LE(i + 26);
    const eLargo = b.readUInt16LE(i + 28);
    const nombre = b.toString("utf8", i + 30, i + 30 + nLargo);
    const inicio = i + 30 + nLargo + eLargo;
    if (comprimido > 0) {
      const datos = b.subarray(inicio, inicio + comprimido);
      try {
        archivos.set(nombre, metodo === 8 ? inflateRawSync(datos) : datos);
      } catch {
        /* entrada ilegible: no es ninguna de las que se usan acá */
      }
    }
    i = inicio + comprimido;
  }
  return archivos;
}

/** Color de relleno de cada celda de una hoja, por referencia ("A7"). */
function coloresDeHoja(zip, archivoHoja) {
  const estilos = zip.get("xl/styles.xml").toString("utf8");
  const fills = [...estilos.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map(
    (m) => (m[1].match(/<fgColor rgb="([0-9A-Fa-f]{8})"/) ?? [])[1] ?? null,
  );
  const cellXfs = estilos.slice(estilos.indexOf("<cellXfs"), estilos.indexOf("</cellXfs>"));
  const xfs = [...cellXfs.matchAll(/<xf [^>]*?\/?>/g)].map((m) => Number((m[0].match(/fillId="(\d+)"/) ?? [])[1] ?? 0));
  const hoja = zip.get(archivoHoja).toString("utf8");
  const colores = new Map();
  for (const m of hoja.matchAll(/<c r="([A-Z]+\d+)"[^>]*s="(\d+)"/g)) {
    const relleno = fills[xfs[Number(m[2])]];
    if (relleno) colores.set(m[1], relleno);
  }
  return colores;
}

/**
 * Resuelve la ruta escrita a mano contra el disco.
 *
 * Lesly escribe la ruta sin extensión y con el nombre a veces cambiado (un
 * punto de más, una tilde). Se prueba, en orden: la ruta tal cual, con .docx,
 * con .doc, y por último el archivo de la carpeta cuyo nombre empiece por el
 * código. Si nada existe, se devuelve null y el producto queda sin ficha.
 */
function resolverArchivo(rutaEscrita, codigo) {
  if (!rutaEscrita) return null;
  const ruta = rutaEscrita.trim().replace(/\\/g, "/");
  for (const candidato of [ruta, `${ruta}.docx`, `${ruta}.doc`]) {
    try {
      if (existsSync(candidato) && statSync(candidato).isFile()) return candidato;
    } catch {
      /* ruta inválida */
    }
  }
  const carpeta = dirname(ruta);
  if (!existsSync(carpeta)) return null;
  const buscado = basename(ruta).toLowerCase();
  const enCarpeta = readdirSync(carpeta).filter((f) => /\.docx?$/i.test(f));
  // 1) el mismo nombre con otra extensión o con basura al final
  const porNombre = enCarpeta.find((f) => f.toLowerCase().startsWith(buscado.slice(0, 25)));
  if (porNombre) return join(carpeta, porNombre).replace(/\\/g, "/");
  // 2) por código, con frontera: CALE25 no puede comerse a CALE251
  const porCodigo = enCarpeta.find((f) => new RegExp(`(^|[^A-Za-z0-9])${codigo}([^A-Za-z0-9]|$)`, "i").test(f));
  return porCodigo ? join(carpeta, porCodigo).replace(/\\/g, "/") : null;
}

const libro = XLSX.readFile(EXCEL);
const zip = leerZip(EXCEL);

const limpio = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const numero = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

const productos = [];
const sinFicha = [];

// ---------- ENCONTRADOS ----------
const encontrados = XLSX.utils.sheet_to_json(libro.Sheets["ENCONTRADOS"], { header: 1, blankrows: false, defval: "" });
for (const f of encontrados.slice(1)) {
  const codigo = limpio(f[0]);
  if (!codigo) continue;
  const archivo = resolverArchivo(limpio(f[11]), codigo);
  const fila = {
    codigo,
    equipo: limpio(f[1]),
    marca: limpio(f[2]),
    stock: numero(f[3]),
    ubicacion: limpio(f[4]) || null,
    precio: numero(f[5]),
    hoja: "ENCONTRADOS",
    rutaExcel: limpio(f[11]),
    archivo,
    tipo: archivo ? (archivo.toLowerCase().endsWith(".docx") ? "DOCX" : "DOC") : null,
    otrosArchivos: limpio(f[12]) || null,
  };
  (archivo ? productos : sinFicha).push(fila);
}

// ---------- NO ENCONTRADOS (solo los amarillos) ----------
const coloresNoEnc = coloresDeHoja(zip, "xl/worksheets/sheet3.xml");
const noEncontrados = XLSX.utils.sheet_to_json(libro.Sheets["NO ENCONTRADOS"], { header: 1, blankrows: false, defval: "" });
noEncontrados.slice(1).forEach((f, i) => {
  const codigo = limpio(f[0]);
  if (!codigo) return;
  const fila = i + 2;
  const relleno = coloresNoEnc.get(`A${fila}`) ?? coloresNoEnc.get(`B${fila}`) ?? "";
  const amarillo = relleno === "FFFFFF00";
  const archivo = amarillo ? resolverArchivo(limpio(f[7]), codigo) : null;
  const datos = {
    codigo,
    equipo: limpio(f[1]),
    marca: limpio(f[2]),
    stock: numero(f[3]),
    ubicacion: limpio(f[4]) || null,
    precio: numero(f[5]),
    hoja: "NO ENCONTRADOS",
    color: amarillo ? "amarillo" : relleno === "FFFF0000" ? "rojo" : relleno || "sin color",
    rutaExcel: limpio(f[7]),
    archivo,
    tipo: archivo ? (archivo.toLowerCase().endsWith(".docx") ? "DOCX" : "DOC") : null,
    quePasa: limpio(f[7]),
  };
  (archivo ? productos : sinFicha).push(datos);
});

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), productos, sinFicha }, null, 2));

const porTipo = productos.reduce((acc, p) => ({ ...acc, [p.tipo]: (acc[p.tipo] ?? 0) + 1 }), {});
console.log(`Productos con ficha resuelta: ${productos.length}  (${JSON.stringify(porTipo)})`);
console.log(`  · de ENCONTRADOS:    ${productos.filter((p) => p.hoja === "ENCONTRADOS").length}`);
console.log(`  · amarillos:         ${productos.filter((p) => p.hoja === "NO ENCONTRADOS").length}`);
console.log(`\nSin ficha (${sinFicha.length}):`);
for (const p of sinFicha) console.log(`  · ${p.codigo.padEnd(12)} ${p.color ?? ""} ${p.equipo.slice(0, 50)}`);
console.log(`\n→ ${SALIDA}`);
