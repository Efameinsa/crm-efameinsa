import { describe, expect, it } from "vitest";
import { esCategoriaDeEquipo, motivoParaGuardar, problemaSerie, seriePorDefecto } from "./serie-facturacion";

// La serie sale sola (gerencia, 21-10-2026): equipos con Efameinsa,
// repuestos y servicios con Open, sin pedir motivo.
describe("serie de facturación", () => {
  it("un equipo es lo que no es repuesto ni servicio", () => {
    expect(esCategoriaDeEquipo("lavadora")).toBe(true);
    expect(esCategoriaDeEquipo("coche")).toBe(true);
    expect(esCategoriaDeEquipo("repuesto")).toBe(false);
    expect(esCategoriaDeEquipo("Servicio")).toBe(false);
    expect(esCategoriaDeEquipo(null)).toBe(false);
  });

  it("con un equipo va EFAMEINSA; solo repuestos y servicios, OPEN", () => {
    expect(seriePorDefecto(["lavadora", "repuesto"], "OPEN")).toBe("EFAMEINSA");
    expect(seriePorDefecto(["repuesto", "servicio"], "EFAMEINSA")).toBe("OPEN");
  });

  it("sin nada reconocible decide quién cotiza", () => {
    expect(seriePorDefecto([], "EFAMEINSA")).toBe("EFAMEINSA");
    expect(seriePorDefecto([null, undefined], "OPEN")).toBe("OPEN");
  });

  it("ninguna serie pide motivo", () => {
    expect(problemaSerie("OPEN", null)).toBeNull();
    expect(problemaSerie("EFAMEINSA", null)).toBeNull();
  });

  it("en OPEN el motivo no se guarda", () => {
    expect(motivoParaGuardar("OPEN", "algo escrito antes")).toBeNull();
    expect(motivoParaGuardar("EFAMEINSA", "  insistió  ")).toBe("insistió");
    expect(motivoParaGuardar("EFAMEINSA", "   ")).toBeNull();
  });
});
