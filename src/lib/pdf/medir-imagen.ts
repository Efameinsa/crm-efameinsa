/**
 * Ancho y alto en píxeles de una imagen, leídos de su cabecera.
 *
 * POR QUÉ. El estándar de las fichas (`docs/14-estandar-ficha-cotizacion.md`)
 * define cada imagen por una CAJA —el logo cabe en 27 × 14 mm, la foto en
 * 54 × 96 mm, el panel en 35 × 32 mm— y exige que la imagen se escale
 * conservando su proporción hasta tocar el primer lado que llegue al límite.
 * Con solo fijar el ancho, un logo cuadrado sale del doble de alto que uno
 * apaisado y desbalancea la columna; con ancho y alto fijos, se deforma.
 *
 * Para elegir bien hay que saber la proporción del archivo, y eso obliga a
 * mirarlo: @react-pdf no expone las medidas de la imagen que va a dibujar.
 * Basta con la cabecera, así que no se decodifica el bitmap.
 */
export interface MedidasImagen {
  ancho: number;
  alto: number;
}

/** PNG: el bloque IHDR va siempre primero y trae ancho y alto en big-endian. */
function medirPng(datos: Buffer): MedidasImagen | null {
  if (datos.length < 24) return null;
  if (datos.readUInt32BE(0) !== 0x89504e47) return null; // \x89PNG
  if (datos.toString("ascii", 12, 16) !== "IHDR") return null;
  return { ancho: datos.readUInt32BE(16), alto: datos.readUInt32BE(20) };
}

/**
 * JPEG: hay que recorrer los segmentos hasta el marcador de inicio de cuadro
 * (SOF0–SOF15, salvo los cuatro que no describen la imagen), que es el único
 * que trae las medidas.
 */
function medirJpeg(datos: Buffer): MedidasImagen | null {
  if (datos.length < 4 || datos.readUInt16BE(0) !== 0xffd8) return null;
  let i = 2;
  while (i + 9 < datos.length) {
    if (datos[i] !== 0xff) {
      i += 1; // relleno entre segmentos
      continue;
    }
    const marcador = datos[i + 1];
    // D0–D9 y 01 no llevan longitud; FF repetido es relleno.
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
      i += 2;
      continue;
    }
    const largo = datos.readUInt16BE(i + 2);
    const esInicioDeCuadro =
      marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
    if (esInicioDeCuadro) {
      return { alto: datos.readUInt16BE(i + 5), ancho: datos.readUInt16BE(i + 7) };
    }
    i += 2 + largo;
  }
  return null;
}

export function medirImagen(datos: Buffer | null | undefined): MedidasImagen | null {
  if (!datos || datos.length === 0) return null;
  const medidas = medirPng(datos) ?? medirJpeg(datos);
  if (!medidas || medidas.ancho <= 0 || medidas.alto <= 0) return null;
  return medidas;
}

/**
 * Escala la imagen hasta tocar el primer lado de su caja, sin deformarla.
 * Devuelve milímetros. Sin medidas legibles se cae al ancho nominal de la caja
 * —es lo que hacía la ficha antes de existir esto— y el alto lo resuelve
 * @react-pdf con la proporción del archivo.
 */
export function encajarEnCaja(
  datos: Buffer | null | undefined,
  cajaAnchoMm: number,
  cajaAltoMm: number,
): { ancho: number; alto?: number } {
  const medidas = medirImagen(datos);
  if (!medidas) return { ancho: cajaAnchoMm };
  const escala = Math.min(cajaAnchoMm / medidas.ancho, cajaAltoMm / medidas.alto);
  return { ancho: medidas.ancho * escala, alto: medidas.alto * escala };
}
