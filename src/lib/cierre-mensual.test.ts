import { describe, it, expect } from "vitest";
import { esMes, mesPorDefecto, rangoDelMes, rotuloDelMes, semanasDelMes } from "@/lib/cierre-mensual";

// La aritmética del mes, que es donde el reporte se puede equivocar en
// silencio: un día de más o de menos en el borde y las cifras dejan de cuadrar
// con la base sin que nada falle.

describe("esMes", () => {
  it("acepta un mes bien escrito", () => {
    expect(esMes("2026-08")).toBe(true);
    expect(esMes("2026-12")).toBe(true);
  });
  it("rechaza lo que no lo es", () => {
    expect(esMes("2026-13")).toBe(false);
    expect(esMes("2026-00")).toBe(false);
    expect(esMes("2026-08-01")).toBe(false);
    expect(esMes(null)).toBe(false);
    expect(esMes(undefined)).toBe(false);
  });
});

describe("mesPorDefecto", () => {
  it("los primeros días del mes propone el anterior: se está cerrando ese", () => {
    expect(mesPorDefecto("2026-09-01")).toBe("2026-08");
    expect(mesPorDefecto("2026-09-05")).toBe("2026-08");
  });
  it("del día 6 en adelante propone el mes que corre", () => {
    expect(mesPorDefecto("2026-09-06")).toBe("2026-09");
    expect(mesPorDefecto("2026-08-31")).toBe("2026-08");
  });
  it("cruza el año sin romperse", () => {
    expect(mesPorDefecto("2027-01-02")).toBe("2026-12");
  });
});

describe("rangoDelMes", () => {
  it("toma el mes completo, con el último día que corresponda", () => {
    expect(rangoDelMes("2026-08")).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(rangoDelMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    // Bisiesto: si esto se rompe, febrero pierde un día de trabajo.
    expect(rangoDelMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
});

describe("rotuloDelMes", () => {
  it("escribe el mes como se lee en la cabecera", () => {
    expect(rotuloDelMes("2026-08")).toBe("Agosto de 2026");
    expect(rotuloDelMes("2026-12")).toBe("Diciembre de 2026");
  });
});

describe("semanasDelMes", () => {
  it("recorta las semanas por los bordes del mes", () => {
    // Agosto de 2026 empieza SÁBADO: su primera semana son dos días, y el 31
    // es un lunes que se queda solo. Es el mes con el que se verificó todo
    // contra producción.
    const s = semanasDelMes("2026-08");
    expect(s.map((x) => [x.desde, x.hasta])).toEqual([
      ["2026-08-01", "2026-08-02"],
      ["2026-08-03", "2026-08-09"],
      ["2026-08-10", "2026-08-16"],
      ["2026-08-17", "2026-08-23"],
      ["2026-08-24", "2026-08-30"],
      ["2026-08-31", "2026-08-31"],
    ]);
    expect(s[0].etiqueta).toBe("1 al 2");
    expect(s[5].etiqueta).toBe("Día 31");
  });

  it("cubre el mes entero, sin huecos ni superposiciones", () => {
    for (const mes of ["2026-01", "2026-02", "2026-08", "2026-11", "2028-02"]) {
      const s = semanasDelMes(mes);
      const { desde, hasta } = rangoDelMes(mes);
      expect(s[0].desde).toBe(desde);
      expect(s[s.length - 1].hasta).toBe(hasta);
      for (let i = 1; i < s.length; i++) {
        const anterior = new Date(`${s[i - 1].hasta}T00:00:00Z`);
        anterior.setUTCDate(anterior.getUTCDate() + 1);
        expect(s[i].desde).toBe(anterior.toISOString().slice(0, 10));
      }
    }
  });

  it("un mes que empieza lunes arranca con una semana completa", () => {
    // Junio de 2026 empieza lunes.
    const s = semanasDelMes("2026-06");
    expect([s[0].desde, s[0].hasta]).toEqual(["2026-06-01", "2026-06-07"]);
  });
});
