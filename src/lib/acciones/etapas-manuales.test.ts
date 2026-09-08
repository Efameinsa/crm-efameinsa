import { test, expect } from "vitest";
import { ETAPAS_MANUALES } from "@/lib/etapas-oportunidad";
import { ETAPAS_DEL_COMBO } from "@/lib/catalogos-ui";

// UNA VENTA NO SE PONE A MANO.
//
// Desde el 08-09 el desplegable de la oportunidad ofrece «Venta ejecutada»,
// porque el comercial que ganaba la venta la buscaba ahí y solo encontraba
// «Rechazada» y «Derivada» (Santos). Pero es un cartel que lo lleva a
// «Registrar venta» en su cotización, no una opción que se guarde: marcar la
// etapa a mano no crearía la fila en `ventas`, no aceptaría la cotización y no
// tocaría `ultima_venta_at` — el comercial creería haber cerrado y su venta no
// contaría en ninguna cifra.
//
// Esta prueba fija esa regla en el servidor, para que no dependa de que la
// pantalla se porte bien.

test("«venta» y «cotizada» no se pueden poner a mano", () => {
  expect(ETAPAS_MANUALES).not.toContain("venta");
  expect(ETAPAS_MANUALES).not.toContain("cotizada");
});

test("las etapas que sí se manejan a mano siguen estando", () => {
  for (const e of ["asignada", "filtrada", "seguimiento", "potencial", "rechazada", "derivada"]) {
    expect(ETAPAS_MANUALES, e).toContain(e);
  }
});

test("el desplegable ofrece «Venta ejecutada», que es donde el comercial la busca", () => {
  const venta = ETAPAS_DEL_COMBO.find((e) => e.valor === "venta");
  expect(venta?.etiqueta).toBe("Venta ejecutada");
  // Y dice, ahí mismo, que se registra en otro lado: la opción sin la
  // explicación sería una trampa.
  expect(venta?.criterio).toMatch(/cotización aceptada/);
});

test("todo lo que el combo ofrece se puede guardar, menos la venta", () => {
  // Si mañana alguien agrega otra etapa al combo sin agregarla al servidor,
  // el comercial la elegiría y el guardado fallaría sin explicación.
  for (const o of ETAPAS_DEL_COMBO) {
    if (o.valor === "venta") continue;
    expect(ETAPAS_MANUALES, o.valor).toContain(o.valor);
  }
});
