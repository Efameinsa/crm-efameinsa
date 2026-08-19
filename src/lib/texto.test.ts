import { describe, expect, it } from "vitest";
import { tokenizarBusqueda } from "./texto";

// Alimenta el pre-filtro de derivación (buscarCoincidencias) — el caso real
// que Carlos validó en vivo fue "María Leguía" → debía encontrar a
// "MARIA LEGUIA" en la base sin que la tilde lo bloqueara.
describe("tokenizarBusqueda", () => {
  it("quita tildes para poder cruzar contra texto sin tildes en la base (caso real: María Leguía)", () => {
    const [t1, t2] = tokenizarBusqueda("María Leguía");
    expect(t1.normalize("NFC")).toBe("Maria");
    expect(t2.normalize("NFC")).toBe("Leguia");
  });

  it("descarta tokens de menos de 3 letras (ruido: preposiciones, siglas)", () => {
    expect(tokenizarBusqueda("SA de CV Enrique")).toEqual(["Enrique"]);
  });

  it("se queda con máximo 4 tokens", () => {
    expect(tokenizarBusqueda("Corporacion Industrial Del Peru Sociedad Anonima")).toHaveLength(4);
  });

  it("colapsa espacios múltiples", () => {
    expect(tokenizarBusqueda("Juan   Perez")).toEqual(["Juan", "Perez"]);
  });

  it("texto vacío → sin tokens", () => {
    expect(tokenizarBusqueda("")).toEqual([]);
  });

  it("solo ruido corto → sin tokens", () => {
    expect(tokenizarBusqueda("SA CV LA")).toEqual([]);
  });
});
