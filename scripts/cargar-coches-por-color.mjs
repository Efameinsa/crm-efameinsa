// ============================================================
// CRM EFAMEINSA · Los coches de transporte de ropa, por color
// ============================================================
// Orden del 27-08: Lesly rehízo V:\LESLY\COCHES\ESPECIFICACIONES y ahora son
// CINCO Word en vez de tres — partió el HM-402 y el HM-408 en un archivo por
// color (AZUL / BLANCO). El pedido: que en el CRM figure todo lo que dicen,
// con su foto.
//
// SIGUEN SIENDO TRES PRODUCTOS. El maestro de Lesly —única fuente de precios—
// tiene un código por modelo y no por color: CO401 ($899), CO402 ($825) y
// CO408 ($799). «CO4081» solo existe en el nombre de un archivo; darle código
// propio lo dejaría sin precio y haría que cotizarlo pidiera aprobación de
// gerencia. Así que el color vive donde ya vivía —`ficha.colores`— y lo que se
// suma es la FOTO DE CADA COLOR (`ficha.fotos_por_color`), que el selector de
// equipos ahora muestra como miniaturas.
//
// LAS FOTOS SALEN DE LOS WORD (orden expresa del 27-08: «es obligatorio que
// sean de word, no lo busques de otra fuente»), y no del catálogo PDF como en
// la carga del 25-08. Los Word no traen fotos sueltas: traen PANTALLAZOS del
// navegador —Alibaba, 1440x900, con barra de tareas incluida— y dentro de ese
// pantallazo sí hay fotos de producto sobre fondo blanco. De ahí se recorta,
// por coordenadas fijas, la foto que le corresponde a cada Word:
//
//   · CO401 (doc HM 401)   → el coche azul con la muesca frontal en «V», que
//     es la forma del HM-401 y de ningún otro (se confirma contra el catálogo).
//   · CO402 AZUL / CO408 AZUL → el pantallazo es EL MISMO ARCHIVO en los dos
//     Word (mismo md5): Lesly reutilizó la captura. Los dos recortes salen
//     iguales, y así queda anotado en la ficha — es lo que dicen los Word.
//   · CO402 BLANCO / CO408 BLANCO → los dos Word blancos comparten un
//     pantallazo con una grilla de seis coches rotulados por medida. Cada
//     recorte se elige POR SU MEDIDA, no por parecido: 1200*800*800 es el
//     HM-402 y 1100*790*840 es el HM-408. Son celdas chicas (~230x200), la
//     resolución que hay.
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

/** Un Word por color. `recorte` = [imagen dentro del .docx, left, top, ancho, alto]. */
const WORDS = [
  {
    sku: "CO401",
    color: "Azul",
    principal: true,
    archivo: "CO401-COCHE DE TRANSPORTE DE ROPA  HM 401.docx",
    foto: "co401.png",
    recorte: ["image2.png", 415, 365, 385, 330],
  },
  {
    sku: "CO402",
    color: "Azul",
    principal: true,
    archivo: "CO402-COCHE DE TRANSPORTE DE ROPA - HM 402 AZUL.docx",
    foto: "co402.png",
    recorte: ["image1.png", 40, 365, 385, 330],
  },
  {
    sku: "CO402",
    color: "Blanco",
    principal: false,
    archivo: "CO402-COCHE DE TRANSPORTE DE ROPA - HM 402 BLANCO.docx",
    foto: "co402-blanco.png",
    recorte: ["image1.png", 52, 503, 227, 202], // celda «1200*800*800MMH»
  },
  {
    sku: "CO408",
    color: "Azul",
    principal: true,
    archivo: "CO408-COCHE DE TRANSPORTE DE ROPA  HM 408 AZUL.docx",
    foto: "co408.png",
    recorte: ["image2.png", 40, 365, 385, 330],
  },
  {
    sku: "CO408",
    color: "Blanco",
    principal: false,
    archivo: "CO4081-COCHE DE TRANSPORTE DE ROPA  HM 408 BLANCO.docx",
    foto: "co408-blanco.png",
    recorte: ["image1.png", 305, 243, 231, 199], // celda «1100*790*840MMH»
  },
];

/** Colores en los que existe cada coche. Word + catálogo Efamein 2026: el
 *  HM-402 se fabrica además en Gris y Verde (corregido el 26-08 con Santos),
 *  aunque Lesly solo haya hecho ficha del azul y el blanco. */
const COLORES = {
  CO401: ["Azul"],
  CO402: ["Azul", "Blanco", "Gris", "Verde"],
  CO408: ["Azul", "Blanco"],
};

// ------------------------------------------------------------
// El texto del Word, tal cual
// ------------------------------------------------------------

function lineasDe(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], { maxBuffer: 64e6, encoding: "latin1" });
  return Buffer.from(xml, "latin1")
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
  // Todo lo comercial queda fuera de la ficha técnica: el precio manda el
  // maestro y la garantía/entrega las pone la cotización.
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];

/** Ficha del Word: características y medidas, sin tocar la redacción.
 *
 *  El cargador del 25-08 se comía «Capacidad de Carga : 500 kg» porque
 *  descartaba toda línea que empezara con «capacidad» (una regla pensada para
 *  el encabezado Marca/Modelo/Volumen). Acá el encabezado ya queda afuera solo
 *  —está antes del primer título— y no hace falta ese filtro: por eso la
 *  medida que faltó durante dos días entra ahora sola. */
function fichaDe(docx) {
  const lineas = lineasDe(docx);
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

/** Recorta del pantallazo la foto de producto, sobre blanco. */
async function recortarFoto(docx, [imagen, left, top, width, height], destino) {
  const png = execFileSync("unzip", ["-p", docx, `word/media/${imagen}`], { maxBuffer: 64e6 });
  await sharp(png)
    .extract({ left, top, width, height })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toFile(destino);
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

/** Los cinco Word agrupados por el código que les corresponde. */
const porSku = new Map();
for (const w of WORDS) {
  const ruta = `${CARPETA}/${w.archivo}`;
  const f = fichaDe(ruta);
  const grupo = porSku.get(w.sku) ?? { sku: w.sku, ficha: null, fotos: {}, principal: null, words: [] };
  // Los Word de un mismo modelo traen el mismo texto (comparados línea a
  // línea): el primero fija la ficha y el siguiente solo debe confirmarla.
  if (!grupo.ficha) grupo.ficha = f;
  else {
    const igual = JSON.stringify(grupo.ficha) === JSON.stringify(f);
    if (!igual) console.warn(`   ⚠ ${w.sku}: el Word ${w.color} dice algo distinto al anterior — se revisa a mano`);
  }
  grupo.fotos[w.color] = `/productos/${w.foto}`;
  if (w.principal) grupo.principal = `/productos/${w.foto}`;
  grupo.words.push({ ...w, ruta });
  porSku.set(w.sku, grupo);
}

for (const grupo of porSku.values()) {
  const f = grupo.ficha;
  console.log(`\n${grupo.sku} — Efamein ${f.modelo ?? "?"} · ${f.volumen ?? "?"} Lts`);
  console.log(`   características ${f.caracteristicas.length} · medidas ${f.medidas.length}`);
  console.log(`   colores ${COLORES[grupo.sku].join(" / ")}`);
  for (const w of grupo.words) console.log(`   foto ${w.color.padEnd(7)} ← ${w.archivo}`);
  if (!APLICAR) continue;

  for (const w of grupo.words) {
    await recortarFoto(w.ruta, w.recorte, join(DESTINO_FOTOS, w.foto));
  }

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
      // Cinco archivos, uno por color: la ruta única de antes ya no alcanza.
      ficha_tecnica: grupo.words[0].ruta.split("/").join("\\"),
      fichas_tecnicas: Object.fromEntries(grupo.words.map((w) => [w.color, `${CARPETA}/${w.archivo}`.split("/").join("\\")])),
      nota_foto:
        "Recortada del pantallazo que trae el propio Word (orden del 27-08: las fotos salen de los Word). " +
        "El Word del azul del HM-402 y el del HM-408 comparten el mismo pantallazo, así que su recorte es idéntico.",
      fichas_por_color_sync: "2026-08-27",
    },
  };

  const { error: errUpd } = await sb
    .from("productos")
    .update({
      capacidad: f.volumen ? `${f.volumen} L` : null,
      foto_path: grupo.principal,
      ficha,
    })
    .eq("id", producto.id);
  if (errUpd) {
    console.error(`   ✗ error actualizando:`, errUpd.message);
    continue;
  }
  console.log(`   ✓ actualizado`);
}

if (!APLICAR) console.log("\nNada se ha modificado. Agregá --aplicar.\n");
process.exit(0);
