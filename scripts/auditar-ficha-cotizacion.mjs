// Audita un PDF de cotización contra el estándar de maquetación de las fichas
// (docs/14-estandar-ficha-cotizacion.md). Devuelve código de salida distinto de
// cero si alguna regla falla, para poder correrlo en lote.
//
// El estándar trae un auditor en Python con pdfplumber; esta máquina no tiene
// Python, así que se hace lo mismo leyendo la lista de operadores del PDF con
// pdfjs: cada borde de la tabla llega como un trazo con su caja, y cada imagen
// con su matriz de transformación, que es de donde salen los milímetros.
//
// Uso:
//   node scripts/auditar-ficha-cotizacion.mjs scripts/data/*.pdf

import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const MM = 72 / 25.4;
const TOL = 0.6; // mm

const NORMA = {
  margen: 20.0,
  anchoTabla: 170.0,
  columnaImagenes: 60.0,
  ejeImagenes: 50.0,
  bordeSuperiorTabla: 29.4,
  limiteInferior: 268.0,
  pieMembrete: 273.0,
};

/** Cajas de las tres imágenes: la imagen debe caber y tocar uno de los dos lados. */
const CAJAS = {
  logo: [27.0, 14.0],
  producto: [54.0, 96.0],
  panel: [35.0, 32.0],
};

function encajaEnAlgunaCaja(ancho, alto) {
  for (const [nombre, [maxAncho, maxAlto]] of Object.entries(CAJAS)) {
    const cabe = ancho <= maxAncho + TOL && alto <= maxAlto + TOL;
    const toca = Math.abs(ancho - maxAncho) <= TOL || Math.abs(alto - maxAlto) <= TOL;
    if (cabe && toca) return nombre;
  }
  return null;
}

const multiplicar = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Trazos e imágenes de una página, ya en milímetros y con el origen arriba. */
async function geometria(pagina) {
  const altoPagina = pagina.view[3];
  const ops = await pagina.getOperatorList();
  const trazos = [];
  const imagenes = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pila = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) pila.push([...ctm]);
    else if (fn === OPS.restore) ctm = pila.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiplicar(ctm, args);
    else if (fn === OPS.constructPath) {
      // args[2] es la caja del trazo en el espacio del path; con la matriz
      // actual queda en el de la página.
      const caja = args[2];
      if (!caja || caja.length !== 4) continue;
      const p1 = aplicar(ctm, caja[0], caja[1]);
      const p2 = aplicar(ctm, caja[2], caja[3]);
      trazos.push({
        x0: Math.min(p1[0], p2[0]) / MM,
        x1: Math.max(p1[0], p2[0]) / MM,
        y0: (altoPagina - Math.max(p1[1], p2[1])) / MM,
        y1: (altoPagina - Math.min(p1[1], p2[1])) / MM,
      });
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintJpegXObject ||
      fn === OPS.paintInlineImageXObject
    ) {
      const ancho = Math.hypot(ctm[0], ctm[1]) / MM;
      const alto = Math.hypot(ctm[2], ctm[3]) / MM;
      const x = ctm[4] / MM;
      const y = (altoPagina - ctm[5]) / MM;
      imagenes.push({ ancho, alto, x0: x, x1: x + ancho, y0: y - alto, y1: y });
    }
  }
  return { trazos, imagenes, anchoPagina: pagina.view[2] / MM };
}

async function auditar(ruta) {
  const fallos = [];
  const doc = await getDocument({ url: ruta, isOffscreenCanvasSupported: false }).promise;

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const { trazos, imagenes, anchoPagina } = await geometria(pagina);

    const horizontales = trazos.filter((t) => t.y1 - t.y0 < 1.5 && t.x1 - t.x0 > 100);
    const verticales = trazos.filter((t) => t.x1 - t.x0 < 1.5 && t.y1 - t.y0 > 10);

    // Una página de ficha es la que parte el cuerpo en dos columnas. No alcanza
    // con buscar una línea de 170 mm: la tabla del resumen de la carta también
    // ocupa el ancho útil, y las rayas del membrete y del pie, también.
    const divisor = verticales
      .filter((v) => horizontales.some((h) => Math.abs(v.x0 - h.x0 - NORMA.columnaImagenes) <= TOL))
      .sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))[0];
    if (!divisor) continue;

    // Bordes de la tabla: los de las líneas que tienen un trazo vertical
    // naciendo en su misma altura. Así quedan fuera la raya del membrete y la
    // del pie, que miden lo mismo pero no son tabla.
    const deTabla = horizontales.filter((h) =>
      verticales.some((v) => Math.abs(v.y0 - h.y0) <= TOL || Math.abs(v.y1 - h.y1) <= TOL),
    );
    if (deTabla.length === 0) continue;

    const izquierda = Math.min(...deTabla.map((t) => t.x0));
    const derecha = Math.max(...deTabla.map((t) => t.x1));
    if (Math.abs(izquierda - NORMA.margen) > TOL)
      fallos.push(`p${n}: borde izquierdo en ${izquierda.toFixed(1)} mm (esperado 20.0)`);
    if (Math.abs(anchoPagina - derecha - NORMA.margen) > TOL)
      fallos.push(`p${n}: margen derecho ${(anchoPagina - derecha).toFixed(1)} mm (esperado 20.0)`);
    if (Math.abs(derecha - izquierda - NORMA.anchoTabla) > TOL)
      fallos.push(`p${n}: ancho de tabla ${(derecha - izquierda).toFixed(1)} mm (esperado 170.0)`);

    const texto = await pagina.getTextContent();
    const palabras = texto.items.map((i) => i.str.trim()).filter(Boolean);
    // La ficha empieza acá cuando está la fila del título; si no, es la
    // continuación de la anterior y su tabla no vuelve a abrirse arriba.
    const abreFicha = palabras.some((p) => p.startsWith("ITEM "));
    // Familia COCHE: es la única con la columna «Volumen».
    const esCoche = palabras.includes("Volumen");

    const arriba = Math.min(...deTabla.map((t) => t.y0));
    if (abreFicha && Math.abs(arriba - NORMA.bordeSuperiorTabla) > TOL)
      fallos.push(`p${n}: la tabla empieza en ${arriba.toFixed(1)} mm (esperado 29.4)`);

    // Solo se auditan las imágenes de la ficha: las que caen dentro de la
    // columna de 60 mm. El logo del membrete vive fuera de la tabla.
    const deLaFicha = imagenes.filter(
      (img) =>
        img.x0 >= izquierda - TOL &&
        img.x1 <= izquierda + NORMA.columnaImagenes + TOL &&
        img.y0 >= arriba - TOL,
    );

    for (const img of deLaFicha) {
      const centro = (img.x0 + img.x1) / 2;
      if (Math.abs(centro - NORMA.ejeImagenes) > TOL)
        fallos.push(
          `p${n}: imagen de ${img.ancho.toFixed(1)} mm descentrada (eje en ${centro.toFixed(1)}, esperado 50.0)`,
        );
      if (!encajaEnAlgunaCaja(img.ancho, img.alto))
        fallos.push(
          `p${n}: imagen de ${img.ancho.toFixed(1)} × ${img.alto.toFixed(1)} mm fuera de toda caja (27×14 / 54×96 / 35×32)`,
        );
      if (img.y1 > NORMA.limiteInferior)
        fallos.push(`p${n}: imagen por debajo del límite inferior (${img.y1.toFixed(1)} mm)`);
    }

    // Desde el 27-08 TODA imagen va centrada en la fila del cuerpo, en
    // vertical y en horizontal (decisión de Darwin mirando la RX180). El
    // divisor de columnas es el que mide el alto de esa fila.
    if (deLaFicha.length === 1) {
      const centroImagen = (deLaFicha[0].y0 + deLaFicha[0].y1) / 2;
      const centroFila = (divisor.y0 + divisor.y1) / 2;
      // 3 mm de holgura: en una ficha que sigue en la página siguiente el
      // centro se calcula con el alto teórico de las filas de arriba, y un
      // título que ocupa dos renglones corre la fila un par de milímetros.
      if (Math.abs(centroImagen - centroFila) > 3)
        fallos.push(
          `p${n}: imagen única sin centrar en vertical (centro ${centroImagen.toFixed(1)} mm, fila centrada en ${centroFila.toFixed(1)} mm)`,
        );
    }

    /* NINGÚN TEXTO SE SALE DE SU CASILLA. Un código sin espacios más ancho que
       su columna no se puede partir, y @react-pdf lo dibuja igual: el modelo
       «GIANT C MAX(CWG27MDCRSCDG27MUCPS)» de la LAVTGIA13 se salió y tapó la
       casilla de al lado en una cotización real (28-08). Se detecta cuando la
       caja de un texto cruza una raya vertical de la tabla. */
    // Acá sirven también las rayas cortas: las casillas de la fila de
    // especificaciones miden 9.5 mm de alto y quedaban fuera de `verticales`.
    const separadores = trazos.filter((t) => t.x1 - t.x0 < 1.5 && t.y1 - t.y0 > 3);
    for (const item of texto.items) {
      if (!item.str.trim() || !item.width) continue;
      const x0 = item.transform[4] / MM;
      const x1 = x0 + item.width / MM;
      // La raya tiene que estar a la altura del texto: el pie de página también
      // cruza el eje de una columna, pero 200 mm más abajo.
      const y = (pagina.view[3] - item.transform[5]) / MM;
      const cruzada = separadores.find((v) => v.x0 > x0 + 0.3 && v.x0 < x1 - 0.3 && y >= v.y0 - 1 && y <= v.y1 + 1);
      if (cruzada) {
        const aviso = `p${n}: «${item.str.trim().slice(0, 40)}» se sale de su casilla (cruza la línea de ${cruzada.x0.toFixed(1)} mm)`;
        if (!fallos.includes(aviso)) fallos.push(aviso);
      }
    }

    /* NINGÚN RESTO DE CÓDIGO DE WORD. Las fichas hechas con WPS guardan las
       imágenes vinculadas como un campo INCLUDEPICTURE con la ruta del disco de
       quien la escribió; leída como texto, esa instrucción salió impresa arriba
       de las características de la LAVTMAX17, delante del cliente. */
    const RESTOS_DE_WORD = /INCLUDEPICTURE|MERGEFORMAT|\\\*\s*MERGEFORMAT|HYPERLINK\s+"|AppData\\Local\\Temp/i;
    for (const item of texto.items) {
      if (RESTOS_DE_WORD.test(item.str)) {
        fallos.push(`p${n}: resto de código de Word impreso: «${item.str.trim().slice(0, 60)}»`);
        break;
      }
    }

    // Ningún contenido puede bajar de los 268 mm. El pie del membrete empieza
    // en 273, así que lo que caiga en esa franja de 5 mm —y solo eso— es
    // contenido invadiendo el colchón.
    const altoPagina = pagina.view[3];
    for (const item of texto.items) {
      if (!item.str.trim()) continue;
      const y = (altoPagina - item.transform[5]) / MM;
      if (y > NORMA.limiteInferior && y < NORMA.pieMembrete) {
        fallos.push(`p${n}: texto por debajo del límite inferior (${y.toFixed(1)} mm)`);
        break;
      }
    }
  }
  return fallos;
}

const rutas = process.argv.slice(2);
if (rutas.length === 0) {
  console.error("Uso: node scripts/auditar-ficha-cotizacion.mjs <archivo.pdf> [...]");
  process.exit(2);
}

let total = 0;
for (const ruta of rutas) {
  const fallos = await auditar(ruta);
  total += fallos.length;
  console.log(`${fallos.length ? "FALLA" : "OK   "}  ${ruta}`);
  for (const f of fallos) console.log(`         - ${f}`);
}
process.exit(total ? 1 : 0);
