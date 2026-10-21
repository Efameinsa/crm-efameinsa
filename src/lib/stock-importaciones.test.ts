import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { emparejar, revisarSegunExcel, esHojaDeStock, familia, leerExcelStock, rasgos, siguienteCodigoLibre, type ProductoCatalogo } from "./stock-importaciones";

const prod = (sku: string, descripcion: string, extra: Partial<ProductoCatalogo> = {}): ProductoCatalogo => ({
  id: sku,
  sku,
  activo: true,
  marca: "UNIMAC",
  modelo: extra.modelo ?? "UT075",
  nombre: "SECADORA INDUSTRIAL",
  descripcion,
  panel: null,
  calentamiento: null,
  nombreFicha: null,
  ...extra,
});

const fila = (modelo: string, descripcion: string, extra: Record<string, unknown> = {}) => ({
  hoja: "STOCK DE EQUIPOS INDUSTRIALES",
  fila: 2,
  item: "I26332",
  codigoExcel: null,
  modelo,
  descripcion,
  serie: "2608067071",
  capacidad: null,
  cantidad: 1,
  ubicacion: "PLANTA",
  ingreso: null,
  marca: "UNIMAC",
  ...extra,
});

describe("rasgos y familia", () => {
  it("lee control, calentamiento, cilindro y voltaje", () => {
    expect(rasgos("SECADORA INDUSTRIAL, MOD. UT075, CONTROL: UNILICH TOUCH, CILINDRO INOXIDABLE, GAS NATURAL, X(220V/60HZ/1-3PH)")).toMatchObject({
      control: "Unilinc Touch",
      calentamiento: "gas natural",
      cilindro: "inoxidable",
      voltaje: "220V 1-3PH",
      tipo: "secadora",
    });
    expect(rasgos("LAVADORA C FLOT. LG C/SIS OPL,MOD.GIANT-C MAX APIL CWG27MDCRS").sistemaLg).toBe("CWG27MDCRS");
  });
  it("UT055L, UTC060 y UW130 caen en su familia", () => {
    expect(familia("UT055L")).toBe("UT055");
    expect(familia("UTC060")).toBe("UCT060");
    expect(familia("UW130")).toBe("UWT130");
  });
  it("reserva y vendidos no son hojas de stock", () => {
    expect(esHojaDeStock("STOCK DE EQUIPOS LG")).toBe(true);
    expect(esHojaDeStock("RESERVA ")).toBe(false);
    expect(esHojaDeStock("VENDIDO LG")).toBe(false);
  });
});

describe("siguienteCodigoLibre", () => {
  it("nunca repite un código, ni uno retirado", () => {
    expect(siguienteCodigoLibre("LAVW065", new Set(["LAVW065"]))).toBe("LAVW0651");
    expect(siguienteCodigoLibre("PROF01", new Set(["PROF01"]))).toBe("PROF02");
    expect(siguienteCodigoLibre("SECU75", new Set(["SECU75", "SECU751"]))).toBe("SECU752");
  });
});

describe("emparejar", () => {
  const catalogo = [
    prod("SECU75", "SECADORA INDUSTRIAL, MOD. UT075, CONTROL: DUAL DIGITAL, CILINDRO GALVANIZADO, GAS GLP, X(220V/60HZ/1-3PH)"),
    prod("SECU553", "SECADORA INDUSTRIAL, MOD. UT075, CONTROL: DUAL DIGITAL, CILINDRO GALVANIZADO, GAS NATURAL, X(220V/60HZ/1-3PH)"),
    prod("SECU752", "SECADORA INDUSTRIAL, MOD. UT075, CONTROL: UNILICH TOUCH, CILINDRO INOXIDABLE, GAS NATURAL, X(220V/60HZ/1-3PH)"),
    prod("LAVGIA132", "", { modelo: "GIANT C MAX (CWG27MSCRS)", nombre: "LAVADORA C. NO APILABLE", marca: "LG" }),
    prod("SECGIA102", "", { modelo: "GIANT C MAX (CDG27MSCPS)", nombre: "SECADORA C. NO APILABLE", marca: "LG" }),
  ];

  it("sin código: propone el que tiene la misma configuración", () => {
    const [p] = emparejar([fila("UT075", "SECADORA, MOD. UT075, CONTROL: DUAL DIGITAL, CILINDRO GALVANIZADO, GAS NATURAL, X(220V/60HZ/1-3PH)")], catalogo, []);
    expect(p.estado).toBe("sugerido");
    expect(p.codigo).toBe("SECU553");
  });

  it("código de secadora puesto a una lavadora LG: revisar y proponer el de la lavadora", () => {
    const [p] = emparejar(
      [fila("GIANT C MAX CWG27MSCRS", "LAVADORA C FLOT. LG C/SIS OPL,MOD.GIANT-C MAX CAP:13KG", { hoja: "STOCK DE EQUIPOS LG", codigoExcel: "SECGIA102" })],
      catalogo,
      [],
    );
    expect(p.estado).toBe("revisar");
    expect(p.codigo).toBe("LAVGIA132");
  });

  it("configuración que no existe: código tentativo nuevo, el mismo para las iguales", () => {
    const desc = "SECADORA, MOD. UT075, CONTROL: UNILINC TOUCH, CILINDRO INOXIDABLE, GAS GLP, X(220V/60HZ/1-3PH)";
    const [a, b] = emparejar([fila("UT075", desc), fila("UT075", desc, { serie: "2608067099" })], catalogo, []);
    expect(a.estado).toBe("nuevo");
    expect(a.crear).toBe(true);
    expect(a.codigo).toBe(b.codigo);
    expect(["SECU75", "SECU553", "SECU752"]).not.toContain(a.codigo);
  });

  it("Sailstar con dosificador externo / aire FRL: no es la que ya existe, va código nuevo de la misma familia", () => {
    const cat = [...catalogo, prod("LAVG50", "LAVADORA EXTRACTORA SAILSTAR, MOD.: GP50, CON CALENTAMIENTO A VAPOR, CONTROL: TOUCH, FUERZA: 350G, CAP: 50 KG, (220V/60HZ/3PH)", { modelo: "GP50", marca: "SAILSTAR" })];
    const [p] = emparejar(
      [fila("GP50", "LAVADORA EXTRACTORA SAILSTAR, MOD.: GP50, CON CALENTAMIENTO A VAPOR, CONTROL: TOUCH, c/ SISTEMA DE AIRE FRL, 5 PUERTOS DOSIFICADOR EXTERNO, FUERZA: 350G, CAP: 50 KG, (220V/60HZ/3PH)", { marca: "SAILSTAR" })],
      cat,
      [],
    );
    expect(p.estado).toBe("nuevo");
    expect(p.codigo).toBe("LAVG501");
    expect(p.candidatos[0]).toMatchObject({ sku: "LAVG50" });
    expect(p.candidatos[0].choques.join()).toContain("dosificador");
    expect(p.tipo).toBe("lavadora");
  });

  it("Lesly escribe en el Excel un código que no existe y la máquina tampoco: se crea con ese código", () => {
    const [p] = emparejar([fila("PROFLEX 100-16-00/226", "MESA DE PLANCHADO ASPIRANTE-SOPLANTE CON BRAZO 220V/60HZ", { codigoExcel: "PROF02", marca: "BIMAP" })], catalogo, []);
    expect(p.estado).toBe("nuevo");
    expect(p.crear).toBe(true);
    expect(p.codigo).toBe("PROF02");
  });

  it("Lesly escribe un código retirado: las máquinas entran y queda por activarlo", () => {
    const cat = [...catalogo, prod("SECNSEN", "SECADORA SEMI INDUSTRIAL APILABLE ELECTRICO, PRIMUS, MOD: NSENXAGS173NW01, (220V/60HZ/3PH)", { modelo: "NSENXAGS173NW01", activo: false, marca: "PRIMUS" })];
    const [p] = emparejar([fila("NSENXAGS173NW01", "SECADORA.APIL.ELECT.MOD.NSENXAGS173NW01 120/240/60/3PH", { codigoExcel: "SECNSEN", marca: "PRIMUS" })], cat, []);
    expect(p.estado).toBe("nuevo");
    expect(p.crear).toBe(false);
    expect(p.codigo).toBe("SECNSEN");
  });

  it("serie que ya está con un cliente: revisar, con el cliente y el pedido", () => {
    const [p] = emparejar(
      [fila("UT075", "SECADORA, MOD. UT075, DUAL DIGITAL, CILINDRO GALVANIZADO, GAS NATURAL, X(220V/60HZ/1-3PH)", { codigoExcel: "SECU553" })],
      catalogo,
      [{ serie: "2608067071", cliente: "PRODECO DEL SUR", cuentaId: "c1", pedidoId: "p1", pedido: "PED-0010-2026" }],
    );
    expect(p.estado).toBe("revisar");
    expect(p.motivo).toContain("PED-0010-2026");
    expect(p.ocupada).toMatchObject({ cuentaId: "c1", pedidoId: "p1" });
  });

  it("serie que ya está con un cliente: revisar", () => {
    const [p] = emparejar(
      [fila("UT075", "SECADORA, MOD. UT075, DUAL DIGITAL, CILINDRO GALVANIZADO, GAS NATURAL, X(220V/60HZ/1-3PH)", { codigoExcel: "SECU553" })],
      catalogo,
      [{ serie: "2608067071", cliente: "PRODECO DEL SUR" }],
    );
    expect(p.estado).toBe("revisar");
    expect(p.motivo).toContain("PRODECO DEL SUR");
  });
});

describe("leerExcelStock", () => {
  it("lee solo las hojas de stock y nunca la columna COSTO", () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.aoa_to_sheet([
        ["ITEM", "CODIFICACION", "CODIGO", "MODELO ", "NOMBRE ", "SERIE", "CAPACIDAD ", "STOCK ", "UBICACIÓN", "INGRESO ", "COSTO", "PROVEEDOR", "MARCA"],
        [1, "LAV2801", "I25014", "RX280", "LAVADORA IND. RIGIDA MOD RX280", "280RX006222ZF", "28 KG", 1, "PLANTA", null, 7311.62, "ALLIANCES", "PRIMUS"],
      ]),
      "STOCK DE EQUIPOS INDUSTRIALES",
    );
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.aoa_to_sheet([
        [null, null, "CODIGO", "MODELO", "DESCRIPCION ", "SERIE", "CAPACIDAD", "STOCK", "SISTEMA ", "UBICACIÓN ", "INGRESO ", "COSTO"],
        [null, null, null, null, "SECADORA 15 KG - LG"],
        ["SECMAX152", 1, "I25158", "TITAN LIGHT", "SECADORA C. GAS LG", "601KWRE2N078", "15 KG", 1, "CDT29MSCPS", "PLANTA", null, 1088],
      ]),
      "STOCK DE EQUIPOS LG",
    );
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["ITEM", "CODIGO", "MODELO", "SERIE"], [1, "I1", "X", "S1"]]), "RESERVA ");
    const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" });

    const { filas, ignoradas } = leerExcelStock(datos);
    expect(filas).toHaveLength(2);
    expect(ignoradas).toContain("RESERVA");
    expect(filas[1]).toMatchObject({ codigoExcel: "SECMAX152", item: "I25158", modelo: "TITAN LIGHT CDT29MSCPS", serie: "601KWRE2N078" });
    expect(JSON.stringify(filas)).not.toContain("7311");
    expect(JSON.stringify(filas)).not.toContain("1088");
  });
});

describe("revisarSegunExcel (manda el Excel de Lesly)", () => {
  const catalogo = [
    prod("SECGIA10", "", { modelo: "GIANT C MAX (CDG27MUCPS)", nombre: "SECADORA C. APILABLE", marca: "LG" }),
    prod("SECNSEN", "SECADORA PRIMUS MOD: NSENXAGS173NW01", { modelo: "NSENXAGS173NW01", activo: false }),
  ];
  it("respeta el código aunque el sistema diga otra cosa, crea el que no existe y reactiva el retirado", () => {
    const [a, b, c] = revisarSegunExcel(
      [
        fila("GIANT C MAX CWG27MDCRS", "LAVADORA LG GIANT C MAX", { hoja: "STOCK DE EQUIPOS LG", codigoExcel: "SECGIA10", serie: "S1" }),
        fila("PROFLEX 100-16-00/226", "MESA DE PLANCHADO", { codigoExcel: "PROF02", serie: null }),
        fila("NSENXAGS173NW01", "SECADORA", { codigoExcel: "SECNSEN", serie: "S3" }),
      ],
      catalogo,
      [],
    );
    expect(a).toMatchObject({ estado: "ok", codigo: "SECGIA10", candidatos: [] });
    expect(b).toMatchObject({ estado: "nuevo", crear: true, codigo: "PROF02" });
    expect(c).toMatchObject({ estado: "nuevo", crear: false, codigo: "SECNSEN" });
  });
  it("sin código no adivina; serie con cliente y código a dos modelos van a revisar", () => {
    const [a, b, c, d] = revisarSegunExcel(
      [
        fila("UT120", "SECADORA MOD: UT120L", { serie: "A1" }),
        fila("UT075", "SECADORA MOD. UT075", { codigoExcel: "SECU75", serie: "A2" }),
        fila("RX240", "LAVADORA MOD. RX240", { codigoExcel: "LAVX", serie: "A3" }),
        fila("RX180", "LAVADORA MOD. RX180", { codigoExcel: "LAVX", serie: "A4" }),
      ],
      catalogo,
      [{ serie: "A2", cliente: "ECOLAV", pedido: "467-26" }],
    );
    expect(a).toMatchObject({ estado: "falta", codigo: null });
    expect(b.estado).toBe("revisar");
    expect(b.motivo).toContain("ECOLAV");
    expect(c.estado).toBe("revisar");
    expect(d.motivo).toContain("modelos distintos");
  });
});
