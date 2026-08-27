// ============================================================
// CRM EFAMEINSA · Los coches de transporte de ropa, por color
// ============================================================
// Lesly mantiene V:\LESLY\COCHES\ESPECIFICACIONES con UN WORD POR COLOR, y el
// nombre del archivo lleva el sufijo del color: CO402A (azul), CO402B
// (blanco), CO402G (gris). Este script vuelca esos Word al catálogo del CRM.
//
// SIGUEN SIENDO TRES PRODUCTOS. El maestro de Lesly —única fuente de precios—
// tiene un código por modelo y no por color: CO401 ($899), CO402 ($825) y
// CO408 ($799). Los sufijos A/B/G no existen ahí; darles código propio los
// dejaría sin precio y cotizarlos pediría aprobación de gerencia. Así que el
// color vive en `ficha.colores` y cada uno aporta su foto a
// `ficha.fotos_por_color`. El comercial elige el color en el buscador y desde
// ahí viaja al ítem de la cotización y al PDF (migración 0088).
//
// ── DE DÓNDE SALE LA FOTO ────────────────────────────────────────────────
// De su Word, y del recorte que el Word declara. Es la corrección del 27-08
// por la tarde: la primera carga recortaba «a ojo», por coordenadas puestas a
// mano mirando el pantallazo, y para el HM-408 blanco eso eligió el coche gris
// de la grilla (el rotulado 1100*790*840, que es la medida del HM-408) cuando
// el Word mostraba otro, más blanco. Darwin lo vio en una cotización real.
//
// Los Word no traen fotos sueltas: traen PANTALLAZOS del navegador (Alibaba,
// 1440x900, con barra de tareas) y Word les aplica un recorte —<a:srcRect>, en
// milésimas de %— para mostrar solo el coche. Ese recorte ES la foto que Lesly
// eligió, así que se lee del XML y se aplica tal cual. Nada de coordenadas a
// mano: si ella recorta distinto, este script la sigue.
//
// De cada Word se toma el dibujo MÁS GRANDE de la hoja; los chicos son el
// membrete y algún ícono.
//
// Uso: node scripts/cargar-coches-por-color.mjs [--aplicar]

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const APLICAR = process.argv.includes("--aplicar");
const CARPETA = "V:/LESLY/COCHES/ESPECIFICACIONES";
const DESTINO_FOTOS = "public/productos";
/** Copia local con nombre simple: `unzip` se atraganta con los nombres reales. */
const TEMPORAL = join(process.env.TEMP ?? ".", "coche-en-lectura.docx");

/** Un Word por color. `principal` = la foto que queda como foto del producto. */
const WORDS = [
  { sku: "CO401", color: "Azul",   principal: true,  foto: "co401.png",        archivo: "CO401-COCHE DE TRANSPORTE DE ROPA  HM 401.docx" },
  { sku: "CO402", color: "Azul",   principal: true,  foto: "co402.png",        archivo: "CO402A-COCHE DE TRANSPORTE DE ROPA - HM 402 AZUL.docx" },
  { sku: "CO402", color: "Blanco", principal: false, foto: "co402-blanco.png", archivo: "CO402B-COCHE DE TRANSPORTE DE ROPA - HM 402 BLANCO.docx" },
  { sku: "CO402", color: "Gris",   principal: false, foto: "co402-gris.png",   archivo: "CO402G-COCHE DE TRANSPORTE DE ROPA - HM 402 GRIS.docx" },
  { sku: "CO408", color: "Azul",   principal: true,  foto: "co408.png",        archivo: "CO408A-COCHE DE TRANSPORTE DE ROPA  HM 408 AZUL.docx" },
  { sku: "CO408", color: "Blanco", principal: false, foto: "co408-blanco.png", archivo: "CO408B-COCHE DE TRANSPORTE DE ROPA  HM 408 BLANCO.docx" },
];

/** Colores en los que existe cada coche, según el catálogo Efamein 2026 (la
 *  fuente del fabricante). El HM-402 se fabrica además en Verde, aunque Lesly
 *  todavía no haya hecho su Word: se lista, y se queda sin foto propia. */
const COLORES = {
  CO401: ["Azul"],
  CO402: ["Azul", "Blanco", "Gris", "Verde"],
  CO408: ["Azul", "Blanco"],
};

// ------------------------------------------------------------
// Leer el .docx
// ------------------------------------------------------------

function abrir(archivo) {
  fs.copyFileSync(`${CARPETA}/${archivo}`, TEMPORAL);
  return (interno) => execFileSync("unzip", ["-p", TEMPORAL, interno], { maxBuffer: 64e6 });
}

function lineasDe(leer) {
  return Buffer.from(leer("word/document.xml").toString("latin1"), "latin1")
    .toString("utf-8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean);
}

const SECCIONES = [
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  // Lo comercial queda fuera de la ficha técnica: el precio lo pone el maestro
  // y la garantía/entrega las pone la cotización.
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];

/** Características y medidas del Word, sin tocar la redacción.
 *
 *  El encabezado (Marca/Modelo/Volumen/Stock) queda afuera solo, porque está
 *  antes del primer título. Por eso «Capacidad de Carga : 500 kg» entra: el
 *  cargador del 25-08 la descartaba con una regla que borraba toda línea que
 *  empezara con «capacidad», pensada justo para ese encabezado. */
function fichaDe(leer) {
  const lineas = lineasDe(leer);
  const bloques = { caracteristicas: [], medidas: [] };
  let actual = null;
  for (const linea of lineas) {
    const sec = SECCIONES.find((s) => s.re.test(linea));
    if (sec !== undefined) {
      actual = sec.clave;
      continue;
    }
    if (!actual) continue;
    if (linea.length < 6 || linea.length > 320) continue;
    bloques[actual].push(linea);
  }
  const cab = lineas.slice(0, 12).join(" | ");
  return {
    modelo: cab.match(/HM[-\s]?(\d{3})/i) ? `HM-${cab.match(/HM[-\s]?(\d{3})/i)[1]}` : null,
    volumen: cab.match(/([\d.,]+)\s*Lts/i)?.[1] ?? null,
    caracteristicas: [...new Set(bloques.caracteristicas)],
    medidas: [...new Set(bloques.medidas)],
  };
}

/**
 * La foto que el Word MUESTRA: el dibujo más grande de la hoja, con el recorte
 * que el propio Word le aplica.
 *
 * `<a:srcRect l t r b>` está en milésimas de porcentaje y mide cuánto se corta
 * de cada lado (r=10062 ⇒ se corta el 10,062% por la derecha). Los lados que no
 * se recortan no aparecen: valen 0.
 */
async function fotoDe(leer, destino) {
  const xml = leer("word/document.xml").toString("utf-8");
  const rels = leer("word/_rels/document.xml.rels").toString("utf-8");
  const medios = Object.fromEntries(
    [...rels.matchAll(/Id="([^"]+)"[^>]*Target="media\/([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

  let mayor = null;
  for (const [pic] of xml.matchAll(/<pic:pic[\s\S]*?<\/pic:pic>/g)) {
    const embed = pic.match(/r:embed="([^"]+)"/)?.[1];
    const ext = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    if (!embed || !medios[embed] || !ext) continue;
    const area = Number(ext[1]) * Number(ext[2]);
    if (!mayor || area > mayor.area) mayor = { area, interno: `word/media/${medios[embed]}`, pic };
  }
  if (!mayor) return null;

  const sr = mayor.pic.match(/<a:srcRect\b([^>]*?)\/>/)?.[1] ?? "";
  const lado = (k) => Number(sr.match(new RegExp(`\\b${k}="(-?\\d+)"`))?.[1] ?? 0) / 100000;

  const png = leer(mayor.interno);
  const { width, height } = await sharp(png).metadata();
  const left = Math.round(width * lado("l"));
  const top = Math.round(height * lado("t"));
  const ancho = Math.max(1, Math.round(width * (1 - lado("l") - lado("r"))));
  const alto = Math.max(1, Math.round(height * (1 - lado("t") - lado("b"))));

  await sharp(png)
    .extract({ left, top, width: ancho, height: alto })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toFile(destino);
  return { origen: mayor.interno, de: `${width}x${height}`, recorte: `${ancho}x${alto} desde ${left},${top}` };
}

// ------------------------------------------------------------

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** Los Word agrupados por el código del maestro que les corresponde. */
const porSku = new Map();
for (const w of WORDS) {
  const leer = abrir(w.archivo);
  const ficha = fichaDe(leer);
  const grupo = porSku.get(w.sku) ?? { sku: w.sku, ficha: null, fotos: {}, principal: null, words: [] };
  // Los Word de un mismo modelo traen el mismo texto: el primero fija la ficha
  // y los siguientes solo tienen que confirmarla.
  if (!grupo.ficha) grupo.ficha = ficha;
  else if (JSON.stringify(grupo.ficha) !== JSON.stringify(ficha)) {
    console.warn(`   ⚠ ${w.sku}: el Word ${w.color} dice algo distinto al de su hermano — revisar a mano`);
  }
  grupo.words.push({ ...w, leer });
  porSku.set(w.sku, grupo);
}

for (const grupo of porSku.values()) {
  const f = grupo.ficha;
  console.log(`\n${grupo.sku} — Efamein ${f.modelo ?? "?"} · ${f.volumen ?? "?"} Lts`);
  console.log(`   características ${f.caracteristicas.length} · medidas ${f.medidas.length}`);
  console.log(`   colores ${COLORES[grupo.sku].join(" / ")}`);

  for (const w of grupo.words) {
    // Se recorta siempre —también en seco— para poder mirar la foto antes de
    // tocar la base: el error del 408 blanco se habría visto acá.
    const salida = APLICAR ? join(DESTINO_FOTOS, w.foto) : join(process.env.TEMP ?? ".", w.foto);
    const detalle = await fotoDe(abrir(w.archivo), salida);
    console.log(`   ${w.color.padEnd(7)} → ${w.foto}  ${detalle ? `(${detalle.origen} ${detalle.de} → ${detalle.recorte})` : "SIN FOTO"}`);
    grupo.fotos[w.color] = `/productos/${w.foto}`;
    if (w.principal) grupo.principal = `/productos/${w.foto}`;
  }
  if (!APLICAR) continue;

  const { data: producto, error: errBuscar } = await sb
    .from("productos")
    .select("id, ficha")
    .eq("sku", grupo.sku)
    .single();
  if (errBuscar) {
    console.error(`   ✗ ${grupo.sku} no está en el catálogo:`, errBuscar.message);
    continue;
  }

  const ficha = {
    ...producto.ficha,
    caracteristicas: f.caracteristicas,
    medidas: f.medidas,
    colores: COLORES[grupo.sku],
    fotos_por_color: grupo.fotos,
    origen: {
      ...producto.ficha.origen,
      ficha_tecnica: `${CARPETA}/${grupo.words[0].archivo}`.split("/").join("\\"),
      fichas_tecnicas: Object.fromEntries(
        grupo.words.map((w) => [w.color, `${CARPETA}/${w.archivo}`.split("/").join("\\")]),
      ),
      nota_foto:
        "Recortada del Word de cada color, con el recorte que declara el propio Word (<a:srcRect>). " +
        "Los Word traen pantallazos de navegador; el recorte es el que hizo Lesly.",
      fichas_por_color_sync: "2026-08-27",
    },
  };

  const { error: errUpd } = await sb
    .from("productos")
    .update({ capacidad: f.volumen ? `${f.volumen} L` : null, foto_path: grupo.principal, ficha })
    .eq("id", producto.id);
  if (errUpd) {
    console.error("   ✗ error actualizando:", errUpd.message);
    continue;
  }
  console.log("   ✓ actualizado");
}

fs.rmSync(TEMPORAL, { force: true });
if (!APLICAR) console.log(`\nNada se ha modificado. Las fotos de prueba quedaron en ${process.env.TEMP}. Agregá --aplicar.\n`);
process.exit(0);
