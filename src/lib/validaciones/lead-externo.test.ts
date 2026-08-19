import { describe, expect, it } from "vitest";
import { esquemaLeadExterno } from "./lead-externo";

describe("esquemaLeadExterno (ingesta automática Meta/Google Ads)", () => {
  it("acepta el mínimo: canal + nombre; area_destino cae a 'comercial' por defecto", () => {
    const r = esquemaLeadExterno.safeParse({ canal: "facebook", nombre_contacto: "María Leguía" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.area_destino).toBe("comercial");
  });

  it("nombre es el único campo realmente obligatorio", () => {
    const r = esquemaLeadExterno.safeParse({ canal: "facebook", nombre_contacto: "" });
    expect(r.success).toBe(false);
  });

  it("acepta los campos de atribución de marketing", () => {
    const r = esquemaLeadExterno.safeParse({
      canal: "facebook",
      nombre_contacto: "Ana Torres",
      utm_campaign: "verano2026",
      fbclid: "abc123",
    });
    expect(r.success).toBe(true);
  });
});
