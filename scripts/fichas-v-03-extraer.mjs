// ============================================================
// CRM EFAMEINSA · Paso 3 · Leer cada ficha técnica tal como está
// ============================================================
// Orden de Darwin (27-08): «revisa la descripción de cada ficha técnica y
// reconoce sus títulos, subtítulos y cada ítem con su viñeta, con su misma
// estructura, y ponlo fielmente en la cotización».
//
// Hasta hoy el extractor viejo (`extraer-ficha-tecnica.mjs`) metía cada ficha
// en cuatro cajones fijos —características, diseño, especificaciones,
// medidas— y perdía todo lo que no encajara. Acá se lee la ficha COMO ESTÁ:
// una lista ordenada de bloques, cada uno con su tipo, en el mismo orden en
// que aparecen en el Word.
//
// Cómo se lee cada Word —qué es un título, un subtítulo, una viñeta y un dato—
// está en `lib-ficha-docx.mjs`, que es el mismo lector que usan los scripts de
// reparación: una ficha ya cargada se repara sin volver a correr el pipeline.
//
// QUÉ NO SE TRAE, por orden expresa: las tablas del pie de la ficha (precio,
// tiempo de entrega, garantía, forma de pago). Eso lo pone el sistema con las
// condiciones de la cotización, y la firma del comercial, como siempre.
//
// La tabla de arriba (Marca / Modelo / Capacidad / Calentamiento / Panel /
// Controles) sí se lee, pero como datos de cabecera: son las columnas de la
// ficha del PDF, no descripción.
//
// No toca la base: escribe scripts/data/fichas-v/fichas.json y las imágenes
// en scripts/data/fichas-v/img/.
//
// Uso: node scripts/fichas-v-03-extraer.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createCanvas, loadImage } from "canvas";
import { leerZip, textoDeZip } from "../src/lib/fichas/zip.mjs";
import { leerFichaDeXml } from "../src/lib/fichas/ficha-docx.mjs";
import { imagenesDeDocx } from "../src/lib/fichas/imagenes-docx.mjs";

/**
 * Deja la imagen como se ve en el Word: recortada por el rectángulo que puso
 * Lesly. Los valores vienen en fracción de la imagen (izquierda, arriba,
 * derecha, abajo) y se descuentan de cada lado.
 */
async function aplicarRecorte(datos, r) {
  const img = await loadImage(datos);
  const x0 = Math.round(img.width * r.l);
  const y0 = Math.round(img.height * r.t);
  const ancho = Math.max(1, Math.round(img.width * (1 - r.l - r.r)));
  const alto = Math.max(1, Math.round(img.height * (1 - r.t - r.b)));
  const lienzo = createCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(img, x0, y0, ancho, alto, 0, 0, ancho, alto);
  return lienzo.toBuffer("image/png");
}

const LISTA = "scripts/data/fichas-v/lista.json";
const SALIDA = "scripts/data/fichas-v/fichas.json";
const DIR_IMG = "scripts/data/fichas-v/img";


async function extraerFicha(rutaDocx) {
  const zip = leerZip(rutaDocx);
  const xml = textoDeZip(zip, "word/document.xml");
  if (!xml) throw new Error("sin word/document.xml");

  // El cuerpo de la ficha y sus imágenes salen de los lectores compartidos de
  // `src/lib/fichas/`: los mismos que usa la pantalla donde Lesly arrastra el
  // Word. Que la lectura sea UNA sola no es un lujo — copiarla «mejorándola»
  // fue lo que se llevó puestas las medidas de la SECA758.
  const { cabecera, bloques, tablaDe } = leerFichaDeXml(xml);

  // La biblioteca devuelve los bytes SIN recortar y el recorte aparte, porque
  // el navegador recorta con el canvas del navegador y acá se recorta con el
  // de node. Cada uno aplica el mismo recorte con lo que tiene.
  const imagenes = [];
  for (const img of imagenesDeDocx(zip, xml, tablaDe)) {
    // Los metarchivos EMF no los abre canvas: se dejan enteros y el paso 6 los
    // convierte con GDI+ (ninguno de los dos que hay viene recortado).
    const esEmf = /\.emf$/i.test(img.entrada);
    const datos = img.recorte && !esEmf ? await aplicarRecorte(img.originales, img.recorte) : img.originales;
    imagenes.push({
      entrada: img.entrada,
      anchoMm: img.anchoMm,
      altoMm: img.altoMm,
      recorte: img.recorte,
      bytes: datos.length,
      hash: createHash("sha1").update(datos).digest("hex").slice(0, 12),
      datos,
    });
  }

  return { cabecera, bloques, imagenes };
}

// ---------- recorrido ----------

const lista = JSON.parse(readFileSync(LISTA, "utf-8"));
mkdirSync(DIR_IMG, { recursive: true });

const fichas = [];
const fallidas = [];

for (const p of lista.productos) {
  if (!p.docx) {
    fallidas.push({ codigo: p.codigo, error: "sin .docx (conversión pendiente)" });
    continue;
  }
  try {
    const { cabecera, bloques, imagenes } = await extraerFicha(p.docx);
    const guardadas = imagenes.map((img, i) => {
      // Lo recortado sale en PNG; lo demás conserva su formato original.
      const ext =
        img.recorte && !/\.emf$/i.test(img.entrada)
          ? "png"
          : (img.entrada.match(/\.([a-z0-9]+)$/i) ?? [, "png"])[1].toLowerCase();
      const archivo = join(DIR_IMG, `${p.codigo}-${i + 1}.${ext}`).replace(/\\/g, "/");
      writeFileSync(archivo, img.datos);
      return { archivo, anchoMm: img.anchoMm, altoMm: img.altoMm, recorte: img.recorte, bytes: img.bytes, hash: img.hash };
    });
    fichas.push({
      codigo: p.codigo,
      equipo: p.equipo,
      marca: p.marca,
      stock: p.stock,
      ubicacion: p.ubicacion,
      precio: p.precio,
      origen: p.archivo,
      docx: p.docx,
      cabecera,
      bloques,
      imagenes: guardadas,
    });
  } catch (e) {
    fallidas.push({ codigo: p.codigo, error: String(e.message ?? e).slice(0, 140) });
  }
}

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), fichas, fallidas }, null, 2));

const conBloques = fichas.filter((f) => f.bloques.length > 0).length;
const sinImagen = fichas.filter((f) => f.imagenes.length === 0);
console.log(`Fichas leídas: ${fichas.length}  ·  con descripción: ${conBloques}  ·  fallidas: ${fallidas.length}`);
console.log(`Imágenes extraídas: ${fichas.reduce((a, f) => a + f.imagenes.length, 0)}`);
console.log(`\nSin ninguna imagen (${sinImagen.length}): ${sinImagen.map((f) => f.codigo).join(", ")}`);
const sinTexto = fichas.filter((f) => f.bloques.length === 0);
if (sinTexto.length) console.log(`Sin descripción (${sinTexto.length}): ${sinTexto.map((f) => f.codigo).join(", ")}`);
for (const f of fallidas) console.log(`  ✗ ${f.codigo}: ${f.error}`);
console.log(`\n→ ${SALIDA}`);
