import { describe, expect, it } from "vitest";
import { tipoPastillaOrigen } from "./pastilla-origen-oportunidad";

// Desiré (C9), 01-10: la pastilla tiene que decir de un vistazo si la derivó
// Central o entró sola. Los `via` son los que devuelve listar_oportunidades()
// (0362): «canal · fuente» del lead que manda.
describe("tipoPastillaOrigen", () => {
  it("Central gana, venga por el canal que venga", () => {
    expect(tipoPastillaOrigen("central", "whatsapp")).toBe("central");
    expect(tipoPastillaOrigen("central", "llamada · llamada a postventa")).toBe("central");
  });
  it("chat de anuncio → Campaña WA; WhatsApp directo → WhatsApp", () => {
    expect(tipoPastillaOrigen("campana", "whatsapp · meta_ads")).toBe("campana_wa");
    expect(tipoPastillaOrigen("campana", "whatsapp · whatsapp")).toBe("whatsapp");
  });
  it("formularios de la web y de Google Ads → Web", () => {
    expect(tipoPastillaOrigen("campana", "formulario_web · google_ads")).toBe("web");
    expect(tipoPastillaOrigen("campana", "formulario_web · web · landing · industrial · 30 kg")).toBe("web");
  });
  it("las propias (y una base sin la 0362) no llevan pastilla", () => {
    expect(tipoPastillaOrigen("propia", null)).toBeNull();
    expect(tipoPastillaOrigen(undefined, undefined)).toBeNull();
  });
});
