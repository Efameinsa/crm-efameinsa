import { describe, expect, it } from "vitest";
import { productoDelTexto, sugerirModelos, textoDelModelo, type ModeloCatalogo } from "./modelos-catalogo";

const catalogo: ModeloCatalogo[] = [
  { id: "1", nombre: "LAVADORA C. APILABLE", marca: "LG", modelo: "TITAN MAX\nCWT29MDCRS", capacidad: null },
  { id: "2", nombre: "SECADORA C. NO APILABLE", marca: "LG", modelo: "TITAN LIGHT", capacidad: null },
  { id: "3", nombre: "SECADORA INDUSTRIAL MOD. UT075", marca: "UNIMAC", modelo: "UT075", capacidad: "34 kg" },
  { id: "4", nombre: "SECADORA INDUSTRIAL", marca: "UNIMAC", modelo: "UT170", capacidad: "77 kg" },
  { id: "5", nombre: "SECADORA INDUSTRIAL", marca: "UNIMAC", modelo: "UT170", capacidad: "77 kg" },
  { id: "6", nombre: "Planchadora de rodillo", marca: "GMP Itália", modelo: "E2 120.25", capacidad: null },
];

describe("textoDelModelo", () => {
  it("suma marca y modelo cuando el nombre no los dice, sin saltos de línea", () => {
    expect(textoDelModelo(catalogo[0])).toBe("LAVADORA C. APILABLE · LG TITAN MAX CWT29MDCRS");
  });
  it("no repite lo que el nombre ya dice", () => {
    expect(textoDelModelo(catalogo[2])).toBe("SECADORA INDUSTRIAL MOD. UT075 · UNIMAC · 34 kg");
  });
});

describe("sugerirModelos", () => {
  it("«Titan» sugiere las Titan de LG", () => {
    expect(sugerirModelos(catalogo, "titan").map((p) => p.id)).toEqual(["1", "2"]);
  });
  it("todas las palabras, en cualquier orden y sin tildes", () => {
    expect(sugerirModelos(catalogo, "light secadora").map((p) => p.id)).toEqual(["2"]);
    expect(sugerirModelos(catalogo, "gmp italia").map((p) => p.id)).toEqual(["6"]);
  });
  it("no repite el mismo equipo cargado dos veces", () => {
    expect(sugerirModelos(catalogo, "ut170").map((p) => p.id)).toEqual(["4"]);
  });
  it("con una letra no sugiere nada", () => {
    expect(sugerirModelos(catalogo, "t")).toEqual([]);
  });
  it("una máquina de la competencia no casa con nada y se escribe libre", () => {
    expect(sugerirModelos(catalogo, "Speed Queen SC20")).toEqual([]);
    expect(productoDelTexto(catalogo, "Speed Queen SC20")).toBeNull();
  });
  it("reconoce el producto cuando se eligió la sugerencia", () => {
    expect(productoDelTexto(catalogo, textoDelModelo(catalogo[1]))?.id).toBe("2");
  });
});
