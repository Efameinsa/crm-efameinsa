import { describe, it, expect } from "vitest";
import { bloquesATexto, textoABloques, fichaEsEditable, type BloqueFicha } from "./ficha-texto";

describe("la ficha como texto", () => {
  const bloques: BloqueFicha[] = [
    { t: "titulo", texto: "CARACTERÍSTICAS" },
    { t: "vineta", texto: "Calentamiento con termostato regulable" },
    { t: "subtitulo", texto: "Calderín" },
    { t: "dato", rotulo: "Presión de vapor", valor: "2.5 Bar" },
    { t: "vineta", texto: "Incluye: manguera, filtro y llave" },
  ];

  it("escribe cada forma como se lee", () => {
    expect(bloquesATexto(bloques).split("\n")).toEqual([
      "# CARACTERÍSTICAS",
      "- Calentamiento con termostato regulable",
      "## Calderín",
      "Presión de vapor: 2.5 Bar",
      "- Incluye: manguera, filtro y llave",
    ]);
  });

  it("vuelve a los mismos bloques", () => {
    expect(textoABloques(bloquesATexto(bloques))).toEqual(bloques);
  });

  it("una viñeta con dos puntos sigue siendo viñeta, no un dato", () => {
    expect(textoABloques("- Incluye: manguera")).toEqual([{ t: "vineta", texto: "Incluye: manguera" }]);
  });

  it("una línea suelta con dos puntos es un dato", () => {
    expect(textoABloques("Capacidad: 55 kg")).toEqual([{ t: "dato", rotulo: "Capacidad", valor: "55 kg" }]);
  });

  it("las líneas en blanco no ensucian la ficha", () => {
    expect(textoABloques("# UNO\n\n\n- dos\n   \n")).toHaveLength(2);
  });

  it("reconoce las fichas que no sobreviven la ida y vuelta", () => {
    expect(fichaEsEditable(bloques)).toBe(true);
    // Un dato sin rótulo se escribiría «: 55 kg» y volvería como viñeta.
    expect(fichaEsEditable([{ t: "dato", rotulo: "", valor: "55 kg" }])).toBe(false);
    // Una viñeta vacía se escribiría «- » y volvería como la viñeta «-».
    expect(fichaEsEditable([{ t: "vineta", texto: "" }])).toBe(false);
  });
});
