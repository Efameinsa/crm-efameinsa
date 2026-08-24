import { describe, expect, it } from "vitest";
import { buscarEquipos, type EquipoBuscable } from "./buscar-equipo";

// Los equipos son los reales del catálogo, con sus datos tal como están
// cargados: es la única forma de que la prueba diga algo sobre lo que le pasa
// al comercial.
const CATALOGO: (EquipoBuscable & { id: string })[] = [
  {
    id: "fde",
    sku: "SECFDEE",
    marca: "PRIMUS",
    modelo: "FDE",
    nombre: "SECADORA ELECTRICA FDE SEMI INDUSTRIAL 10.2 kg",
    capacidad: "10.2 kg",
    calentamiento: "ELÉCTRICA",
  },
  {
    id: "nde",
    sku: "SECNDE",
    marca: "PRIMUS",
    modelo: "NDE",
    nombre: "SECADORA ELECTRICA NDE SEMI INDUSTRIAL 13.5 kg",
    capacidad: "13.5 kg",
    calentamiento: "ELÉCTRICA",
  },
  {
    id: "rx135",
    sku: "LAV135",
    marca: "PRIMUS RX135",
    modelo: "RX135",
    nombre: "LAVADORA IND.RIGIDA",
    capacidad: "15 kg",
    calentamiento: null,
  },
  {
    id: "titanmax",
    sku: "LAVTMAX17",
    marca: "LG LAVTMAX17",
    modelo: "TITAN MAX",
    nombre: "LAVADORA SECADORA SEMI INDUSTRIAL TORRE A GAS TITAN MAX 17 -15 KG",
    capacidad: "17 kg",
    calentamiento: "GAS",
  },
];

const ids = (consulta: string) => buscarEquipos(CATALOGO, consulta).map((e) => e.id);

describe("buscarEquipos", () => {
  it("encuentra por el modelo suelto", () => {
    expect(ids("fde")).toEqual(["fde"]);
    expect(ids("nde")).toEqual(["nde"]);
  });

  it("encuentra por SKU", () => {
    expect(ids("SECFDEE")).toEqual(["fde"]);
  });

  // El caso que falló de verdad el 24-08.
  it("con la frase entera devuelve los dos modelos pedidos, arriba", () => {
    const r = ids("secadoras electricas primus semi industrial modelo fde y nde");
    expect(r.slice(0, 2).sort()).toEqual(["fde", "nde"]);
  });

  it("tolera el plural", () => {
    expect(ids("secadoras electricas").sort()).toEqual(["fde", "nde"]);
  });

  it("ignora tildes en los dos sentidos", () => {
    expect(ids("electrica").sort()).toEqual(["fde", "nde"]);
    expect(ids("eléctrica").sort()).toEqual(["fde", "nde"]);
  });

  it("mantiene la precisión cuando todas las palabras coinciden", () => {
    expect(ids("primus rx135")).toEqual(["rx135"]);
    expect(ids("lg torre gas")).toEqual(["titanmax"]);
  });

  it("busca en el calentamiento, que solo vive en la ficha", () => {
    expect(ids("gas")).toEqual(["titanmax"]);
  });

  it("sin texto devuelve todo el catálogo", () => {
    expect(ids("")).toHaveLength(4);
    expect(ids("   de la  ")).toHaveLength(4);
  });

  it("no arrastra medio catálogo por una palabra floja", () => {
    // "industrial" está en el nombre de casi todos los equipos. Con una sola
    // coincidencia bastaba para sacarlos a todos; ahora se exige la mitad.
    expect(ids("plancha industrial vapor calandria")).toEqual([]);
  });

  it("nunca devuelve menos que la búsqueda estricta", () => {
    // "secadora" coincide con tres equipos; la estricta manda y salen los tres.
    expect(ids("secadora").sort()).toEqual(["fde", "nde", "titanmax"]);
  });
});
