import { describe, expect, it } from "vitest";
import { normalizarTelefono } from "./telefono";

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
