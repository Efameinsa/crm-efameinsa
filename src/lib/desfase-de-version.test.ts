import { test, expect } from "vitest";
import { esDesfaseDeVersion } from "@/lib/desfase-de-version";

// EL DÍA QUE SE DESPLIEGA SEIS VECES, ESTO ES LO QUE FALLA.
//
// Katerine, 08-09: «a server error occurred, reload to try again», con una
// gestión atascada en la cola. La causa no era su internet: la pestaña tenía
// la versión vieja y llamaba a una acción que el servidor nuevo ya no conoce.
// El CRM lo leía como «no hay red» y reintentaba cada treinta segundos contra
// una acción que no existía. Es el mismo incidente del 31-08, por la otra
// puerta: aquella vez fue un archivo, esta vez una acción.

test("reconoce el archivo de la versión vieja", () => {
  expect(esDesfaseDeVersion(new Error("Loading chunk 4821 failed"))).toBe(true);
  expect(esDesfaseDeVersion({ name: "ChunkLoadError", message: "" })).toBe(true);
  expect(esDesfaseDeVersion(new Error("Failed to fetch dynamically imported module: /_next/x.js"))).toBe(true);
});

test("reconoce la ACCIÓN de la versión vieja, que era el hueco", () => {
  expect(
    esDesfaseDeVersion(
      new Error('Failed to find Server Action "7f3a". This request might be from an older or newer deployment.'),
    ),
  ).toBe(true);
});

test("no confunde un error de verdad con un despliegue", () => {
  // Si esto diera true, un fallo real se escondería detrás de una recarga y
  // nadie se enteraría nunca.
  expect(esDesfaseDeVersion(new Error("Sesión expirada"))).toBe(false);
  expect(esDesfaseDeVersion(new TypeError("Failed to fetch"))).toBe(false);
  expect(esDesfaseDeVersion(new Error("duplicate key value violates unique constraint"))).toBe(false);
});

test("aguanta lo que no es un error", () => {
  expect(esDesfaseDeVersion(null)).toBe(false);
  expect(esDesfaseDeVersion(undefined)).toBe(false);
  expect(esDesfaseDeVersion({})).toBe(false);
});
