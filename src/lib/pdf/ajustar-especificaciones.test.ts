import { describe, expect, it } from "vitest";
import {
  MAX_RENGLONES,
  ajustarEspecificaciones,
  anchoDeTexto,
  enRenglones,
} from "./ajustar-especificaciones";

/** Los seis rótulos del estándar y sus anchos (docs/14). */
const COLUMNAS_EQUIPO_6 = [18, 22, 27, 32, 33, 38];
const torreLG = [
  { titulo: "Marca", valor: "LG" },
  { titulo: "Modelo", valor: "GIANT C MAX\n(CWG27MDCRS\nCDG27MUCPS)" },
  { titulo: "Capacidad", valor: "10-13 kg" },
  { titulo: "Calentamiento", valor: "A Gas GLP/NATURAL" },
  { titulo: "Panel computarizado", valor: "Digital-Multifunción" },
  { titulo: "Controles Automático", valor: "220V/60Hz/1Ph" },
];

const MM = 2.8346;
const PADDING_PT = 4;
const renglonesDe = (texto: string) => texto.split("\n");
const entra = (texto: string, anchoMm: number, tamano: number) =>
  renglonesDe(texto).every((r) => anchoDeTexto(r, tamano) <= anchoMm * MM - PADDING_PT + 0.01);

describe("ajustarEspecificaciones", () => {
  const ajuste = ajustarEspecificaciones(torreLG, COLUMNAS_EQUIPO_6);

  it("respeta el ancho útil de la hoja", () => {
    expect(ajuste.anchos.reduce((a, b) => a + b, 0)).toBeCloseTo(170, 1);
  });

  it("ninguna casilla pasa de cuatro renglones", () => {
    for (const c of ajuste.casillas) {
      expect(renglonesDe(c.titulo).length, c.titulo).toBeLessThanOrEqual(MAX_RENGLONES);
      expect(renglonesDe(c.valor).length, c.valor).toBeLessThanOrEqual(MAX_RENGLONES);
    }
  });

  it("ningún renglón se sale de su casilla", () => {
    ajuste.casillas.forEach((c, i) => {
      expect(entra(c.titulo, ajuste.anchos[i], c.tamanoTitulo), c.titulo).toBe(true);
      expect(entra(c.valor, ajuste.anchos[i], c.tamanoValor), c.valor).toBe(true);
    });
  });

  it("no parte ninguna palabra: nunca aparece un guion de corte", () => {
    // El modelo de la torre llega en tres renglones y así se queda; lo que no
    // puede pasar es que un pedazo termine cortado a mitad de palabra.
    const modelo = ajuste.casillas[1].valor;
    expect(renglonesDe(modelo)).toEqual(["GIANT C MAX", "(CWG27MDCRS", "CDG27MUCPS)"]);
  });

  it("la columna apretada recibe ancho de la que va sobrada", () => {
    const modelo = ajuste.anchos[1];
    expect(modelo).toBeGreaterThan(COLUMNAS_EQUIPO_6[1]);
    // Y nadie queda tan angosto que su rótulo no se pueda leer.
    for (const a of ajuste.anchos) expect(a).toBeGreaterThanOrEqual(14);
  });

  it("cuando todo entra, los anchos del estándar quedan intactos", () => {
    const simple = ajustarEspecificaciones(
      [
        { titulo: "Marca", valor: "LG" },
        { titulo: "Modelo", valor: "FX135" },
        { titulo: "Capacidad", valor: "13 kg" },
        { titulo: "Calentamiento", valor: "Vapor" },
        { titulo: "Panel computarizado", valor: "Digital" },
        { titulo: "Controles Automático", valor: "220V" },
      ],
      COLUMNAS_EQUIPO_6,
    );
    expect(simple.anchos).toEqual(COLUMNAS_EQUIPO_6);
  });
});

describe("enRenglones", () => {
  it("corta por los espacios y respeta los saltos que ya trae el texto", () => {
    expect(enRenglones("A Gas GLP/NATURAL", 200, 10)).toEqual(["A Gas GLP/NATURAL"]);
    // Y si tampoco entra entera, corta por la barra sin agregar nada.
    expect(enRenglones("A Gas GLP/NATURAL", 40, 10)).toEqual(["A Gas", "GLP/", "NATURAL"]);
    // El guion que ya trae la palabra es un corte válido: no es un guion nuevo.
    expect(enRenglones("Digital-Multifunción", 45, 10)).toEqual(["Digital-", "Multifunción"]);
    expect(enRenglones("GIANT C MAX\nCDG27MUCPS", 200, 10)).toEqual(["GIANT C MAX", "CDG27MUCPS"]);
  });
});

describe("anchoDeTexto", () => {
  it("mide con los anchos reales de la Helvetica-Bold", () => {
    // Una «W» mayúscula es casi tres veces una «l»: estimar con un ancho medio
    // es lo que dejó pasar el desborde del modelo en mayúsculas.
    expect(anchoDeTexto("W", 10)).toBeCloseTo(9.44, 2);
    expect(anchoDeTexto("l", 10)).toBeCloseTo(2.78, 2);
    // Las tildes no cambian el ancho.
    expect(anchoDeTexto("Multifunción", 10)).toBeCloseTo(anchoDeTexto("Multifuncion", 10), 2);
  });
});
