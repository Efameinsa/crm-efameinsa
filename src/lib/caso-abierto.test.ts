import { test, expect } from "vitest";
import { estaAbierta, resumirAtenciones, PASOS_VISIBLES, ETAPAS_ATENCION } from "@/lib/atenciones";
import type { Atencion } from "@/lib/atenciones";

// QUÉ ES UN CASO ABIERTO. Lo definió Santos el 07-09-2026, después de que el
// informe de UX contara cinco números distintos para la misma cosa —tarjetas
// 8, chip 3, menú 8, «Mi día» 9, encabezado 28—: «abierto es que aún no se
// cerró; la espera del cliente es caso abierto, y el que está agendado
// también».
//
// Es una definición y no un detalle: es el número que el área le contesta al
// ing. Carlos los sábados. Esta prueba la deja escrita para que no vuelva a
// haber cinco versiones, y sobre todo fija los dos casos que se prestan a
// discusión y que él resolvió expresamente.

const base = (extra: Partial<Atencion>): Atencion =>
  ({
    id: "x",
    tipo: "problema_tecnico",
    etapa: "registro",
    cerrado_at: null,
    tomada_at: null,
    atendido_at: null,
    clasificacion: null,
    detalle: null,
    solicitado_at: "2026-09-01T10:00:00Z",
    ...extra,
  }) as unknown as Atencion;

test("un caso sin cerrar está abierto, aunque nadie lo haya tocado", () => {
  expect(estaAbierta(base({}))).toBe(true);
});

test("el que espera al cliente sigue abierto", () => {
  // Decisión de Santos: esperar una respuesta no cierra nada.
  expect(estaAbierta(base({ etapa: "seguimiento", atendido_at: "2026-09-02T10:00:00Z" }))).toBe(true);
});

test("el que ya está agendado sigue abierto", () => {
  expect(estaAbierta(base({ etapa: "planificacion", programada_at: "2026-09-10T14:00:00Z" }))).toBe(true);
});

test("solo la fecha de cierre lo cierra", () => {
  expect(estaAbierta(base({ cerrado_at: "2026-09-05T18:00:00Z" }))).toBe(false);
  // Ni la etapa «cierre» por sí sola: mientras no tenga fecha, sigue abierto.
  expect(estaAbierta(base({ etapa: "cierre" }))).toBe(true);
});

test("las tarjetas cuentan con la misma definición", () => {
  const lista = [
    base({}),
    base({ etapa: "seguimiento" }),
    base({ etapa: "planificacion", programada_at: "2026-09-10T14:00:00Z" }),
    base({ cerrado_at: "2026-09-05T18:00:00Z" }),
  ];
  const r = resumirAtenciones(lista);
  expect(r.enProceso).toBe(3);
  expect(r.cerradas).toBe(1);
  expect(r.enProceso + r.cerradas).toBe(r.recibidas);
});

// LA TIRA DICE LOS PASOS QUE EXISTEN (08-09). El circuito anunciaba nueve
// etapas y tenía siete formularios: «Pruebas» y «Conformidad» son uno solo
// —el mismo formulario pide el resultado y quién firma—, así que la tira
// marcaba un paso que nadie iba a ver por su cuenta.
test("la tira agrupa pruebas y conformidad, y no pierde ninguna etapa", () => {
  // Ninguna etapa de la base se queda sin casilla donde mostrarse: si mañana
  // se agrega una al enum y no a la tira, el caso desaparecería del riel.
  const cubiertas = PASOS_VISIBLES.flatMap((p) => p.cubre);
  expect([...cubiertas].sort()).toEqual([...ETAPAS_ATENCION].sort());
  // Y ninguna se cuenta dos veces.
  expect(new Set(cubiertas).size).toBe(cubiertas.length);
  // Nueve etapas, ocho casillas: pruebas y conformidad van juntas.
  expect(PASOS_VISIBLES).toHaveLength(ETAPAS_ATENCION.length - 1);
  expect(PASOS_VISIBLES.find((p) => p.clave === "pruebas")?.cubre).toEqual(["pruebas", "conformidad"]);
});
