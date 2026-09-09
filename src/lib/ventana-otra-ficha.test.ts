import { expect, test } from "vitest";
import { inicioVentanaOtraFicha, HORAS_MARGEN_OTRA_FICHA } from "@/lib/derivados-central";

// EL CASO QUE LA OBLIGÓ (09-09, Ariana con JOEL ORTEGA y ELI FARFAN): el
// prospecto entró por la web el 18-08, ella lo llamó ese mismo día —el CRM
// todavía no existía y lo anotó en su Excel— y Central recién derivó el lead
// el 24-08. Midiendo la ventana desde la derivación, esa atención quedaba
// afuera y la ficha acusaba «se lo derivaron hace 16 d» sin gestión.
const LLEGADA = "2026-08-18T01:53:00Z";
const DERIVACION = "2026-08-24T19:05:00Z";
const dentro = (fecha: string, inicio: number | null) => inicio !== null && new Date(fecha).getTime() >= inicio;

test("la ventana arranca en la llegada del lead, no en la derivación", () => {
  const inicio = inicioVentanaOtraFicha(LLEGADA, DERIVACION);
  expect(dentro("2026-08-18T17:00:00Z", inicio)).toBe(true); // la gestión del Excel
  expect(dentro("2026-08-19T17:00:00Z", inicio)).toBe(true);
});

test("un día de margen hacia atrás, para quien atiende antes de que lo registren", () => {
  const inicio = inicioVentanaOtraFicha(LLEGADA, DERIVACION)!;
  expect(inicio).toBe(new Date(LLEGADA).getTime() - HORAS_MARGEN_OTRA_FICHA * 3_600_000);
  expect(dentro("2026-08-17T12:00:00Z", inicio)).toBe(true);
  expect(dentro("2026-08-16T12:00:00Z", inicio)).toBe(false);
});

test("la historia vieja del cliente no es atención a esta consulta", () => {
  const inicio = inicioVentanaOtraFicha(LLEGADA, DERIVACION);
  expect(dentro("2024-03-09T15:00:00Z", inicio)).toBe(false);
});

test("sin lead, el reloj arranca con la ficha; sin ninguna fecha, no hay ventana", () => {
  const inicio = inicioVentanaOtraFicha(null, "2026-09-01T12:00:00Z");
  expect(inicio).toBe(new Date("2026-09-01T12:00:00Z").getTime() - HORAS_MARGEN_OTRA_FICHA * 3_600_000);
  expect(inicioVentanaOtraFicha(null, null)).toBeNull();
});
