import { describe, expect, it } from "vitest";
import { cabeceraDeLaDescripcion, claveRenglon, plantillaPara, renglonesConMarca } from "./protocolo-checklist";

// La torre de TRANSPORTES TOURS LIBERTADORES, la misma de protocolo-hoja.test.ts.
const TORRE =
  "LAVADORA – SECADORA SEMI INDUSTRIAL OPL – APILABLE MARCA: LG MODELO: GIANT C MAX CAPACIDAD: 10 - 13 KG GAS GLP 220V/60Hz/1Ph SERIE: 405KWATM5344 SERIE: 303KWSB87694";

describe("hoja de chequeo del protocolo (Ariana, 13-10)", () => {
  it("la lavadora usa el papel «PROTOCOLO DE LAVADORA»; la secadora todavía no tiene", () => {
    expect(plantillaPara("LAVADORA 13 KG")?.clave).toBe("lavadora");
    expect(plantillaPara("SECADORA 10 KG")).toBeNull();
    expect(plantillaPara(undefined)).toBeNull();
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
