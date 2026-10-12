import { describe, expect, it } from "vitest";
import { bloquesPendientesAnotados } from "./pendientes-anotados";

describe("bloquesPendientesAnotados", () => {
  it("un bloque por tipo, en el orden de los tipos y sin los vacíos", () => {
    const b = bloquesPendientesAnotados([
      { id: "1", titulo: "Hotel X — falta tambor", fecha: "2026-10-14", hora: null, tipo: "pendiente_stock" },
      { id: "2", titulo: "COFACO — variador", fecha: "2026-10-12", hora: "09:30", tipo: "importacion" },
    ]);
    expect(b.map((x) => x.titulo)).toEqual(["Importación", "Pendiente de stock"]);
    expect(b[0].filas[0]).toEqual({ cliente: "Para el 12/10/2026 09:30", detalle: "COFACO — variador" });
  });
  it("cierre y problema técnico van en su propio bloque, antes de «Otro pendiente»", () => {
    const b = bloquesPendientesAnotados([
      { id: "1", titulo: "ECOLAV SORELA — llega el equipo a Lima", fecha: "2026-10-13", hora: null, tipo: "otro" },
      { id: "2", titulo: "HOSPITAL CHANKA — llega el repuesto", fecha: "2026-10-13", hora: null, tipo: "problema_tecnico" },
      { id: "3", titulo: "LINO ESPIRITU — reducción Busch", fecha: "2026-10-13", hora: null, tipo: "pendiente_cierre" },
      { id: "4", titulo: "HOTELERA DEL CUSCO — motorreductor", fecha: "2026-10-13", hora: null, tipo: "problema_tecnico" },
    ]);
    expect(b.map((x) => [x.titulo, x.filas.length])).toEqual([
      ["Pendiente de cierre", 1],
      ["Problema técnico", 2],
      ["Otro pendiente", 1],
    ]);
  });
  it("sin anotados no agrega nada", () => {
    expect(bloquesPendientesAnotados([])).toEqual([]);
  });
});
