import { describe, expect, it } from "vitest";
import { campanaDe, fuenteLegible, nombreDeCampana, origenDe } from "./campana";

// Los tres orígenes que pidió distinguir Santos el 11-09, más el intermedio.
describe("origenDe", () => {
  it("el formulario nativo de Google Ads (webhook)", () => {
    const o = origenDe({ canal: "formulario_web", fuente: "google_ads", gclid: "abc", utm_source: "google", utm_medium: "cpc" });
    expect(o).toMatchObject({ clave: "ads_form", plataforma: "google", urgente: true, etiqueta: "Formulario de Google Ads" });
  });

  it("la landing de campaña, con el prefijo nuevo y con el primero que se acordó", () => {
    expect(origenDe({ canal: "formulario_web", fuente: "web · landing · industrial · hotel · 30 kg", gclid: "x", utm_source: "google" })).toMatchObject({
      clave: "landing", plataforma: "google", urgente: true, etiqueta: "Landing de campaña · Google Ads",
    });
    expect(origenDe({ canal: "formulario_web", fuente: "web · campaña industrial · hotel", fbclid: "y" })).toMatchObject({
      clave: "landing", plataforma: "meta", etiqueta: "Landing de campaña · Meta",
    });
    // Landing sin identificador de clic (llegó por un enlace directo): sigue siendo landing.
    expect(origenDe({ canal: "formulario_web", fuente: "web · landing · secadoras" })).toMatchObject({ clave: "landing", plataforma: "otra" });
  });

  it("la web normal viniendo de un anuncio", () => {
    expect(origenDe({ canal: "formulario_web", fuente: "web · sitio · carrito de cotización", gclid: "x", utm_source: "google", utm_medium: "cpc" })).toMatchObject({
      clave: "web_campana", plataforma: "google", urgente: true, etiqueta: "Web · vino de Google Ads",
    });
  });

  it("la web orgánica: sin gclid, fbclid ni medio pagado", () => {
    expect(origenDe({ canal: "formulario_web", fuente: "web · sitio · calculadora, pidió asesora" })).toMatchObject({
      clave: "web_organico", plataforma: null, urgente: false, etiqueta: "Web · orgánico",
    });
    // utm_medium orgánico o de correo no es campaña pagada.
    expect(origenDe({ canal: "formulario_web", fuente: "web · sitio · contacto", utm_source: "newsletter", utm_medium: "email" })?.clave).toBe("web_organico");
    // Los formularios web viejos, sin fuente: también orgánicos.
    expect(origenDe({ canal: "formulario_web", fuente: null })?.clave).toBe("web_organico");
  });

  it("lo que registra Central por teléfono o WhatsApp no lleva origen", () => {
    expect(origenDe({ canal: "llamada", fuente: null })).toBeNull();
    expect(origenDe({ canal: "whatsapp", fuente: "referido" })).toBeNull();
  });

  it("un contacto de Central que trae gclid (lo anotó del cliente) sí marca la campaña", () => {
    expect(origenDe({ canal: "llamada", gclid: "z" })).toMatchObject({ clave: "web_campana", etiqueta: "Vino de Google Ads" });
  });
});

describe("campanaDe y ayudantes", () => {
  it("reconoce la plataforma por el clic o por utm_source", () => {
    expect(campanaDe({ gclid: "a" })?.plataforma).toBe("google");
    expect(campanaDe({ fbclid: "b" })?.plataforma).toBe("meta");
    expect(campanaDe({ utm_source: "instagram", utm_medium: "paidsocial" })?.plataforma).toBe("meta");
    expect(campanaDe({ utm_source: "google", utm_medium: "organic" })).toBeNull();
  });
  it("el id numérico de Google no es un nombre de campaña", () => {
    expect(nombreDeCampana("890384066")).toBeNull();
    expect(nombreDeCampana("Lavadoras industriales")).toBe("Lavadoras industriales");
  });
  it("la fuente legible pierde el prefijo de clasificación", () => {
    expect(fuenteLegible("web · landing · industrial · hotel · 30 kg")).toBe("industrial · hotel · 30 kg");
    expect(fuenteLegible("web · sitio · carrito de cotización")).toBe("carrito de cotización");
    expect(fuenteLegible("google_ads")).toBeNull();
  });
});
