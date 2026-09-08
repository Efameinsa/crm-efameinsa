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

// LAS DOS SALIDAS QUE FALTABAN (08-09). Brenda escribió «no tengo pendiente
// con este prospecto» como nota de gestión en dos oportunidades, y «la venta
// ya fue cerrada, existe doble registro» en una tercera: el desplegable no le
// daba forma de sacarlas de su lista que no fuera llamarlas un rechazo.
test("se puede sacar algo de pendientes sin llamarlo una pérdida", () => {
  const derivada = ETAPAS_DEL_COMBO.find((e) => e.valor === "derivada");
  const archivar = ETAPAS_DEL_COMBO.find((e) => e.valor === "historico");
  expect(derivada?.etiqueta).toMatch(/Ya no es mío/);
  expect(archivar?.etiqueta).toMatch(/archivar/i);
  // Las dos tienen que poder guardarse de verdad, o la opción sería un adorno.
  expect(ETAPAS_MANUALES).toContain("derivada");
  expect(ETAPAS_MANUALES).toContain("historico");
});

test("ninguna de las dos pasa por el catálogo de motivos de rechazo", () => {
  // Si alguna fuera «rechazada», entraría en «lo que se perdió, y por qué» del
  // cierre semanal: una venta ganada o un caso pasado a postventa contados
  // como pérdida en el reporte de gerencia.
  for (const valor of ["derivada", "historico"]) {
    expect(ETAPAS_DEL_COMBO.find((e) => e.valor === valor)?.valor).not.toBe("rechazada");
  }
});
