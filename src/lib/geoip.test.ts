import { describe, expect, it } from "vitest";
import { esIpPrivada, etiquetaDe } from "./geoip";

// Lo que se puede probar sin salir a internet: qué IP no se le pregunta a nadie
// y cómo se lee la ubicación en la fila.
describe("esIpPrivada", () => {
  it("no manda a internet las IP de la red interna ni las locales", () => {
    for (const ip of ["192.168.1.40", "10.0.0.8", "172.16.4.2", "127.0.0.1", "::1"]) {
      expect(esIpPrivada(ip)).toBe(true);
    }
  });

  it("y sí resuelve las públicas, que son las que dicen dónde está la laptop", () => {
    expect(esIpPrivada("181.66.9.86")).toBe(false);
    expect(esIpPrivada("190.12.44.7")).toBe(false);
  });
});

describe("etiquetaDe", () => {
  it("arma la línea como se dice: ciudad, región, país", () => {
    expect(etiquetaDe({ ciudad: "Vitarte", region: "Lima region", pais: "Perú" })).toBe("Vitarte, Lima region, Perú");
  });

  it("no repite la región cuando es igual a la ciudad", () => {
    expect(etiquetaDe({ ciudad: "Lima", region: "Lima", pais: "Perú" })).toBe("Lima, Perú");
  });

  it("cuando el proveedor no supo ubicarla, lo dice en vez de inventar", () => {
    expect(etiquetaDe({ ciudad: null, region: null, pais: null })).toBe("Sin ubicar");
  });
});
