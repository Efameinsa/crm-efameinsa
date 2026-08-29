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
import { leerZip, textoDeZip } from "./lib-zip.mjs";
import { leerFichaDeXml } from "./lib-ficha-docx.mjs";

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

const EMU_POR_MM = 36000;

async function extraerFicha(rutaDocx) {
  const zip = leerZip(rutaDocx);
  const xml = textoDeZip(zip, "word/document.xml");
  if (!xml) throw new Error("sin word/document.xml");

  // rId → archivo dentro del zip
  const rels = new Map();
  for (const m of textoDeZip(zip, "word/_rels/document.xml.rels").matchAll(
    /Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    rels.set(m[1], m[2].replace(/^\.\.\//, "").replace(/^\//, ""));
  }

  // Imágenes de encabezado y pie = papelería de Efameinsa, no van a la ficha.
  const papeleria = new Set();
  for (const nombre of zip.keys()) {
    if (!/^word\/_rels\/(header|footer)\d*\.xml\.rels$/.test(nombre)) continue;
    for (const m of textoDeZip(zip, nombre).matchAll(/Target="([^"]+)"/g)) {
      papeleria.add(m[1].replace(/^\.\.\//, "").replace(/^\//, ""));
    }
  }

  // El cuerpo de la ficha, leído con el lector compartido.
  const { cabecera, bloques, tablaDe } = leerFichaDeXml(xml);

  // ---------- imágenes ----------
  //
  // Se recorre el XML entero, no párrafo por párrafo: las fichas que vienen de
  // un .doc convertido guardan las fotos como formas VML dentro de cuadros de
  // texto, y el párrafo que las contiene se cierra antes de tiempo al leerlo
  // con expresiones regulares (las 45 fichas convertidas salían sin ninguna
  // imagen). Lo que importa igual es el ORDEN en el documento, y eso se
  // conserva recorriendo el archivo de principio a fin.
  const vistos = new Set();
  const imagenes = [];
  const reImagen = /<a:blip[^>]*r:embed="([^"]+)"|<v:imagedata[^>]*r:id="([^"]+)"[^>]*>/g;
  let mi;
  while ((mi = reImagen.exec(xml)) !== null) {
    const rId = mi[1] ?? mi[2];
    const destino = rels.get(rId);
    if (!destino || papeleria.has(destino)) continue;

    const tabla = tablaDe(mi.index);
    if (tabla && tabla.clase === "condiciones") continue;

    // Medida a la que Word la muestra: DrawingML la declara en EMU justo
    // antes; VML, en puntos dentro del style de la forma que la envuelve.
    const antes = xml.slice(Math.max(0, mi.index - 2500), mi.index);
    let anchoMm = null;
    let altoMm = null;
    const extent = [...antes.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].pop();
    if (extent) {
      anchoMm = Math.round((Number(extent[1]) / EMU_POR_MM) * 10) / 10;
      altoMm = Math.round((Number(extent[2]) / EMU_POR_MM) * 10) / 10;
    } else {
      const estilo = [...antes.matchAll(/style="([^"]*)"/g)].pop();
      const w = estilo?.[1].match(/width:\s*([\d.]+)pt/);
      const h = estilo?.[1].match(/height:\s*([\d.]+)pt/);
      if (w) anchoMm = Math.round((Number(w[1]) / 2.8346) * 10) / 10;
      if (h) altoMm = Math.round((Number(h[1]) / 2.8346) * 10) / 10;
    }

    // EL RECORTE QUE HIZO LESLY EN EL WORD. Word no guarda la imagen recortada:
    // guarda el archivo entero y un rectángulo (`a:srcRect`, en cienmilésimas)
    // que dice qué parte se ve. Extraer el archivo tal cual traía de vuelta lo
    // que ella había escondido — en la CALE160, dos franjas rojas del catálogo
    // y el logo pegado al equipo (reportado por Darwin el 27-08). Se respeta el
    // recorte: lo que va a la cotización es lo que se ve en la ficha.
    let recorte = null;
    if (mi[1]) {
      // DrawingML: <a:srcRect l="" t="" r="" b=""/> en cienmilésimas.
      const despues = xml.slice(mi.index, mi.index + 1200);
      const src = despues.match(/<a:srcRect([^>]*)\/>/);
      const pedazo = (atributo) => {
        const m = src?.[1].match(new RegExp(`${atributo}="(-?\\d+)"`));
        return m ? Number(m[1]) / 100000 : 0;
      };
      if (src && src[1].trim()) recorte = { l: pedazo("l"), t: pedazo("t"), r: pedazo("r"), b: pedazo("b") };
    } else {
      // VML —las 45 fichas que vienen de un .doc—: cropleft/croptop/… en el
      // propio <v:imagedata>, en unidades «f» (fracciones de 65536) o en
      // decimal. Sin esto, la CAL1835 devolvía la foto entera del rodillo donde
      // la ficha muestra SOLO el logo GMP recortado de una esquina.
      const trozo = mi[0];
      const lado = (atributo) => {
        const m = trozo.match(new RegExp(`crop${atributo}="([\\d.]+)(f?)"`));
        if (!m) return 0;
        return m[2] === "f" ? Number(m[1]) / 65536 : Number(m[1]);
      };
      const l = lado("left");
      const t = lado("top");
      const r = lado("right");
      const b = lado("bottom");
      if (l || t || r || b) recorte = { l, t, r, b };
    }

    const clave = `${destino}·${anchoMm}·${altoMm}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const originales = zip.get(`word/${destino}`) ?? zip.get(destino);
    if (!originales) continue;
    // Los metarchivos EMF no los abre canvas: se dejan enteros y el paso 6 los
    // convierte con GDI+ (ninguno de los dos que hay viene recortado).
    const esEmf = /.emf$/i.test(destino);
    const datos = recorte && !esEmf ? await aplicarRecorte(originales, recorte) : originales;
    imagenes.push({
      entrada: destino,
      anchoMm,
      altoMm,
      recorte,
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
