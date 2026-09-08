import { test, expect } from "vitest";
import { faltaDecirPorQueNoSeFactura } from "@/lib/atenciones";

// EL HALLAZGO DE MÁS PLATA DEL INFORME DE UX (08-09): se recorrieron las nueve
// etapas de un caso marcado «Mantenimiento correctivo · se cobra» y se cerró
// con la conformidad firmada por el cliente sin que el sistema pidiera —ni
// ofreciera— una cotización en ningún momento. La etiqueta «se cobra» quedaba
// decorativa hasta el final.
//
// El área hace el trabajo, el cliente firma, y la venta se pierde sin que
// nadie se entere. Estas pruebas fijan la regla para que no vuelva a soltarse.

const caso = (extra: Parameters<typeof faltaDecirPorQueNoSeFactura>[0]) => faltaDecirPorQueNoSeFactura(extra);

test("un correctivo sin cotización no se cierra sin explicación", () => {
  expect(caso({ clasificacion: "correctivo", cotizaciones: 0, motivo: null })).toBe(true);
});

test("con la cotización hecha, se cierra sin más", () => {
  // Si ya se cotizó, la venta está registrada: no hay nada que explicar.
  expect(caso({ clasificacion: "correctivo", cotizaciones: 1, motivo: null })).toBe(false);
});

test("una garantía no se cobra, así que nunca pide explicación", () => {
  expect(caso({ clasificacion: "garantia", cotizaciones: 0, motivo: null })).toBe(false);
});

test("los tres tipos que sí se cobran quedan cubiertos", () => {
  for (const c of ["preventivo", "correctivo", "facturable"] as const) {
    expect(caso({ clasificacion: c, cotizaciones: 0, motivo: null }), c).toBe(true);
  }
});

test("una razón de verdad alcanza; un «ok» no", () => {
  expect(caso({ clasificacion: "correctivo", cotizaciones: 0, motivo: "Lo cubrió la garantía del equipo" })).toBe(false);
  // Diez caracteres es el mismo mínimo que ya pide la nota de cierre: obliga a
  // escribir algo que se entienda cuando el cliente vuelva a llamar.
  expect(caso({ clasificacion: "correctivo", cotizaciones: 0, motivo: "ok" })).toBe(true);
  expect(caso({ clasificacion: "correctivo", cotizaciones: 0, motivo: "   " })).toBe(true);
});

test("un caso sin clasificar todavía no exige nada", () => {
  // Todavía nadie dijo si se cobra: exigirlo acá sería trabar el cierre de un
  // caso que quizá ni siquiera era facturable.
  expect(caso({ clasificacion: null, cotizaciones: 0, motivo: null })).toBe(false);
});
