import { describe, expect, it } from "vitest";
import { codigosDeFabrica, maquinasParaImprimir } from "./maquinas-del-pedido";

const TORRE =
  "TORRE LAVADORA SECADORA SEMI INDUSTRIAL APILABLE \nMARCA:LG\nMODELO: GIANT C MAX\nCAPACIDAD: 13 -10.2 KG\nVOLTAJE:  220/60HZ/1PH \nCONEXION GAS GLP\n(CWG27MDCRS\nCDG27MUCPS)";

describe("maquinasParaImprimir", () => {
  it("la torre de ABZUL sale en dos máquinas, cada una con su serie y su código", () => {
    const filas = maquinasParaImprimir([
      { id: "a", orden: 1, descripcion: TORRE, serie: "604KWPV5N416" },
      { id: "b", orden: 2, descripcion: `Secadora · ${TORRE}`, serie: "303KWFN87683", parte_de: "a", parte_nombre: "Secadora" },
    ]);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ numero: "1.1", titulo: "LAVADORA de la torre", serie: "604KWPV5N416" });
    expect(filas[0].ficha).toBe("Marca: LG · Modelo: GIANT C MAX · Código: CWG27MDCRS · Capacidad: 13 KG");
    expect(filas[1]).toMatchObject({ numero: "1.2", titulo: "SECADORA de la torre", serie: "303KWFN87683" });
    expect(filas[1].ficha).toBe("Marca: LG · Modelo: GIANT C MAX · Código: CDG27MUCPS · Capacidad: 10.2 KG");
  });

  it("la torre sin la secadora todavía: una sola fila, como antes", () => {
    const filas = maquinasParaImprimir([{ id: "a", orden: 1, descripcion: TORRE, serie: "604KWPV5N416" }]);
    expect(filas).toEqual([{ numero: "1", titulo: null, ficha: null, descripcion: TORRE, serie: "604KWPV5N416" }]);
  });

  it("las dos series juntas «A / B» (antes del 0359) también se separan", () => {
    const filas = maquinasParaImprimir([{ id: "a", orden: 1, descripcion: TORRE, serie: "604KWPV5N416 / 303KWFN87683" }]);
    expect(filas.map((f) => [f.numero, f.titulo, f.serie])).toEqual([
      ["1.1", "LAVADORA de la torre", "604KWPV5N416"],
      ["1.2", "SECADORA de la torre", "303KWFN87683"],
    ]);
  });

  it("una máquina común sigue igual y se numera después de la torre", () => {
    const filas = maquinasParaImprimir([
      { id: "a", orden: 1, descripcion: TORRE, serie: "S1" },
      { id: "b", orden: 2, descripcion: `Secadora · ${TORRE}`, serie: null, parte_de: "a", parte_nombre: "Secadora" },
      { id: "c", orden: 3, descripcion: "CALANDRIA FCU 2600/500", serie: "X9" },
    ]);
    expect(filas.map((f) => f.numero)).toEqual(["1.1", "1.2", "2"]);
    expect(filas[1].serie).toBeNull();
    expect(filas[2]).toMatchObject({ titulo: null, descripcion: "CALANDRIA FCU 2600/500" });
  });
});

describe("codigosDeFabrica", () => {
  it("no confunde la serie ni el voltaje con un código", () => {
    expect(codigosDeFabrica(`${TORRE} SERIE: 604KWPV5N416`, ["604KWPV5N416"])).toEqual(["CWG27MDCRS", "CDG27MUCPS"]);
  });
});
