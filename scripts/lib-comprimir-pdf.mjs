// Motor de respaldo del compresor (scripts/comprimir-cotizaciones.mjs --motor node).
// Requiere dos paquetes que NO son dependencia del CRM; instálelos aparte si
// va a usar este motor:  npm i --no-save pdf-lib canvas
//
// Aligera un PDF re-muestreando las imágenes que lleva dentro.
//
// Los presupuestos salen de Word y dos tercios de su peso son fotos JPEG
// guardadas a resolución de impresión (1500x1838 px para una imagen que en la
// hoja mide tres dedos). Para verlas en pantalla sobra con la mitad.
//
// No instala nada: pdf-lib abre y reescribe el documento y canvas recomprime
// cada JPEG. El texto, las tablas y las fuentes no se tocan — la cotización se
// lee idéntica; lo único que baja es la resolución de las fotos.
//
// NUNCA escribe sobre el original: recibe la ruta de salida por separado.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName, PDFRawStream, PDFNumber } from "pdf-lib";
import { createCanvas, Image } from "canvas";

const n = (v) => (typeof v?.asNumber === "function" ? v.asNumber() : undefined);

export async function comprimir(entrada, salida, opciones = {}) {
  const { anchoMax = 700, calidad = 0.45, minBytes = 12_000 } = opciones;
  const original = readFileSync(entrada);
  const doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });

  // Word repite el membrete en cada página: la misma imagen aparece varias
  // veces como objetos distintos. Se recomprime una sola vez y se reutiliza.
  const cache = new Map();
  let tocadas = 0;
  let repetidas = 0;

  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    if (d.get(PDFName.of("ImageMask"))) continue; // máscaras 1 bit: no hay nada que ganar
    const filtro = d.get(PDFName.of("Filter"))?.toString() ?? "";
    if (!filtro.includes("DCTDecode")) continue; // solo JPEG; el resto se deja igual
    const ancho = n(d.get(PDFName.of("Width")));
    const alto = n(d.get(PDFName.of("Height")));
    if (!ancho || !alto) continue;

    const bytes = obj.getContents();
    if (bytes.length < minBytes && ancho <= anchoMax) continue;

    const huella = createHash("sha1").update(bytes).digest("hex");
    let nuevo = cache.get(huella);
    if (nuevo === undefined) {
      try {
        const img = new Image();
        img.src = Buffer.from(bytes);
        if (!img.width) { cache.set(huella, null); continue; }
        const escala = Math.min(1, anchoMax / img.width);
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const lienzo = createCanvas(w, h);
        lienzo.getContext("2d").drawImage(img, 0, 0, w, h);
        const jpeg = lienzo.toBuffer("image/jpeg", { quality: calidad });
        nuevo = jpeg.length < bytes.length ? { datos: jpeg, w, h } : null;
      } catch {
        // Un JPEG que canvas no sepa decodificar (CMYK, progresivo raro) se
        // deja intacto: mejor un PDF algo más pesado que uno roto.
        nuevo = null;
      }
      cache.set(huella, nuevo);
    } else if (nuevo) {
      repetidas++;
    }
    if (!nuevo) continue;

    // La máscara de transparencia (SMask) se deja como está: el visor la
    // escala al tamaño de la imagen base, que es justo lo que necesitamos.
    const nd = d.clone(doc.context);
    nd.set(PDFName.of("Width"), PDFNumber.of(nuevo.w));
    nd.set(PDFName.of("Height"), PDFNumber.of(nuevo.h));
    nd.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
    nd.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
    nd.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
    nd.delete(PDFName.of("DecodeParms"));
    nd.delete(PDFName.of("Decode"));
    doc.context.assign(ref, PDFRawStream.of(nd, new Uint8Array(nuevo.datos)));
    tocadas++;
  }

  const bytes = await doc.save({ useObjectStreams: true });
  if (salida) writeFileSync(salida, bytes);
  return { antes: original.length, despues: bytes.length, imagenes: tocadas, repetidas, paginas: doc.getPageCount() };
}

