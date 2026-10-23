import { describe, expect, it } from "vitest";
import { conZumbido, pideZumbido } from "@/lib/zumbido";

describe("zumbido del «Apurar»", () => {
  it("solo el 1.º y el 2.º apuro llevan zumbido", () => {
    expect(pideZumbido({ titulo: conZumbido("Cliente: Ana apura a postventa", 1) })).toBe(true);
    expect(pideZumbido({ titulo: conZumbido("Cliente: Ana apura a postventa", 2) })).toBe(true);
    expect(pideZumbido({ titulo: conZumbido("Cliente: Ana apura a postventa", 3) })).toBe(false);
  });
  it("un aviso cualquiera no zumba", () => {
    expect(pideZumbido({ titulo: "Nuevo pedido" })).toBe(false);
    expect(pideZumbido({ titulo: null })).toBe(false);
  });
});
