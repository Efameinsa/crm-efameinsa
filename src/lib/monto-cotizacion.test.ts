import { test, expect } from "vitest";
import { montoCotizacion, totalConIgv } from "@/lib/monto-cotizacion";

// El caso exacto que reportó el informe de UX del 08-09: la misma cotización
// decía «US$ 531.00» en el cotizador y «USD 450» en la tarjeta de la ficha del
// cliente. 450 sin IGV son 531 con IGV; el problema no era la cuenta, era que
// nadie decía cuál de las dos estaba mirando.
test("los 450 de la tarjeta y los 531 del cotizador son el mismo documento", () => {
  expect(totalConIgv(450)).toBe(531);
  expect(montoCotizacion(450, "USD")).toBe("USD 531");
});

test("redondea a dos decimales y no arrastra centavos fantasma", () => {
  expect(totalConIgv(1234.57)).toBe(1456.79);
  expect(totalConIgv("8950.00")).toBe(10561);
});

test("sin monto no inventa un cero", () => {
  // Un borrador sin ítems no vale «0»: vale «todavía no hay cifra».
  expect(totalConIgv(null)).toBeNull();
  expect(totalConIgv(undefined)).toBeNull();
  expect(totalConIgv("")).toBeNull();
  expect(montoCotizacion(null, "USD")).toBeNull();
});

test("respeta la moneda del documento y cae en dólares solo si falta", () => {
  expect(montoCotizacion(100, "PEN")).toBe("PEN 118");
  expect(montoCotizacion(100, null)).toBe("USD 118");
});
