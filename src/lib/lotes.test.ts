import { test, expect } from "vitest";
import { enLotes, traerPorLotes, TAMANO_LOTE } from "@/lib/lotes";

// La trampa que ya costó tres veces: `.in("id", [...])` con cientos de ids arma
// una URL que PostgREST no responde, y supabase-js devuelve `data: null`, que
// se lee como «no hay resultados». Estas pruebas fijan el reparto en lotes.

test("parte la lista en lotes que caben en una URL", () => {
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  const lotes = enLotes(ids);
  expect(lotes).toHaveLength(3);
  expect(lotes[0]).toHaveLength(TAMANO_LOTE);
  expect(lotes[2]).toHaveLength(50);
  // No se pierde ni se repite ninguno: sería la misma lista incompleta que
  // veníamos a evitar.
  expect(lotes.flat()).toEqual(ids);
});

test("una lista corta viaja en un solo pedido", () => {
  expect(enLotes(["a", "b"])).toEqual([["a", "b"]]);
  expect(enLotes([])).toEqual([]);
});

test("junta las filas de todos los lotes", async () => {
  const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
  const pedidos: number[] = [];
  const r = await traerPorLotes(ids, async (lote) => {
    pedidos.push(lote.length);
    return { data: lote.map((id) => ({ id })), error: null };
  });
  expect(pedidos).toEqual([100, 50]);
  expect(r.data).toHaveLength(150);
  expect(r.error).toBeNull();
});

test("si un lote falla NO devuelve media lista", async () => {
  // Media respuesta que parece entera es exactamente el error que produjo
  // «última gestión vacía» sin ningún aviso.
  const r = await traerPorLotes(["a", "b"], async () => ({ data: null, error: { message: "se cayó" } }));
  expect(r.data).toEqual([]);
  expect(r.error).toBe("se cayó");
});

test("sin ids no hace ningún pedido", async () => {
  let llamadas = 0;
  const r = await traerPorLotes([], async () => { llamadas++; return { data: [], error: null }; });
  expect(llamadas).toBe(0);
  expect(r.data).toEqual([]);
});
