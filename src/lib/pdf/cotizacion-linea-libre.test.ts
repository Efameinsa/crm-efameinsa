import { test, expect } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderizarCotizacionPdf, type CotizacionParaPdf } from "@/lib/pdf/armar-cotizacion";

/**
 * La cotización de postventa: un mantenimiento y un repuesto, ninguno en el
 * catálogo (el catálogo son 149 máquinas, ni un servicio).
 *
 * Se prueba sobre el PDF de verdad y leyendo su texto, no sobre el árbol de
 * componentes: lo que importa es lo que le llega al cliente. Antes de esto,
 * cotizar un mantenimiento obligaba a escribirlo en Word con un correlativo a
 * mano —iban por el 2202— y esa serie paralela después no cuadra con el CRM.
 */
async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    texto += c.items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return texto;
}

const linea = (descripcion: string, cantidad: number, precio: number) => ({
  cantidad, precio_unitario: precio, descripcion, color: null, productos: null,
});

test("una cotización de líneas escritas a mano se imprime y se lee bien", async () => {
  const cot = {
    codigo: "Presu_9999-26", correlativo: 9999, serie: "EFAMEINSA", moneda: "USD",
    moneda_impresa: "USD", tipo_cambio: null, condiciones: null, vigencia_dias: 15,
    entrega_lugar: null, tiempo_entrega: "Inmediata", garantia: "3 meses",
    forma_pago: "50 %", saldo: "50 %", created_at: new Date().toISOString(),
    cliente_snapshot: { razon_social: "HOTEL DE PRUEBA S.A.C.", tipo_doc: "RUC", num_doc: "20000000001", direccion: "Lima" },
    cotizacion_items: [
      linea("Mantenimiento preventivo de lavadora 17 kg", 1, 350),
      linea("Resistencia 3 kW", 2, 120),
    ],
    oportunidades: null,
    perfiles: { nombre: "Postventa", cargo: "Postventa", telefono: null, celular: null, email_contacto: null, email_open: null },
  } as unknown as CotizacionParaPdf;

  const bytes = new Uint8Array(await renderizarCotizacionPdf(cot));
  expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");

  const texto = await textoDelPdf(bytes);
  // El concepto llega al cliente tal como se escribió (el PDF va en versales).
  expect(texto).toContain("MANTENIMIENTO PREVENTIVO DE LAVADORA 17 KG");
  expect(texto).toContain("RESISTENCIA 3 KW");
  // Las cuentas salen: 350 + 2×120 = 590, IGV 106.20.
  expect(texto).toContain("590.00");
  expect(texto).toContain("106.20");
  // Y NO sale «MARCA: — · MODELO: —»: un mantenimiento no tiene marca, y ese
  // renglón se leía como un dato que faltó cargar.
  expect(texto).not.toContain("MARCA: —");
}, 60000);

test("el concepto escrito en varios renglones sale en varios renglones", async () => {
  // Como lo hacía postventa en Word (18-09): el servicio arriba y debajo la
  // marca, el modelo, las medidas y la serie de la máquina, cada uno en su
  // línea. Si el PDF aplastara los saltos, el cliente leería todo corrido.
  const cot = {
    codigo: "Presu_9998-26", correlativo: 9998, serie: "OPEN", moneda: "USD",
    moneda_impresa: "USD", tipo_cambio: null, condiciones: null, vigencia_dias: 15,
    entrega_lugar: "Entrega en las instalaciones del cliente.", tiempo_entrega: "Inmediata", garantia: "Garantía del servicio",
    forma_pago: "50 %", saldo: "50 %", created_at: new Date().toISOString(),
    cliente_snapshot: { razon_social: "MEDICINA DE PRUEBA EIRL", tipo_doc: "RUC", num_doc: "20000000002", direccion: "Lima" },
    cotizacion_items: [
      linea("Servicio de mantenimiento correctivo de rodillo de planchado industrial\nMARCA: GMP\nMODELO: G14.25\nMEDIDAS: 1450x270mm\nSERIE: 2021131000134", 1, 550),
    ],
    oportunidades: null,
    perfiles: { nombre: "Postventa", cargo: "Postventa", telefono: null, celular: null, email_contacto: null, email_open: null },
  } as unknown as CotizacionParaPdf;

  const bytes = new Uint8Array(await renderizarCotizacionPdf(cot));
  const copia = bytes.slice();
  const doc = await getDocument({ data: bytes }).promise;
  const contenido = await (await doc.getPage(1)).getTextContent();
  const renglones = contenido.items.map((x) => ("str" in x ? x.str : "")).filter(Boolean);
  // Cada dato ocupa su propio fragmento de texto: no vienen pegados en uno.
  expect(renglones.some((r) => r.trim() === "MARCA: GMP")).toBe(true);
  expect(renglones.some((r) => r.trim() === "SERIE: 2021131000134")).toBe(true);
  expect(renglones.some((r) => r.includes("MARCA: GMP") && r.includes("MODELO"))).toBe(false);
  // El lugar de entrega va en la última página, en «Importante».
  // (`getDocument` se queda con el buffer que le pasan: se le da una copia.)
  expect(await textoDelPdf(copia)).toContain("Entrega en las instalaciones del cliente.");
});
