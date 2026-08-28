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
    // La descripción del maestro2 de Lesly (25-08), tal cual la fila.
    descripcion:
      "LAVADORA IND.RIGIDA, MOD:RX135, FUERZA: 200G, X CONTROL, OPL, P.SUPERIOR INOX, P.LATERAL y FRONTAL GRIS, CILINDRO INOX, BOILER FED, CON AGUJERO PARA TOLVA DE JABÓN, CAP.14 KG, 220/60HZ/1PH, C/USB.",
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

// La descripción del maestro de Lesly entra al texto buscable (25-08): es el
// vocabulario con el que las comerciales piden las máquinas, y hasta ahora
// solo vivía en el Excel.
describe("búsqueda por la descripción del maestro", () => {
  it("«lavadora x control 200g» encuentra la RX135 aunque el nombre no lo diga", () => {
    const r = buscarEquipos(CATALOGO, "lavadora x control 200g");
    expect(r.map((e) => e.id)).toContain("rx135");
  });

  it("«boiler fed» encuentra por la descripción", () => {
    const r = buscarEquipos(CATALOGO, "boiler fed");
    expect(r[0]?.id).toBe("rx135");
  });
});

describe("apilable y no apilable (LG)", () => {
  /* En LG la misma máquina se vende de las dos formas y el maestro lo escribe
     como «SINGLE», que no es como lo pide nadie: por eso el montaje viaja
     aparte y entra en el texto contra el que se busca (28-08). */
  const lg = [
    { sku: "LAVMA17", marca: "LG", modelo: "TITAN MAX", nombre: "LAVADORA C. APILABLE", montaje: "Apilable",
      descripcion: "LAVADORA C., FLOT., MARCA: LG, MOD.: TITAN MAX APILABLE, CAP:17KG" },
    { sku: "LAVMA172", marca: "LG", modelo: "TITAN MAX", nombre: "LAVADORA C. NO APILABLE", montaje: "No apilable",
      descripcion: "LAVADORA C., FLOT., MARCA: LG, MOD.: TITAN MAX SINGLE, CAP:17KG" },
  ];

  it("«no apilable» encuentra la que no lo es, aunque el maestro diga SINGLE", () => {
    expect(buscarEquipos(lg, "no apilable")[0].sku).toBe("LAVMA172");
  });

  it("«apilable» sigue devolviendo las dos, con la apilable primero", () => {
    expect(buscarEquipos(lg, "titan max apilable")[0].sku).toBe("LAVMA17");
  });
});
