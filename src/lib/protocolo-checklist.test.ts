import { describe, expect, it } from "vitest";
import { cabeceraDeLaDescripcion, claveRenglon, plantillaPara, renglonesConMarca } from "./protocolo-checklist";

// La torre de TRANSPORTES TOURS LIBERTADORES, la misma de protocolo-hoja.test.ts.
const TORRE =
  "LAVADORA – SECADORA SEMI INDUSTRIAL OPL – APILABLE MARCA: LG MODELO: GIANT C MAX CAPACIDAD: 10 - 13 KG GAS GLP 220V/60Hz/1Ph SERIE: 405KWATM5344 SERIE: 303KWSB87694";

describe("hoja de chequeo del protocolo (Ariana, 13-10)", () => {
  it("cada máquina usa su papel; las que no tienen papel suben su PDF o Word", () => {
    expect(plantillaPara("LAVADORA 13 KG")?.clave).toBe("lavadora");
    expect(plantillaPara("SECADORA 10 KG")?.clave).toBe("secadora");
    // Como las nombra protocolo-hoja.ts cuando el tipo no está en su lista (14-10).
    expect(plantillaPara("RODILLO DE PLANCHADO INDUSTRIAL AUTOMATICO")?.clave).toBe("rodillo");
    expect(plantillaPara("CALANDRIA DE PLANCHADO INDUDSTRIAL AUTOMATICO")?.clave).toBe("rodillo");
    expect(plantillaPara("PRENSA DE PLANCHADO SEMI INDUSTRIAL")?.clave).toBe("prensa");
    expect(plantillaPara("CALDERIN CON PLANCHA SEMI-INDUSTRIAL")?.clave).toBe("calderin");
    expect(plantillaPara("DESMANCHADORA")?.clave).toBe("desmanchadora");
    expect(plantillaPara("CENTRIFUGA 25 KG")).toBeNull();
    expect(plantillaPara(undefined)).toBeNull();
  });

  it("los papeles de 14-10: renglones y casillas por energía sin repetirse", () => {
    // Secadora: 4 + 9 + 12 en vacío y con carga.
    expect(renglonesConMarca(plantillaPara("SECADORA")!)).toHaveLength(4 + 9 + 12 * 2);
    // Desmanchadora: 9 de estructura, 17 componentes, 9 en vacío y con vapor.
    expect(renglonesConMarca(plantillaPara("DESMANCHADORA")!)).toHaveLength(9 + 17 + 9 * 2);
    // Prensa y calderín: 4 de estructura y 22 componentes × GAS, ELÉCTRICO, VAPOR; rodillo 21.
    expect(renglonesConMarca(plantillaPara("PRENSA")!)).toHaveLength(4 + 22 * 3);
    expect(renglonesConMarca(plantillaPara("CALDERIN")!)).toHaveLength(4 + 22 * 3);
    expect(renglonesConMarca(plantillaPara("RODILLO")!)).toHaveLength(4 + 21 * 3);
    expect(renglonesConMarca(plantillaPara("PRENSA")!)).toContain("componentes.quemador.gas");
    for (const p of ["SECADORA", "DESMANCHADORA", "PRENSA", "RODILLO", "CALDERIN"]) {
      const r = renglonesConMarca(plantillaPara(p)!);
      expect(new Set(r).size).toBe(r.length);
    }
  });

  it("lee marca, voltaje, fases y frecuencia de la descripción del cierre", () => {
    expect(cabeceraDeLaDescripcion(TORRE)).toEqual({ marca: "LG", voltaje: "220 V", fases: "Monofásico", frecuencia: "60 Hz" });
    expect(cabeceraDeLaDescripcion("LAVADORA INDUSTRIAL UNIMAC UW35 380 V TRIFASICO")).toMatchObject({ marca: "UNIMAC", voltaje: "380 V", fases: "Trifásico" });
  });

  it("los renglones del papel: 4 de estructura, 9 de componentes y 12 en vacío y con carga", () => {
    const p = plantillaPara("LAVADORA")!;
    expect(renglonesConMarca(p)).toHaveLength(4 + 9 + 12 * 2);
    expect(new Set(renglonesConMarca(p)).size).toBe(renglonesConMarca(p).length);
    expect(claveRenglon("vacio", "Temperatura a los 10 min")).toBe("vacio.temperatura-a-los-10-min");
  });
});
