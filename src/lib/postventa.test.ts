import { describe, expect, it } from "vitest";
import { seriesDeTexto, estadoGarantia, slaCaso } from "./postventa";

// Las cadenas de prueba son las REALES: salen de la hoja SOPORTE TECNICO del
// Excel del área y de los informes del manual. Si el formato cambia, que falle
// acá y no en la pantalla.
describe("seriesDeTexto", () => {
  it("saca la serie de la descripción tal como la escribe el área", () => {
    expect(seriesDeTexto("LAVADORA TITAN MAX S: 509KWSB0A214")).toEqual(["509KWSB0A214"]);
    expect(seriesDeTexto("LAVADORA INDUSTRIAL RIGIDA UNIMAC S: 2405000112")).toEqual(["2405000112"]);
    expect(seriesDeTexto("CALDERA GENERADORA DE VAPOR EFAMEIN S: EFAC1215")).toEqual(["EFAC1215"]);
    expect(seriesDeTexto("LAVADORA INDUSTRIAL PRIMUS S: 240RX009152WK")).toEqual(["240RX009152WK"]);
  });

  it("acepta las variantes de los informes del manual", () => {
    // Sin espacio después de los dos puntos.
    expect(seriesDeTexto("SECADORA C GAS GLP LG, COD: CDG27MUCPS, S:303KWTA87697")).toContain("303KWTA87697");
    // "SERIE:" completo.
    expect(seriesDeTexto("MESA DE PLANCHADO NOVA SERIE: 280068")).toEqual(["280068"]);
    // El typo del anexo del manual, que está en un informe ya emitido.
    expect(seriesDeTexto("LAVADORA GIANTC PRO SERE: 707KWCF4J139")).toEqual(["707KWCF4J139"]);
  });

  it("encuentra varias series en un mismo equipo y no repite", () => {
    const texto = "LAVADORA-SECADORA APILABLE SERIE: 707KWVQ1V255 SERE: 707KWCF4J139 S: 707KWVQ1V255";
    expect(seriesDeTexto(texto)).toEqual(["707KWVQ1V255", "707KWCF4J139"]);
  });

  it("no inventa series donde no las hay", () => {
    expect(seriesDeTexto(null)).toEqual([]);
    expect(seriesDeTexto("LAVADORA CENTRIFUGA SEMI INDUSTRIAL OPL – APILABLE")).toEqual([]);
    // "S" suelta seguida de una palabra corta no es una serie.
    expect(seriesDeTexto("EQUIPO S: AB")).toEqual([]);
  });
});

describe("estadoGarantia", () => {
  it("distingue vigente de vencida y avisa cuando está por vencer", () => {
    const enUnAnio = new Date(new Date().getTime() + 365 * 864e5).toISOString().slice(0, 10);
    const enUnMes = new Date(new Date().getTime() + 30 * 864e5).toISOString().slice(0, 10);
    const ayer = new Date(new Date().getTime() - 864e5).toISOString().slice(0, 10);

    expect(estadoGarantia(enUnAnio).vigente).toBe(true);
    expect(estadoGarantia(enUnAnio).porVencer).toBe(false);
    expect(estadoGarantia(enUnMes).porVencer).toBe(true);
    expect(estadoGarantia(ayer).vigente).toBe(false);
    expect(estadoGarantia(null).etiqueta).toBe("Sin garantía registrada");
  });
});

describe("slaCaso", () => {
  it("una garantía se pone en rojo mucho antes que un repuesto", () => {
    const hace3h = new Date(new Date().getTime() - 3 * 36e5).toISOString();
    expect(slaCaso("garantia", hace3h, false).estado).toBe("rojo");
    expect(slaCaso("repuesto", hace3h, false).estado).toBe("verde");
  });

  it("un caso ya atendido no está en rojo por más viejo que sea", () => {
    const haceUnaSemana = new Date(new Date().getTime() - 7 * 864e5).toISOString();
    expect(slaCaso("garantia", haceUnaSemana, true).estado).toBe("verde");
  });
});
