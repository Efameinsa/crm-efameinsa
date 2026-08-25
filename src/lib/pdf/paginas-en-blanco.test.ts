import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { quitarPaginasEnBlanco, textosPorPagina } from "./paginas-en-blanco";

/**
 * Se arman PDFs de verdad con pdf-lib en vez de fingir el contador: lo que hay
 * que comprobar es que la cuenta de operadores de texto sobreviva a la
 * compresión y a la forma en que se guardan los contenidos, que es justo donde
 * esto se podría romper en silencio.
 */
async function pdfCon(textosPorHoja: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (const cuantos of textosPorHoja) {
    const p = doc.addPage([595, 842]);
    for (let i = 0; i < cuantos; i++) {
      p.drawText(`linea ${i}`, { x: 50, y: 800 - i * 12, size: 10, font: fuente });
    }
  }
  return doc.save();
}

describe("páginas en blanco de un PDF", () => {
  it("cuenta cuántas veces dibuja texto cada página", async () => {
    expect(await textosPorPagina(await pdfCon([20, 3, 15]))).toEqual([20, 3, 15]);
  });

  it("quita la hoja que solo trae el membrete", async () => {
    // Como la cotización real que lo destapó: 6 hojas y la cuarta con 3 textos.
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([57, 84, 85, 3, 57, 15]));
    expect(quitadas).toEqual([4]);
    expect(await textosPorPagina(pdf)).toEqual([57, 84, 85, 57, 15]);
  });

  it("quita varias y conserva el orden del resto", async () => {
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([40, 2, 30, 1, 20]));
    expect(quitadas).toEqual([2, 4]);
    expect(await textosPorPagina(pdf)).toEqual([40, 30, 20]);
  });

  it("no toca un documento sano", async () => {
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([40, 30, 15]));
    expect(quitadas).toEqual([]);
    expect(await textosPorPagina(pdf)).toEqual([40, 30, 15]);
  });

  it("la página de cierre, que es la más pobre de verdad, no se considera vacía", async () => {
    // 15 textos: «Agradeciendo su atención», la firma y sus datos.
    const { quitadas } = await quitarPaginasEnBlanco(await pdfCon([57, 84, 15]));
    expect(quitadas).toEqual([]);
  });

  it("si casi todo pareciera vacío, no se toca nada: falló la detección, no el PDF", async () => {
    const { pdf, quitadas } = await quitarPaginasEnBlanco(await pdfCon([2, 1, 3, 40]));
    expect(quitadas).toEqual([]);
    expect(await textosPorPagina(pdf)).toHaveLength(4);
  });
});
