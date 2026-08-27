// Lector de zip mínimo, para abrir .docx y .xlsx sin dependencias.
//
// Se lee el DIRECTORIO CENTRAL (al final del archivo), no los encabezados
// locales: cuando Word guarda con el bit 3 de banderas, el encabezado local
// trae los tamaños en cero y solo el directorio central dice cuánto ocupa cada
// entrada. Recorrer el archivo buscando firmas «PK» falla justo en esos.

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const FIRMA_EOCD = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;

/** Devuelve un Map<nombre, Buffer> con el contenido de cada entrada. */
export function leerZip(ruta) {
  const b = readFileSync(ruta);

  // Fin del directorio central: los últimos 22 bytes, salvo que haya comentario.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66_000); i--) {
    if (b.readUInt32LE(i) === FIRMA_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error(`No parece un zip: ${ruta}`);

  const entradas = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);

  const archivos = new Map();
  for (let n = 0; n < entradas; n++) {
    if (b.readUInt32LE(p) !== FIRMA_CENTRAL) break;
    const metodo = b.readUInt16LE(p + 10);
    const comprimido = b.readUInt32LE(p + 20);
    const nombreLargo = b.readUInt16LE(p + 28);
    const extraLargo = b.readUInt16LE(p + 30);
    const comentarioLargo = b.readUInt16LE(p + 32);
    const offsetLocal = b.readUInt32LE(p + 42);
    const nombre = b.toString("utf8", p + 46, p + 46 + nombreLargo);

    // El encabezado local repite nombre y extra con largos propios.
    const nLocal = b.readUInt16LE(offsetLocal + 26);
    const eLocal = b.readUInt16LE(offsetLocal + 28);
    const inicio = offsetLocal + 30 + nLocal + eLocal;
    const datos = b.subarray(inicio, inicio + comprimido);

    try {
      archivos.set(nombre, metodo === 8 ? inflateRawSync(datos) : Buffer.from(datos));
    } catch {
      /* entrada corrupta: se ignora, el resto del archivo sirve igual */
    }
    p += 46 + nombreLargo + extraLargo + comentarioLargo;
  }
  return archivos;
}

/** El texto de una entrada, o "" si no está. */
export function textoDeZip(zip, nombre) {
  const b = zip.get(nombre);
  return b ? b.toString("utf8") : "";
}
