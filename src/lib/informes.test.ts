import { describe, it, expect } from "vitest";
import { avisosDeIdentidad, renglonesDesdeTexto, rotuloDeItems, tituloDeItems } from "./informes";

// El control que pidió el ing. Carlos el 27-08: «que la razón social del cierre
// sea la que se vendió, a veces son muy similares pero tienen otro rumbo».
const FICHA = { razonSocial: "INVERSIONES NACIONALES DE TURISMO S.A.", numDoc: "20114803228" };

describe("a quién se le factura", () => {
  it("no dice nada cuando el cierre calza con la ficha", () => {
    expect(avisosDeIdentidad({ nombre: FICHA.razonSocial, doc: FICHA.numDoc }, FICHA)).toEqual([]);
  });

  it("perdona espacios de más y mayúsculas: no son un cliente distinto", () => {
    expect(
      avisosDeIdentidad({ nombre: "  Inversiones   Nacionales de Turismo S.A. ", doc: " 20114803228 " }, FICHA),
    ).toEqual([]);
  });

  it("canta el RUC que no es el de la ficha", () => {
    const avisos = avisosDeIdentidad({ nombre: FICHA.razonSocial, doc: "20604375038" }, FICHA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("20604375038");
    expect(avisos[0]).toContain("20114803228");
  });

  // El caso real de las tres fichas de INTURSA: la matriz, "HOTEL PARACAS" y
  // "LIBERTADOR HOTELS". Se parecen tanto que a ojo pasan.
  it("canta la razón social parecida pero distinta", () => {
    const avisos = avisosDeIdentidad(
      { nombre: "INVERSIONES NACIONALES DE TURISMO S.A. - HOTEL PARACAS", doc: FICHA.numDoc },
      FICHA,
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("razón social");
  });

  it("sin RUC avisa que Central no puede facturar", () => {
    const avisos = avisosDeIdentidad({ nombre: FICHA.razonSocial, doc: "   " }, FICHA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("no puede emitir la factura");
  });

  it("si la ficha no tiene documento, dice que no hay contra qué contrastar", () => {
    const avisos = avisosDeIdentidad({ nombre: "OTRO NOMBRE S.A.C.", doc: "20114803228" }, {
      razonSocial: "OTRO NOMBRE S.A.C.",
      numDoc: null,
    });
    expect(avisos).toEqual(["La ficha del cliente no tiene documento cargado, así que no hay contra qué contrastarlo."]);
  });

  it("acumula los dos avisos cuando nada calza", () => {
    expect(avisosDeIdentidad({ nombre: "OTRA EMPRESA S.A.C.", doc: "20604375038" }, FICHA)).toHaveLength(2);
  });
});

// FANCAVEL (02-09): la ficha traía dos razones sociales pegadas y el cliente
// pidió que el documento salga solo a su nombre, con el MISMO RUC. Se avisa,
// pero sin asustar: es un pedido legítimo.
describe("la razón social distinta con el mismo RUC", () => {
  it("lo dice como algo que puede estar bien", () => {
    const avisos = avisosDeIdentidad({ nombre: "HOTEL PARACAS S.A.", doc: FICHA.numDoc }, FICHA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("está bien si el cliente pidió");
  });
  it("con otro RUC no lo suaviza", () => {
    const avisos = avisosDeIdentidad({ nombre: "HOTEL PARACAS S.A.", doc: "20604375038" }, FICHA);
    expect(avisos[1]).not.toContain("está bien");
  });
});

// El cierre de Ariana con FANCAVEL: trece repuestos y un servicio. La tabla
// del PDF no puede decir EQUIPOS.
describe("el rótulo de la tabla según lo que se vendió", () => {
  it("sin tipo es EQUIPOS, como todo lo emitido antes", () => {
    expect(rotuloDeItems([{}, { tipo: null }])).toBe("EQUIPOS");
    expect(rotuloDeItems([])).toBe("EQUIPOS");
  });
  it("repuestos y servicios, en ese orden", () => {
    expect(rotuloDeItems([{ tipo: "servicio" }, { tipo: "repuesto" }])).toBe("REPUESTOS Y SERVICIOS");
    expect(rotuloDeItems([{ tipo: "servicio" }])).toBe("SERVICIOS");
  });
  it("los tres juntos", () => {
    expect(rotuloDeItems([{ tipo: "servicio" }, {}, { tipo: "repuesto" }])).toBe("EQUIPOS, REPUESTOS Y SERVICIOS");
    expect(tituloDeItems([{ tipo: "servicio" }, {}, { tipo: "repuesto" }])).toBe("Equipos, repuestos y servicios");
  });
});

describe("pegar una lista de renglones", () => {
  it("una línea por renglón, con cantidad y precio opcionales", () => {
    const r = renglonesDesdeTexto(
      ["VALVULA DE DRENAJE | 1 | 595", "", "AMORTIGUADOR ENSAMBLAJE | 3 | 45.00", "ABRAZADERA P/MANGUERA"].join("\n"),
      "repuesto",
    );
    expect(r).toEqual([
      { tipo: "repuesto", descripcion: "VALVULA DE DRENAJE", cantidad: 1, precio_unitario: 595 },
      { tipo: "repuesto", descripcion: "AMORTIGUADOR ENSAMBLAJE", cantidad: 3, precio_unitario: 45 },
      { tipo: "repuesto", descripcion: "ABRAZADERA P/MANGUERA", cantidad: 1, precio_unitario: 0 },
    ]);
  });
  it("acepta el tabulador de Excel y los precios con US$ y miles", () => {
    const r = renglonesDesdeTexto(["KIT DE INTERRUPTOR DE PUERTA", "01", "USD$ 1,245.00"].join("\t"), "repuesto");
    expect(r[0]).toEqual({ tipo: "repuesto", descripcion: "KIT DE INTERRUPTOR DE PUERTA", cantidad: 1, precio_unitario: 1245 });
  });
});
