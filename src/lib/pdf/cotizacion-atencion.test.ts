import { test, expect } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { atencionDeLaCotizacion, renderizarCotizacionPdf, type CotizacionParaPdf } from "@/lib/pdf/armar-cotizacion";

/**
 * A quién va dirigida la cotización (0443, Gabriela 12-10): «los que aparecen
 * por defecto no son las personas con las cuales se realiza la cotización».
 * Sin destinatario propio sale el contacto principal de la ficha; con uno,
 * sale ese y no el de la ficha.
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

const base = (atencion: unknown) =>
  ({
    codigo: "Presu_9997-26", correlativo: 9997, serie: "EFAMEINSA", moneda: "USD",
    moneda_impresa: "USD", tipo_cambio: null, condiciones: null, vigencia_dias: 15,
    entrega_lugar: null, tiempo_entrega: "Inmediata", garantia: "3 meses",
    forma_pago: "50 %", saldo: "50 %", created_at: new Date().toISOString(),
    atencion_pdf: atencion,
    cliente_snapshot: { razon_social: "HOTEL DE PRUEBA S.A.", tipo_doc: "RUC", num_doc: "20000000003", direccion: "Cusco" },
    cotizacion_items: [{ cantidad: 1, precio_unitario: 100, descripcion: "Mantenimiento preventivo", color: null, productos: null }],
    oportunidades: {
      cuentas: {
        contactos: [{ nombre: "VELAOCHAGA CASTRO MIGUEL ANGEL", telefono: "961016158", email: "mvelaochaga@hotel.pe", es_principal: true }],
      },
    },
    perfiles: { nombre: "Postventa", cargo: "Postventa", telefono: null, celular: null, email_contacto: null, email_open: null },
  }) as unknown as CotizacionParaPdf;

test("sin destinatario propio sale el contacto principal de la ficha", async () => {
  const texto = await textoDelPdf(new Uint8Array(await renderizarCotizacionPdf(base(null))));
  expect(texto).toContain("VELAOCHAGA CASTRO MIGUEL ANGEL");
  expect(texto).toContain("mvelaochaga@hotel.pe");
}, 60000);

test("con destinatario propio sale ese, no el de la ficha", async () => {
  const cot = base({ nombre: "Sr. Richard Quispe", telefono: "984000111", email: "mantenimiento@hotel.pe" });
  const texto = await textoDelPdf(new Uint8Array(await renderizarCotizacionPdf(cot)));
  expect(texto).toContain("Richard Quispe");
  expect(texto).toContain("mantenimiento@hotel.pe");
  expect(texto).toContain("984000111");
  expect(texto).not.toContain("VELAOCHAGA");
  expect(texto).not.toContain("mvelaochaga@hotel.pe");
}, 60000);

test("un destinatario vacío cuenta como «el de la ficha»", () => {
  expect(atencionDeLaCotizacion(null)).toBeNull();
  expect(atencionDeLaCotizacion({ nombre: "  ", telefono: "", email: null })).toBeNull();
  expect(atencionDeLaCotizacion({ nombre: " Ana  Pérez ", telefono: "", email: null })).toEqual({ nombre: "Ana Pérez", telefono: null, email: null });
});
