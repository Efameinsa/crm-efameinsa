import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * TAPA LOS IMPORTES DE UN PDF YA HECHO (gerencia, 28-09).
 *
 * Postventa tiene que poder abrir las cotizaciones del archivo —las que vivían
 * en las unidades S:, T: y O:, anteriores al CRM— para saber qué se le vendió
 * al cliente, pero sin ver precios: «estarían borraditos los números… X, X, X,
 * asterisco, asterisco, algo así, para tapar los números». Esos documentos no
 * se generan acá (son el Word de entonces, pasado a PDF), así que no se pueden
 * volver a dibujar sin cifras como las cotizaciones del CRM: se buscan los
 * importes en el texto de cada página y se cubren con un recuadro blanco y
 * asteriscos, solo la cifra y no la frase que la rodea.
 *
 * QUÉ CUENTA COMO IMPORTE (probado con presupuestos reales del archivo): una
 * cifra pegada a «US$», «U$D», «USD», «$» o «S/»; una con separador de miles y
 * dos decimales («12,699.00»); o una con dos decimales cuando el trozo de
 * texto anterior es la moneda («USD» | «425.00»). Así no se tapan medidas como
 * «570.60 mm» o «1,410 mm» ni modelos como «G14.25».
 */
const CON_SIMBOLO = /(?:U\$D|US\s?\$|USD|\$|S\/\.?)\s*\d[\d.,]*/gi;
const CON_MILES = /(?<![\w.,])\d{1,3}(?:[.,]\d{3})+[.,]\d{2}(?!\d)/g;
const CON_DECIMALES = /(?<![\w.,])\d[\d.,]*[.,]\d{2}(?!\d)/g;
const TERMINA_EN_MONEDA = /(U\$D|US\s?\$|USD|\$|S\/\.?|PEN)\s*$/i;

/** Los tramos [desde, hasta) del texto que son importes. */
export function tramosDeImporte(texto: string, anterior: string): [number, number][] {
  const tramos: [number, number][] = [];
  const agregar = (re: RegExp) => {
    for (const m of texto.matchAll(re)) {
      const desde = m.index ?? 0;
      const hasta = desde + m[0].length;
      if (!tramos.some(([a, b]) => desde < b && hasta > a)) tramos.push([desde, hasta]);
    }
  };
  agregar(CON_SIMBOLO);
  agregar(CON_MILES);
  if (TERMINA_EN_MONEDA.test(anterior.trim())) agregar(CON_DECIMALES);
  return tramos.sort((a, b) => a[0] - b[0]);
}

export function esImporte(texto: string, anterior: string): boolean {
  return tramosDeImporte(texto, anterior).length > 0;
}

export async function taparMontosEnPdf(bytes: Uint8Array): Promise<{ pdf: Uint8Array; tapados: number }> {
  // En el servidor de Vercel no existe DOMMatrix (acá lo pone @napi-rs/canvas,
  // que allá no está) y pdfjs lo pide al cargarse: «DOMMatrix is not defined».
  // Para leer el texto basta una matriz 2D afín.
  const gm = globalThis as { DOMMatrix?: unknown };
  if (typeof gm.DOMMatrix === "undefined") gm.DOMMatrix = Matriz2D;
  // El «worker» de pdfjs se carga en el mismo hilo: empaquetado, pdfjs no
  // encuentra su archivo aparte y falla con «Setting up fake worker failed».
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error -- el worker de pdfjs no publica tipos; solo se entrega a pdfjs.
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const lector = await getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fuente = await pdf.embedFont(StandardFonts.HelveticaBold);
  let tapados = 0;

  for (let n = 1; n <= lector.numPages; n++) {
    const pagina = await lector.getPage(n);
    const contenido = await pagina.getTextContent();
    const destino = pdf.getPage(n - 1);
    let anterior = "";
    for (const item of contenido.items) {
      if (!("str" in item)) continue;
      const texto = item.str;
      const tramos = tramosDeImporte(texto, anterior);
      if (tramos.length) {
        const [, , c, d, x, y] = item.transform as number[];
        const alto = Math.max(Math.hypot(c, d), item.height || 0, 6);
        // Sin las métricas de la fuente, la posición de la cifra dentro de la
        // frase se reparte en proporción a los caracteres, con un margen.
        const porLetra = (item.width || alto * 0.5 * texto.length) / Math.max(texto.length, 1);
        for (const [desde, hasta] of tramos) {
          const x0 = x + desde * porLetra - porLetra * 0.5;
          const ancho = (hasta - desde) * porLetra + porLetra;
          destino.drawRectangle({ x: x0, y: y - alto * 0.3, width: ancho, height: alto * 1.35, color: rgb(1, 1, 1) });
          destino.drawText("*****", { x: x0 + porLetra * 0.5, y, size: Math.min(alto, 10), font: fuente, color: rgb(0.35, 0.35, 0.35) });
          tapados++;
        }
      }
      if (texto.trim()) anterior = texto;
    }
  }
  await lector.cleanup();
  return { pdf: await pdf.save(), tapados };
}

/** Lo mínimo de DOMMatrix (2D afín) que pdfjs usa para leer texto. */
class Matriz2D {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(init?: number[]) {
    if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
  }
  get is2D() { return true; }
  get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
  private por(m: Matriz2D, antes: boolean): this {
    const [x, y] = antes ? [m, this] : [this, m];
    const r = [x.a * y.a + x.c * y.b, x.b * y.a + x.d * y.b, x.a * y.c + x.c * y.d, x.b * y.c + x.d * y.d, x.a * y.e + x.c * y.f + x.e, x.b * y.e + x.d * y.f + x.f];
    [this.a, this.b, this.c, this.d, this.e, this.f] = r;
    return this;
  }
  multiplySelf(m: Matriz2D) { return this.por(m, false); }
  preMultiplySelf(m: Matriz2D) { return this.por(m, true); }
  multiply(m: Matriz2D) { return new Matriz2D([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(m); }
  translate(x = 0, y = 0) { return this.multiply(new Matriz2D([1, 0, 0, 1, x, y])); }
  translateSelf(x = 0, y = 0) { return this.multiplySelf(new Matriz2D([1, 0, 0, 1, x, y])); }
  scale(x = 1, y = x) { return this.multiply(new Matriz2D([x, 0, 0, y, 0, 0])); }
  scaleSelf(x = 1, y = x) { return this.multiplySelf(new Matriz2D([x, 0, 0, y, 0, 0])); }
  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (!det) { [this.a, this.b, this.c, this.d, this.e, this.f] = [NaN, NaN, NaN, NaN, NaN, NaN]; return this; }
    const { a, b, c, d, e, f } = this;
    [this.a, this.b, this.c, this.d, this.e, this.f] = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
    return this;
  }
  inverse() { return new Matriz2D([this.a, this.b, this.c, this.d, this.e, this.f]).invertSelf(); }
  transformPoint(p: { x?: number; y?: number }) {
    const x = p.x ?? 0, y = p.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }
}
