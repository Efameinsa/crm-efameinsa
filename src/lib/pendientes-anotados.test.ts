import { describe, expect, it } from "vitest";
import { bloquesPendientesAnotados } from "./pendientes-anotados";

describe("bloquesPendientesAnotados", () => {
  it("un bloque por tipo, en el orden de los tipos y sin los vacíos", () => {
    const b = bloquesPendientesAnotados([
      { id: "1", titulo: "Hotel X — falta tambor", fecha: "2026-10-14", hora: null, tipo: "pendiente_stock" },
      { id: "2", titulo: "COFACO — variador", fecha: "2026-10-12", hora: "09:30", tipo: "importacion" },
    ]);
    expect(b.map((x) => x.titulo)).toEqual(["Importación (anotados)", "Pendiente de stock (anotados)"]);
    expect(b[0].filas[0]).toEqual({ cliente: "Para el 12/10/2026 09:30", detalle: "COFACO — variador" });
  });
  it("sin anotados no agrega nada", () => {
    expect(bloquesPendientesAnotados([])).toEqual([]);
  });
});
