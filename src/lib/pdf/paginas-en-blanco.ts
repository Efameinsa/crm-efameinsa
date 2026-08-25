import { PDFDocument } from "pdf-lib";
import { inflateSync } from "node:zlib";

/**
 * Quita del PDF las hojas que salieron en blanco.
 *
 * QUÉ ES UNA HOJA EN BLANCO ACÁ. No está vacía del todo: el membrete y el pie
 * son elementos absolutos y react-pdf los vuelve a dibujar en CADA página que
 * genera, así que una hoja sobrante llega al cliente con la papelería impresa
 * y nada más. Eso es lo que se vio el 25-08 en la cotización de la Asociación
 * Hogar Clínica San Juan de Dios: 6 páginas, y la cuarta con solo el membrete.
 *
 * DE DÓNDE SALEN. Cuando el contenido de una página se pasa del alto por poco
 * —una ficha con una viñeta de más, una tabla que no entra por dos líneas—,
 * react-pdf abre otra hoja para ese sobrante. Si lo que sobra es margen y no
 * texto, la hoja queda sin nada. Pasó con la ficha del segundo equipo, que se
 * pasó por unos pocos puntos.
 *
 * POR QUÉ SE QUITA DESPUÉS Y NO SE EVITA ANTES. Se puede ajustar el alto de
 * una ficha para que entre, y hay que hacerlo cuando se detecta; pero eso
 * arregla ESE documento. Mañana entra un equipo con 40 características, o una
 * dirección de tres líneas, y vuelve a sobrar. Esto es la red: cualquier hoja
 * que quede sin contenido no llega al cliente, venga de donde venga.
 *
 * CÓMO SE RECONOCE. Contando cuántas veces la página dibuja texto. El membrete
 * y el pie juntos no pasan de cinco: en EFAMEINSA son la razón social, el
 * subtítulo, la web y dos líneas de dirección (el logo es una imagen, no
 * texto); en OPEN, el wordmark, la razón social, el subtítulo, la web y una
 * línea. La página REAL más pobre de una cotización —la del cierre, con
 * «Agradeciendo su atención» y la firma— dibuja quince. El umbral va en ocho:
 * deja tres de holgura sobre el membrete y queda al doble de distancia de la
 * página con menos contenido de verdad.
 */
const TEXTOS_DEL_MEMBRETE = 8;

/**
 * Nunca vaciar el documento. Si la cuenta diera que casi todo está en blanco,
 * lo que falló es esta función, no el PDF: mejor entregarlo entero con una
 * hoja de más que entregar tres páginas de las seis que el cliente esperaba.
 */
const MAXIMO_QUITABLE = 0.4;

function textoDeLaPagina(bytes: Uint8Array): string {
  try {
    return inflateSync(Buffer.from(bytes)).toString("latin1");
  } catch {
    // Sin comprimir (o con un filtro que no manejamos): se lee tal cual.
    return Buffer.from(bytes).toString("latin1");
  }
}

/** Cuántas veces dibuja texto cada página, en orden. */
export async function textosPorPagina(pdf: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((pagina) => {
    const contenidos = pagina.node.Contents();
    if (!contenidos) return 0;
    const refs = "asArray" in contenidos ? contenidos.asArray() : [contenidos];
    let n = 0;
    for (const ref of refs) {
      const stream = pagina.doc.context.lookup(ref) as { getContents?: () => Uint8Array } | undefined;
      const datos = stream?.getContents?.();
      if (!datos) continue;
      n += (textoDeLaPagina(datos).match(/\bTj\b|\bTJ\b/g) ?? []).length;
    }
    return n;
  });
}

export async function quitarPaginasEnBlanco(
  pdf: Uint8Array,
): Promise<{ pdf: Uint8Array; quitadas: number[] }> {
  const textos = await textosPorPagina(pdf);
  const enBlanco = textos
    .map((n, i) => ({ n, i }))
    .filter((p) => p.n <= TEXTOS_DEL_MEMBRETE)
    .map((p) => p.i);

  if (enBlanco.length === 0) return { pdf, quitadas: [] };
  if (enBlanco.length > Math.floor(textos.length * MAXIMO_QUITABLE)) {
    return { pdf, quitadas: [] };
  }

  const doc = await PDFDocument.load(pdf);
  // De atrás hacia adelante: quitar la página 3 no corre el índice de la 5.
  for (const i of [...enBlanco].reverse()) doc.removePage(i);
  return { pdf: await doc.save(), quitadas: enBlanco.map((i) => i + 1) };
}
