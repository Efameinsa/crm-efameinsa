import { describe, expect, it } from "vitest";
import { armarIndustriales, armarLg, etiquetaModeloLg, proveedorDe, type FilaStockGeneral } from "./stock-general";
import { ubicacionDe } from "./stock-importaciones";

const fila = (x: Partial<FilaStockGeneral>): FilaStockGeneral => ({
  item: null,
  codigo: null,
  modelo: "",
  descripcion: "",
  serie: null,
  cantidad: 1,
  ubicacion: "PLANTA",
  marca: null,
  proveedor: null,
  esLg: false,
  ...x,
});

describe("resumen general de stock — industriales (formato de Importaciones, 22-10)", () => {
  const filas = [
    fila({ item: "I25014", codigo: "LAV2801", modelo: "RX280", descripcion: "LAVADORA IND. RIGIDA MOD RX280", serie: "280RX006222ZF", marca: "PRIMUS", proveedor: "ALLIANCES LAUNDRY" }),
    fila({ item: "I25257", codigo: "SECU75E", modelo: "UT075E", descripcion: "SECADORA INDUSTRIAL, MOD. UT075E", serie: "2510062213", marca: "UNIMAC", proveedor: "ALLIANCES LAUNDRY" }),
    fila({ item: "I22899", codigo: "LAVT040", modelo: "UCT040", descripcion: "LAVADORA INDUSTRIAL, MOD: UCT040", serie: "2502043640", marca: "UNIMAC", proveedor: "ALLIANCES LAUNDRY" }),
    fila({ item: "I25024", codigo: "CAL2635", modelo: "G26.35", descripcion: "RODILLO PLANCHADOR MOD. G26.35", serie: "202517150095", marca: "GM", proveedor: "GMP" }),
    fila({ item: "I25100", codigo: "MEBIMAP", modelo: "MESA", descripcion: "MESA DE PLANCHADO BIMAP", serie: null, cantidad: 5, marca: "BIMAP", proveedor: "BIMAP" }),
    // Sin serie y con 0: el Excel la lista, pero no hay stock → no sale.
    fila({ item: "I25059", codigo: "CO402A", modelo: "HM-402", descripcion: "CARRO DE LAVANDERIA", serie: null, cantidad: 0, marca: "HEGMEI", proveedor: "HEGMEI" }),
    fila({ item: "I25158", codigo: "SECMAX152", modelo: "TITAN LIGHT CDT29MSCPS", descripcion: "SECADORA C. GAS LG", serie: "601KWRE2N078", marca: "LG", esLg: true }),
  ];

  it("agrupa por proveedor (Alliance primero, luego GMP y el resto) y por tipo, lavadoras antes que secadoras, con totales", () => {
    const { bloques, total } = armarIndustriales(filas);
    expect(bloques.map((b) => b.proveedor)).toEqual(["ALLIANCE", "GMP", "BIMAP"]);
    const alliance = bloques[0];
    expect(alliance.secciones.map((s) => s.titulo)).toEqual(["LAVADORAS", "SECADORAS"]);
    // Primus antes que Unimac dentro de las lavadoras.
    expect(alliance.secciones[0].filas.map((f) => f.marca)).toEqual(["PRIMUS", "UNIMAC"]);
    expect(alliance.total).toBe(3);
    expect(bloques[1].secciones[0].titulo).toBe("RODILLOS PLANCHADORES / CALANDRIAS");
    // Las mesas sin serie cuentan por cantidad.
    expect(bloques[2].total).toBe(5);
    expect(total).toBe(9);
  });

  it("LG no entra en el documento de industriales", () => {
    const { bloques } = armarIndustriales(filas);
    expect(bloques.flatMap((b) => b.secciones.flatMap((s) => s.filas)).some((f) => f.esLg)).toBe(false);
  });

  it("deduce el proveedor por la marca cuando el almacén no lo trae, y corrige «GM»", () => {
    expect(proveedorDe({ proveedor: null, marca: "UNIMAC" })).toBe("ALLIANCE");
    expect(proveedorDe({ proveedor: null, marca: "GM" })).toBe("GMP");
    expect(proveedorDe({ proveedor: "SIDI MONDIAL", marca: "ARIES" })).toBe("SIDI MONDIAL");
  });
});

describe("resumen general de stock — LG consolidado por modelo", () => {
  const lg = (x: Partial<FilaStockGeneral>) => fila({ marca: "LG", esLg: true, ...x });
  const filas = [
    lg({ codigo: "SECMAX152", modelo: "TITAN LIGHT CDT29MSCPS", descripcion: "SECADORA C. GAS LG C/S OPL, MOD. TITAN LIGHT CAP. 15 KG", serie: "601KWRE2N078" }),
    lg({ codigo: "SECMAX152", modelo: "TITAN LIGHT CDT29MSCPS", descripcion: "SECADORA C. GAS LG C/S OPL, MOD. TITAN LIGHT CAP. 15 KG", serie: "601KWRE2N079" }),
    lg({ codigo: "SECMAX15", modelo: "TITAN LIGHT CDT29MUCPS", descripcion: "SECADORA C. GAS LG C/S OPL, MOD. TITAN LIGHT APILABLE CAP. 15 KG", serie: "602KWAT2X464" }),
    lg({ codigo: "LAVGIA13", modelo: "GIANT C MAX CWG27MDCRS", descripcion: "LAVADORA C FLOT. LG C/SIS OPL,MOD.GIANT-C MAX APIL CAP:13KG", serie: "602KWGG3Y711" }),
    lg({ codigo: "LAVGIA132", modelo: "GIANT C MAX CWG27MSCRS", descripcion: "LAVADORA C FLOT. LG C/SIS OPL,MOD.GIANT-C MAX CAP:13KG", serie: "507KWZH2A069" }),
    lg({ codigo: "LAVGIA132", modelo: "GIANT C MAX CWG27MSCRS", descripcion: "LAVADORA C FLOT. LG C/SIS OPL,MOD.GIANT-C MAX CAP:13KG", serie: "303KWDJ87683", ubicacion: "EXHIBICIÓN" }),
  ];

  it("secadoras y lavadoras por modelo con el total, y la exhibición aparte sin contarla dos veces", () => {
    const { secciones, total } = armarLg(filas);
    expect(secciones.map((s) => s.titulo)).toEqual(["SECADORA SEMI INDUSTRIAL", "LAVADORA SEMI INDUSTRIAL", "EXHIBICIÓN EQUIPOS LG"]);
    const sec = secciones[0];
    expect(sec.modelos.map((m) => [m.modelo, m.stock])).toEqual([
      ["TITAN LIGHT SINGLE", 2],
      ["TITAN LIGHT STACK LOWER", 1],
    ]);
    expect(secciones[1].total).toBe(2);
    expect(secciones[2].modelos[0].series).toEqual(["303KWDJ87683"]);
    expect(total).toBe(6);
  });

  it("la etiqueta del modelo quita el código de sistema y dice STACK LOWER o SINGLE", () => {
    expect(etiquetaModeloLg({ modelo: "TITAN MAX CWT29MDCRS", descripcion: "LAVADORA … TITAN MAX APIL." })).toBe("TITAN MAX STACK LOWER");
    expect(etiquetaModeloLg({ modelo: "TITAN MAX CWT29MSORS", descripcion: "LAVADORA … TITAN MAX" })).toBe("TITAN MAX SINGLE");
  });
});

describe("ubicación del Excel", () => {
  it("un número en la celda UBICACIÓN (un costo corrido de columna) no es una ubicación", () => {
    expect(ubicacionDe("5505.4478944273")).toBeNull();
    expect(ubicacionDe("PLANTA")).toBe("PLANTA");
    expect(ubicacionDe("=B2")).toBeNull();
    expect(ubicacionDe(null)).toBeNull();
  });
});
