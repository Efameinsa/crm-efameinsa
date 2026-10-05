import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { quitarPaginasEnBlanco, textosPorPagina } from "./paginas-en-blanco";

/**
 * Se arman PDFs de verdad con pdf-lib en vez de fingir el contador: lo que hay
 * que comprobar es que la lectura de los textos sobreviva a la compresión y a
 * la forma en que se guardan los contenidos, que es justo donde esto se podría
 * romper en silencio.
 *
 * Cada hoja lleva la papelería de OPEN (wordmark, subtítulo y dirección: tres
 * textos, como react-pdf la repite en cada página) más `cuantos` textos
 * propios de esa hoja.
 */
const PAPELERIA = ["OPEN INVESTMENTS S.A.C", "Laundry & Equipment", "Av. Los Cisnes Mz. H-2 Lt. 18"];

async function pdfCon(hojas: (number | string[])[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  hojas.forEach((hoja, n) => {
    const p = doc.addPage([595, 842]);
    const propios = Array.isArray(hoja) ? hoja : Array.from({ length: hoja }, (_, i) => `hoja ${n + 1} linea ${i}`);
    [...PAPELERIA, ...propios].forEach((t, i) => p.drawText(t, { x: 50, y: 800 - i * 12, size: 10, font: fuente }));
  });
  return doc.save();
}

describe("páginas en blanco de un PDF", () => {
  it("cuenta cuántas veces dibuja texto cada página", async () => {
    expect(await textosPorPagina(await pdfCon([20, 0, 15]))).toEqual([23, 3, 18]);
  });

  it("quita la hoja que solo trae el membrete", async () => {
    // Como la cotización real que lo destapó: 6 hojas y la cuarta sin nada propio.
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([57, 84, 85, 0, 57, 15]));
    expect(quitadas).toEqual([4]);
    expect(await textosPorPagina(pdf)).toEqual([60, 87, 88, 60, 18]);
  });

  it("quita varias y conserva el orden del resto", async () => {
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([40, 0, 30, 0, 20, 12]));
    expect(quitadas).toEqual([2, 4]);
    expect(await textosPorPagina(pdf)).toEqual([43, 33, 23, 15]);
  });

  it("no quita la hoja a la que se pasó solo el total (Brenda, 876-26, 05-10)", async () => {
    // Seis equipos: la última fila del resumen no entró en la primera hoja.
    // Tres textos propios + tres de papelería = seis, debajo del umbral de
    // ocho; con solo contar se borraba y al cliente le llegaba sin el total.
    const { quitadas } = await quitarPaginasEnBlanco(
      await pdfCon([90, ["TOTAL INCLUIDO IGV A PAGAR", "US$", "26,030.80"], 80, 80, 60, 0, 15]),
    );
    expect(quitadas).toEqual([6]);
  });

  it("no quita la hoja con la última viñeta de una ficha", async () => {
    const { quitadas } = await quitarPaginasEnBlanco(await pdfCon([60, 80, ["Peso neto", ": 87 kg"], 15]));
    expect(quitadas).toEqual([]);
  });

  it("no toca un documento sano", async () => {
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([40, 30, 15]));
    expect(quitadas).toEqual([]);
    expect(await textosPorPagina(pdf)).toEqual([43, 33, 18]);
  });

  it("la página de cierre, que es la más pobre de verdad, no se considera vacía", async () => {
    // 15 textos: «Agradeciendo su atención», la firma y sus datos.
    const { quitadas } = await quitarPaginasEnBlanco(await pdfCon([57, 84, 15]));
    expect(quitadas).toEqual([]);
  });

  it("si casi todo pareciera vacío, no se toca nada: falló la detección, no el PDF", async () => {
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([0, 0, 0, 40]));
    expect(quitadas).toEqual([]);
    expect(await textosPorPagina(pdf)).toHaveLength(4);
  });
});
