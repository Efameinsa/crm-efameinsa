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
