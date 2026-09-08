import { test, expect } from "vitest";
import { etiquetaTipoServicio } from "@/lib/postventa";

// El historial de un cliente mostraba los tres estilos a la vez —el del enum,
// el del Excel viejo y el que se escribió sin tilde—, y el cliente leía dos
// veces el mismo servicio como si le hubieran hecho dos cosas distintas
// (informe de UX del 08-09).

test("el código interno se lee como lo diría una persona", () => {
  expect(etiquetaTipoServicio("mantenimiento_preventivo")).toBe("Mantenimiento preventivo");
  expect(etiquetaTipoServicio("evaluacion")).toBe("Evaluación / levantamiento de observaciones");
});

test("da igual cómo venga escrito del Excel viejo", () => {
  // Las tres formas del mismo servicio que convivían en una sola pantalla.
  for (const forma of ["ENTREGA", "entrega", "Entrega"]) {
    expect(etiquetaTipoServicio(forma), forma).toBe("Entrega de equipo o repuesto");
  }
  // Con tilde, con espacio o con guion: es el mismo código.
  expect(etiquetaTipoServicio("Mantenimiento Preventivo")).toBe("Mantenimiento preventivo");
  expect(etiquetaTipoServicio("mantenimiento-preventivo")).toBe("Mantenimiento preventivo");
});

test("lo que no está en la lista deja de gritar", () => {
  // Texto libre de años de Excel: no se reescribe la historia, se muestra
  // parejo con el resto.
  expect(etiquetaTipoServicio("ENTREGA DE EQUIPO")).toBe("Entrega de equipo");
  expect(etiquetaTipoServicio("REVISION_DE_TABLERO")).toBe("Revision de tablero");
});

test("sin dato no inventa una etiqueta rara", () => {
  expect(etiquetaTipoServicio(null)).toBe("Servicio");
  expect(etiquetaTipoServicio("   ")).toBe("Servicio");
});
