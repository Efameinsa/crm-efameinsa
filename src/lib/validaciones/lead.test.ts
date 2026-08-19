import { describe, expect, it } from "vitest";
import { esquemaCaptura } from "./lead";

describe("esquemaCaptura (captura manual de Central)", () => {
  const base = {
    canal: "whatsapp",
    area_destino: "comercial",
    nombre_contacto: "Juan Pérez",
  };

  it("acepta el mínimo válido (solo canal, área y nombre)", () => {
    const r = esquemaCaptura.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("nombre vacío falla", () => {
    const r = esquemaCaptura.safeParse({ ...base, nombre_contacto: "  " });
    expect(r.success).toBe(false);
  });

  it("canal fuera del catálogo falla", () => {
    const r = esquemaCaptura.safeParse({ ...base, canal: "telepatia" });
    expect(r.success).toBe(false);
  });

  it("correo con formato inválido falla, pero vacío es válido (opcional)", () => {
    expect(esquemaCaptura.safeParse({ ...base, email: "no-es-correo" }).success).toBe(false);
    expect(esquemaCaptura.safeParse({ ...base, email: "" }).success).toBe(true);
    expect(esquemaCaptura.safeParse({ ...base, email: "juan@efameinsa.com" }).success).toBe(true);
  });

  it("area_destino distinta de comercial también es válida (R1: triaje a otras áreas)", () => {
    const r = esquemaCaptura.safeParse({ ...base, area_destino: "servicio_tecnico" });
    expect(r.success).toBe(true);
  });
});
