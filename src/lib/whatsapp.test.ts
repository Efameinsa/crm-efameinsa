import { describe, it, expect } from "vitest";
import { esIdentificadorWhatsapp, ventanaDe } from "@/lib/whatsapp";

// Las dos ventanas de Meta (0265): 24 h desde el último mensaje del cliente,
// y 72 h desde el clic en el anuncio. Se puede escribir mientras UNA esté
// abierta. Antes el CRM contaba 72 h desde el último mensaje: daba por
// abierta una ventana que Meta ya había cerrado.
const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

describe("la ventana para escribir por WhatsApp", () => {
  it("sin anuncio son 24 h desde el último mensaje del cliente", () => {
    expect(ventanaDe(haceHoras(23)).abierta).toBe(true);
    expect(ventanaDe(haceHoras(25)).abierta).toBe(false);
    expect(ventanaDe(haceHoras(23)).horas).toBe(24);
  });

  it("con anuncio se puede escribir hasta 72 h después del clic, aunque el cliente no haya vuelto a escribir", () => {
    const v = ventanaDe(haceHoras(30), haceHoras(30));
    expect(v.abierta).toBe(true);
    expect(v.horas).toBe(72);
    expect(ventanaDe(haceHoras(73), haceHoras(73)).abierta).toBe(false);
  });

  it("pasadas las 72 h del anuncio, manda la de 24 h del último mensaje", () => {
    // Clic hace 80 h, el cliente escribió hace 2: Meta permite responder.
    expect(ventanaDe(haceHoras(2), haceHoras(80)).abierta).toBe(true);
    expect(ventanaDe(haceHoras(2), haceHoras(80)).horas).toBe(24);
    // Clic hace 80 h y el cliente no escribe hace 30: cerrada.
    expect(ventanaDe(haceHoras(30), haceHoras(80)).abierta).toBe(false);
  });

  it("sin mensajes del cliente no hay ventana", () => {
    expect(ventanaDe(null).abierta).toBe(false);
  });
});

// Quien escribe con nombre de usuario de WhatsApp llega con un BSUID en vez de
// teléfono, y a ese se le escribe con `recipient` (29-09, error 131009).
describe("esIdentificadorWhatsapp", () => {
  it("reconoce el identificador de usuario de Meta (BSUID)", () => {
    expect(esIdentificadorWhatsapp("PE.1028809843524508")).toBe(true);
    expect(esIdentificadorWhatsapp("BR.1234567890")).toBe(true);
  });
  it("un teléfono sigue siendo teléfono", () => {
    expect(esIdentificadorWhatsapp("51952538982")).toBe(false);
    expect(esIdentificadorWhatsapp("+51952538982")).toBe(false);
    expect(esIdentificadorWhatsapp("")).toBe(false);
  });
});
