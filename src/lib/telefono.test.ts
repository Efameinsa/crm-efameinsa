import { describe, expect, it } from "vitest";
import { celularesDe, normalizarTelefono } from "./telefono";

// Debe coincidir exactamente con normalizar_telefono() de
// supabase/migrations/0001_esquema_inicial.sql — la columna generada
// telefono_normalizado usa esa función SQL, y este es su gemelo en JS.
describe("normalizarTelefono", () => {
  it("null/undefined/vacío → null", () => {
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono(undefined)).toBeNull();
    expect(normalizarTelefono("")).toBeNull();
  });

  it("quita todo lo que no sea dígito", () => {
    expect(normalizarTelefono("981-488-958")).toBe("981488958");
    expect(normalizarTelefono("(981) 488 958")).toBe("981488958");
  });

  it("quita el prefijo 51 solo si el número queda con más de 9 dígitos", () => {
    expect(normalizarTelefono("51981488958")).toBe("981488958");
    expect(normalizarTelefono("+51 981 488 958")).toBe("981488958");
  });

  it("un número de 9 dígitos que empieza con 51 NO pierde el prefijo (no es +51, es el número real)", () => {
    expect(normalizarTelefono("511234567")).toBe("511234567");
  });

  it("número local de 9 dígitos sin prefijo se conserva igual", () => {
    expect(normalizarTelefono("981488958")).toBe("981488958");
  });

  it("solo texto sin dígitos → cadena vacía (no null)", () => {
    expect(normalizarTelefono("sin teléfono")).toBe("");
  });
});

// Gemelo de celulares_de() en supabase/migrations/0201_*.sql. Los casos son
// los reales del reclamo de postventa del 09-09.
describe("celularesDe", () => {
  it("sin nada que leer → lista vacía", () => {
    expect(celularesDe(null)).toEqual([]);
    expect(celularesDe(undefined)).toEqual([]);
    expect(celularesDe("")).toEqual([]);
    expect(celularesDe("sin teléfono")).toEqual([]);
  });

  it("el número tal cual, con o sin espacios", () => {
    expect(celularesDe("956 181 464")).toEqual(["956181464"]);
    expect(celularesDe("933763742")).toEqual(["933763742"]);
  });

  it("con el prefijo 51, con o sin +", () => {
    expect(celularesDe("+51 987 524 031")).toEqual(["987524031"]);
    expect(celularesDe("51987524031")).toEqual(["987524031"]);
  });

  it("un dígito de más adelante no lo esconde (PRO-09181, GRUPO SANTA ELENA)", () => {
    expect(celularesDe("1 956 181 464")).toEqual(["956181464"]);
  });

  it("el mismo número dos veces es un solo número (PRO-09165, NEWREST)", () => {
    expect(celularesDe("987524031 / 987524031")).toEqual(["987524031"]);
  });

  it("dos números distintos son dos, y no inventa el del medio", () => {
    expect(celularesDe("989 001 284 // 942 710 197")).toEqual(["989001284", "942710197"]);
    expect(celularesDe("989 001 284 // 942 710 197")).not.toContain("900128494");
  });

  it("el extranjero con su prefijo no se hace pasar por peruano", () => {
    expect(celularesDe("+593984666031")).toEqual([]);
    expect(celularesDe("+34604318772")).toEqual([]);
  });

  it("un fijo de 8 dígitos no es celular", () => {
    expect(celularesDe("73271348")).toEqual([]);
    expect(celularesDe("98989898")).toEqual([]);
  });
});
