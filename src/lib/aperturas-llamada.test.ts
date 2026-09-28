import { describe, expect, it } from "vitest";
import { aQuienLeToca, borradorParaCliente, estadoApertura, limpiarBusqueda, numeroInforme } from "./aperturas-llamada";

describe("limpiarBusqueda", () => {
  it("saca lo que rompe el filtro y deja las palabras", () => {
    expect(limpiarBusqueda("  cruz,  gallegos (yoni)* ")).toBe("cruz gallegos yoni");
    expect(limpiarBusqueda("20604375038")).toBe("20604375038");
    expect(limpiarBusqueda(undefined)).toBe("");
  });
});

describe("numeroInforme", () => {
  it("sale como en el papel: 004-2026", () => {
    expect(numeroInforme({ correlativo: 4, anio: 2026 })).toBe("004-2026");
    expect(numeroInforme({ correlativo: 4, anio: 2026, es_prueba: true })).toBe("PRUEBA 004-2026");
    expect(numeroInforme({ correlativo: null, anio: 2026 })).toBeNull();
  });
});

const base = { anulada_at: null, enviada_cliente_at: null, revisada_at: null, informe_at: null, tomada_at: null };

describe("estadoApertura", () => {
  it("recorre el circuito en orden", () => {
    expect(estadoApertura(base)).toBe("enviada");
    expect(estadoApertura({ ...base, tomada_at: "x" })).toBe("en_gestion");
    expect(estadoApertura({ ...base, tomada_at: "x", informe_at: "x" })).toBe("informe_almacen");
    expect(estadoApertura({ ...base, informe_at: "x", revisada_at: "x" })).toBe("revisada");
    expect(estadoApertura({ ...base, informe_at: "x", revisada_at: "x", enviada_cliente_at: "x" })).toBe("enviada_cliente");
  });
  it("la anulada manda sobre todo lo demás", () => {
    expect(estadoApertura({ ...base, informe_at: "x", anulada_at: "x" })).toBe("anulada");
  });
  it("dice a quién le toca", () => {
    expect(aQuienLeToca("enviada")).toBe("almacen");
    expect(aQuienLeToca("informe_almacen")).toBe("postventa");
    expect(aQuienLeToca("enviada_cliente")).toBeNull();
  });
});

describe("borradorParaCliente", () => {
  it("parte del informe del almacén y agrega lo que falta", () => {
    const t = borradorParaCliente({ informe_almacen: "Área medida.", faltantes: "Válvula de gas\nManguera" });
    expect(t).toContain("Área medida.");
    expect(t).toContain("Válvula de gas");
  });
});
