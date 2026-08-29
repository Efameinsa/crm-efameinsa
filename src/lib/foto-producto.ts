/**
 * La foto del equipo, acomodada a la hoja antes de subirla.
 *
 * «Cuando la suba debe hacer un proceso para que optimice la imagen y se
 * acomode a las reglas que hemos considerado para la maquetación de las
 * cotizaciones, y que las imágenes no ocupen tanto peso» (28-08).
 *
 * LAS REGLAS SON LAS DE LA HOJA IMPRESA, no un tamaño inventado: la caja de la
 * foto del producto mide 54 × 96 mm (CAJA_PRODUCTO, cotizacion-pdf.tsx) y la
 * imagen se escala hasta tocar el primer lado. A 300 puntos por pulgada eso son
 * 638 × 1134 px; con 1200 px de lado mayor sobra para imprimir y el archivo
 * baja de 600 KB a menos de 150. Las 296 fotos que ya están pesan 44 MB entre
 * todas, unas de 650 KB cada una: ese es el peso que no hay que repetir.
 *
 * SE HACE EN EL NAVEGADOR, antes de subir. Así el archivo grande no viaja por
 * la red, y no hace falta agregar una biblioteca de imágenes al servidor.
 *
 * FONDO BLANCO Y CENTRADA. La ficha se imprime sobre papel blanco y la foto va
 * centrada en su columna: una imagen con transparencia guardada como JPEG sale
 * con el fondo negro, y una recortada al ras se ve pegada al borde. Se compone
 * sobre blanco y se deja respirar.
 */

/** Lado mayor de la imagen guardada. Ver el porqué arriba. */
export const LADO_MAYOR = 1200;

/** Aire alrededor, en proporción del lado: la foto no toca el borde. */
const MARGEN = 0.04;

export interface FotoLista {
  archivo: Blob;
  ancho: number;
  alto: number;
  bytes: number;
}

/**
 * Deja la foto lista para la ficha: acotada, centrada sobre blanco y liviana.
 *
 * Devuelve `null` si el archivo no es una imagen que el navegador sepa leer,
 * que es la forma honesta de decir «esto no se puede subir» sin romper nada.
 */
export async function prepararFoto(archivo: File): Promise<FotoLista | null> {
  const imagen = await cargarImagen(archivo);
  if (!imagen) return null;

  const escala = Math.min(1, LADO_MAYOR / Math.max(imagen.width, imagen.height));
  const anchoUtil = Math.round(imagen.width * escala);
  const altoUtil = Math.round(imagen.height * escala);

  const margen = Math.round(Math.max(anchoUtil, altoUtil) * MARGEN);
  const ancho = anchoUtil + margen * 2;
  const alto = altoUtil + margen * 2;

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imagen, margen, margen, anchoUtil, altoUtil);

  const blob = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/jpeg", 0.86));
  if (!blob) return null;

  return { archivo: blob, ancho, alto, bytes: blob.size };
}

async function cargarImagen(archivo: File): Promise<HTMLImageElement | ImageBitmap | null> {
  try {
    // createImageBitmap respeta la orientación EXIF de las fotos de celular;
    // sin eso, una foto tomada en vertical se sube acostada.
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    }
  } catch {
    // sigue por el camino de abajo
  }
  return new Promise((res) => {
    const url = URL.createObjectURL(archivo);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      res(null);
    };
    img.src = url;
  });
}

/**
 * Dónde está la foto de un equipo.
 *
 * Las 296 que vinieron con el proyecto viven en `public/productos/`; las que
 * sube operaciones van al almacenamiento y su `foto_path` empieza con
 * «storage:» (migración 0121). Vive acá, en un solo lugar, porque la primera
 * versión la resolvía cada pantalla por su cuenta: la ficha la mostraba bien y
 * la tarjeta del catálogo la buscaba en la carpeta del repositorio, así que un
 * equipo con la foto recién subida aparecía sin foto en la lista.
 */
export function rutaFoto(fotoPath: string): string {
  if (fotoPath.startsWith("storage:")) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/productos/${fotoPath.slice(8)}`;
  }
  return `/productos/${fotoPath.split("/").pop()}`;
}
