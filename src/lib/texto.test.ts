import { describe, expect, it } from "vitest";
import { nombrePropio, tokenizarBusqueda } from "./texto";

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

describe("nombrePropio", () => {
  it("pasa un nombre en mayúsculas a primera letra mayúscula", () => {
    expect(nombrePropio("JUAN PEREZ GONZALES")).toBe("Juan Perez Gonzales");
  });

  it("deja las partículas en minúscula, salvo al principio", () => {
    expect(nombrePropio("MARIA DE LOS ANGELES")).toBe("Maria de los Angeles");
    expect(nombrePropio("DE LA CRUZ ROJAS")).toBe("De la Cruz Rojas");
  });

  it("no toca lo que ya tiene minúsculas", () => {
    expect(nombrePropio("Jorge McDonald")).toBe("Jorge McDonald");
    expect(nombrePropio("LG Perú")).toBe("LG Perú");
  });

  it("respeta guiones y apóstrofos", () => {
    expect(nombrePropio("JEAN-PIERRE D'ANGELO")).toBe("Jean-Pierre D'Angelo");
  });

  it("normaliza los espacios de más", () => {
    expect(nombrePropio("  ANA   TORRES  ")).toBe("Ana Torres");
  });

  it("con cadena vacía no revienta", () => {
    expect(nombrePropio("   ")).toBe("");
  });
});
