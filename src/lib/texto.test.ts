import { describe, expect, it } from "vitest";
import { nombrePropio, textoLegible, tokenizarBusqueda } from "./texto";

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

// Las notas de seguimiento vienen escritas enteras en mayúsculas o enteras en
// minúsculas. Carlos, 28-08: «visualmente se ve bien complicado… pero eso
// podría dar un error de marcas». Las dos mitades de esa frase son esta suite.
describe("textoLegible", () => {
  it("baja a castellano legible una nota escrita toda en mayúsculas", () => {
    expect(textoLegible("SE LLAMO AL CLIENTE Y NO CONTESTA. QUEDA VOLVER A LLAMAR EL LUNES.")).toBe(
      "Se llamo al cliente y no contesta. Queda volver a llamar el lunes.",
    );
  });

  it("también levanta la que vino toda en minúsculas", () => {
    expect(textoLegible("cliente pide cotizacion. se le envia hoy.")).toBe("Cliente pide cotizacion. Se le envia hoy.");
  });

  it("NO toca las marcas ni las siglas — es el reparo de Carlos", () => {
    expect(textoLegible("SE CAMBIO LA FAJA DE LA SECADORA LG TITAN MAX")).toBe(
      "Se cambio la faja de la secadora LG titan max",
    );
    expect(textoLegible("SE EMITIO FACTURA CON IGV A NOMBRE DE LAVANDERIA SAC")).toContain("IGV");
    expect(textoLegible("SE EMITIO FACTURA CON IGV A NOMBRE DE LAVANDERIA SAC")).toContain("SAC");
  });

  it("no baja a minúscula nada que lleve un dígito: es un modelo o una medida", () => {
    expect(textoLegible("MANTENIMIENTO DE LA RX280 DE 17KG A 220V")).toBe(
      "Mantenimiento de la RX280 de 17KG a 220V",
    );
  });

  it("deja intacto lo que alguien ya escribió en mixto", () => {
    const tal = "Se coordinó con el Sr. Pérez para el martes";
    expect(textoLegible(tal)).toBe(tal);
  });

  it("aguanta lo vacío sin romperse", () => {
    expect(textoLegible(null)).toBe("");
    expect(textoLegible("   ")).toBe("");
  });
});
