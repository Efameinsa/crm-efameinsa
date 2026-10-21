import { describe, expect, it } from "vitest";
import {
  maquinasPorSerie,
  llevaOrdenFacturar,
  seriesDeTexto,
  estadoGarantia,
  slaCaso,
  estadoPago,
  sinPrecios,
  puedeVerPrecios,
  bloquesPedido,
  evaluarPagoParaDespacho,
  textoCondicionPago,
  textoPlanoNoEnviado,
  pedidoSinCobro,
  pagoParcialSinCubrir,
  condicionContadoConSaldo,
  pideVistoBuenoFinanzas,
  faltaVistoBuenoFinanzas,
  faltanLetrasEnAlmacen,
  cierreExigePuesta,
  faltanFotosDeAgencia,
  faltaParaEmitirApertura,
  type ServicioPostventa,
} from "./postventa";

// Las cadenas de prueba son las REALES: salen de la hoja SOPORTE TECNICO del
// Excel del área y de los informes del manual. Si el formato cambia, que falle
// acá y no en la pantalla.
describe("seriesDeTexto", () => {
  it("saca la serie de la descripción tal como la escribe el área", () => {
    expect(seriesDeTexto("LAVADORA TITAN MAX S: 509KWSB0A214")).toEqual(["509KWSB0A214"]);
    expect(seriesDeTexto("LAVADORA INDUSTRIAL RIGIDA UNIMAC S: 2405000112")).toEqual(["2405000112"]);
    expect(seriesDeTexto("CALDERA GENERADORA DE VAPOR EFAMEIN S: EFAC1215")).toEqual(["EFAC1215"]);
    expect(seriesDeTexto("LAVADORA INDUSTRIAL PRIMUS S: 240RX009152WK")).toEqual(["240RX009152WK"]);
  });

  it("acepta las variantes de los informes del manual", () => {
    // Sin espacio después de los dos puntos.
    expect(seriesDeTexto("SECADORA C GAS GLP LG, COD: CDG27MUCPS, S:303KWTA87697")).toContain("303KWTA87697");
    // "SERIE:" completo.
    expect(seriesDeTexto("MESA DE PLANCHADO NOVA SERIE: 280068")).toEqual(["280068"]);
    // El typo del anexo del manual, que está en un informe ya emitido.
    expect(seriesDeTexto("LAVADORA GIANTC PRO SERE: 707KWCF4J139")).toEqual(["707KWCF4J139"]);
  });

  it("encuentra varias series en un mismo equipo y no repite", () => {
    const texto = "LAVADORA-SECADORA APILABLE SERIE: 707KWVQ1V255 SERE: 707KWCF4J139 S: 707KWVQ1V255";
    expect(seriesDeTexto(texto)).toEqual(["707KWVQ1V255", "707KWCF4J139"]);
  });

  it("no inventa series donde no las hay", () => {
    expect(seriesDeTexto(null)).toEqual([]);
    expect(seriesDeTexto("LAVADORA CENTRIFUGA SEMI INDUSTRIAL OPL – APILABLE")).toEqual([]);
    // "S" suelta seguida de una palabra corta no es una serie.
    expect(seriesDeTexto("EQUIPO S: AB")).toEqual([]);
  });
});

describe("estadoGarantia", () => {
  it("distingue vigente de vencida y avisa cuando está por vencer", () => {
    // Fechas contadas desde HOY EN LIMA, que es como las mide la función: con
    // fechas UTC, después de las 19:00 de Lima «ayer» ya era otro día y la
    // prueba fallaba sola todas las noches.
    const hoyLima = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
    const enDias = (n: number) => {
      const d = new Date(hoyLima);
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const enUnAnio = enDias(365);
    const enUnMes = enDias(30);
    const ayer = enDias(-1);

    expect(estadoGarantia(enUnAnio).vigente).toBe(true);
    expect(estadoGarantia(enUnAnio).porVencer).toBe(false);
    expect(estadoGarantia(enUnMes).porVencer).toBe(true);
    expect(estadoGarantia(ayer).vigente).toBe(false);
    expect(estadoGarantia(null).etiqueta).toBe("Sin garantía registrada");
  });
});

describe("slaCaso", () => {
  it("una garantía se pone en rojo mucho antes que un repuesto", () => {
    const hace3h = new Date(new Date().getTime() - 3 * 36e5).toISOString();
    expect(slaCaso("garantia", hace3h, false).estado).toBe("rojo");
    expect(slaCaso("repuesto", hace3h, false).estado).toBe("verde");
  });

  it("un caso ya atendido no está en rojo por más viejo que sea", () => {
    const haceUnaSemana = new Date(new Date().getTime() - 7 * 864e5).toISOString();
    expect(slaCaso("garantia", haceUnaSemana, true).estado).toBe("verde");
  });
});

// ── Tapar los precios sin romper el circuito ──────────────────────────────
//
// «Ni almacén ni postventa deberían tener acceso a los precios» (Carlos,
// 27-08). El riesgo de una regla así no es que se filtre una cifra: es que al
// borrar los montos el resto del pedido lea otra cosa. `saldo = monto -
// pagado` sobre un monto en null da cero, y cero significa «pagado». Estas
// pruebas fijan que tapar NO cambia ni un paso del circuito.

/** Un pedido mínimo, con todo lo demás vacío. */
function pedido(campos: Partial<ServicioPostventa>): ServicioPostventa {
  return {
    id: "x",
    cliente_texto: "Cliente",
    cuenta_id: null,
    equipo: "LAVADORA",
    tipo_servicio: "puesta_en_marcha",
    ubicacion: null,
    observaciones: null,
    monto: null,
    moneda: "USD",
    forma_pago: null,
    fecha_confirmacion: null,
    fecha_despacho: null,
    despacho_nota: null,
    puesta_en_marcha: null,
    puesta_nota: null,
    completado: false,
    origen: "crm",
    confirmacion_abono: null,
    prueba_embalaje: null,
    planos_preinstalacion: null,
    informe_cierre_id: "informe-1",
    numero_pedido_erp: null,
    pedido_ejecutado_at: null,
    liquidacion_at: null,
    aprobado_at: "2026-08-27T12:00:00Z",
    modalidad: null,
    monto_pagado: null,
    pago_confirmado_at: null,
    despacho_sin_cancelar_motivo: null,
    prueba_solicitada_at: null,
    prueba_lista_at: null,
    protocolo_prueba_ref: null,
    plano_enviado_at: null,
    preinstalacion_ok_at: null,
    preinstalacion_nota: null,
    direccion_verificada_at: null,
    direccion_verificada_con: null,
    direccion_entrega: null,
    despachado_at: null,
    transportista: null,
    guia: null,
    recibe_nombre: null,
    cerrado_at: null,
    ...campos,
  };
}

const pasoDePago = (s: ServicioPostventa) =>
  bloquesPedido(s)
    .flatMap((b) => b.pasos)
    .find((p) => p.clave === "pago")!;

describe("estadoPago", () => {
  it("lee los tres estados sobre los montos crudos", () => {
    expect(estadoPago(pedido({ monto: 10000, monto_pagado: 10000 }))).toBe("completo");
    expect(estadoPago(pedido({ monto: 10000, monto_pagado: 4000 }))).toBe("parcial");
    // Fila del Excel: monto cargado, pago nunca registrado, sin informe.
    expect(estadoPago(pedido({ monto: 10000, monto_pagado: null, informe_cierre_id: null }))).toBe("sin_registrar");
  });

  it("respeta el 'SI' del Excel y la confirmación explícita en las filas SIN cifras", () => {
    // Filas del Excel (sin informe): la marca es lo único que hay y vale.
    expect(estadoPago(pedido({ monto: 10000, informe_cierre_id: null, confirmacion_abono: "SI" }))).toBe("completo");
    expect(estadoPago(pedido({ monto: 10000, informe_cierre_id: null, pago_confirmado_at: "2026-08-01T10:00:00Z" }))).toBe("completo");
  });

  it("fila del Excel SIN monto ni marca: no se sabe, no es «completo» (HANCO 06-10)", () => {
    expect(estadoPago(pedido({ monto: null, monto_pagado: null, informe_cierre_id: null, confirmacion_abono: "ADELANTO CONFIRMADO" }))).toBe("sin_registrar");
    expect(estadoPago(pedido({ monto: null, informe_cierre_id: null, confirmacion_abono: "SI" }))).toBe("completo");
  });

  it("con cifras reales, el saldo manda sobre la marca de confirmación (0232)", () => {
    // El 495-26 del 14-09: Finanzas confirmó con captura y sin cifra, quedó
    // pagado 0 y la pantalla decía «completo» mientras el servidor pedía
    // autorización por el total.
    expect(estadoPago(pedido({ monto: 4472.2, monto_pagado: 0, pago_confirmado_at: "2026-09-14T14:52:00Z" }))).toBe("parcial");
    expect(estadoPago(pedido({ monto: 4472.2, monto_pagado: 4472.2, pago_confirmado_at: "2026-09-14T14:52:00Z" }))).toBe("completo");
  });
});

describe("evaluarPagoParaDespacho (0232)", () => {
  it("con 50 % de adelanto, la mitad confirmada libera la salida", () => {
    const r = evaluarPagoParaDespacho(pedido({ monto: 4472.2, monto_pagado: 2236.1, pct_antes_despacho: 50, pago_confirmado_at: "x" }));
    expect(r.requerido).toBe(2236.1);
    expect(r.cubierto).toBe(true);
  });

  it("tolera el redondeo del adelanto, no el faltante", () => {
    expect(evaluarPagoParaDespacho(pedido({ monto: 4472.2, monto_pagado: 2236, pct_antes_despacho: 50 })).cubierto).toBe(true);
    expect(evaluarPagoParaDespacho(pedido({ monto: 4472.2, monto_pagado: 2000, pct_antes_despacho: 50 })).cubierto).toBe(false);
  });

  it("al contado exige todo; a todo crédito no exige nada", () => {
    expect(evaluarPagoParaDespacho(pedido({ monto: 10000, monto_pagado: 9000, pct_antes_despacho: 100 })).cubierto).toBe(false);
    expect(evaluarPagoParaDespacho(pedido({ monto: 10000, monto_pagado: 10000, pct_antes_despacho: 100 })).cubierto).toBe(true);
    expect(evaluarPagoParaDespacho(pedido({ monto: 10000, monto_pagado: 0, pct_antes_despacho: 0, pago_confirmado_at: "x" })).cubierto).toBe(true);
  });

  it("sin condición cargada se exige todo, como antes", () => {
    expect(evaluarPagoParaDespacho(pedido({ monto: 10000, monto_pagado: 5000, pct_antes_despacho: null })).cubierto).toBe(false);
    expect(evaluarPagoParaDespacho(pedido({ monto: 10000, monto_pagado: 5000 })).requerido).toBe(10000);
  });

  it("las filas del Excel sin cifras no se traban", () => {
    expect(evaluarPagoParaDespacho(pedido({ monto: 10000, monto_pagado: null, informe_cierre_id: null, pago_confirmado_at: null })).cubierto).toBe(true);
  });

  it("la pantalla sin precios recibe la decisión ya tomada", () => {
    const tapado = sinPrecios(pedido({ monto: 4472.2, monto_pagado: 0, pct_antes_despacho: 50, pago_confirmado_at: "x" }));
    expect(tapado.despacho_liberado).toBe(false);
    expect(tapado.monto).toBeNull();
    const liberado = sinPrecios(pedido({ monto: 4472.2, monto_pagado: 2236.1, pct_antes_despacho: 50, pago_confirmado_at: "x" }));
    expect(liberado.despacho_liberado).toBe(true);
  });
});

describe("textoCondicionPago", () => {
  it("dice la condición como la lee cualquiera", () => {
    expect(textoCondicionPago({ pct_antes_despacho: 50, credito_dias: 30 })).toBe("50 % antes del despacho · saldo a crédito a 30 días");
    expect(textoCondicionPago({ pct_antes_despacho: 100, credito_dias: null })).toBe("Contado: todo pagado antes del despacho");
    expect(textoCondicionPago({ pct_antes_despacho: 0, credito_dias: 60 })).toBe("Todo a crédito a 60 días");
    expect(textoCondicionPago({ pct_antes_despacho: null, credito_dias: null })).toBeNull();
  });
});

describe("sinPrecios", () => {
  it("no deja ni una cifra de venta en el objeto que viaja a la pantalla", () => {
    const tapado = sinPrecios(pedido({ monto: 18900, monto_pagado: 9450 }));
    expect(tapado.monto).toBeNull();
    expect(tapado.monto_pagado).toBeNull();
    // Y nada de lo que queda contiene el número, en ningún campo.
    expect(JSON.stringify(tapado)).not.toContain("18900");
    expect(JSON.stringify(tapado)).not.toContain("9450");
  });

  it("conserva el estado del pago, que es lo que decide el despacho", () => {
    expect(sinPrecios(pedido({ monto: 18900, monto_pagado: 9450 })).pago_estado).toBe("parcial");
    expect(sinPrecios(pedido({ monto: 18900, monto_pagado: 18900 })).pago_estado).toBe("completo");
  });

  it("NO convierte un pago parcial en pagado al borrar los montos", () => {
    // Es el error que la regla existe para evitar: sin `pago_estado`, el saldo
    // de un monto en null da cero y el pedido se leería cobrado.
    const crudo = pedido({ monto: 18900, monto_pagado: 9450 });
    const tapado = sinPrecios(crudo);
    expect(pasoDePago(crudo).hecho).toBe(false);
    expect(pasoDePago(tapado).hecho).toBe(false);
    // Desde la 0150 el paso es la confirmación de Finanzas; sin cifra, la
    // etiqueta no puede nombrar el saldo.
    expect(pasoDePago(tapado).etiqueta).toBe("Confirmación de Finanzas");
    expect(pasoDePago(tapado).etiqueta).not.toContain("9450");
  });

  it("deja el circuito idéntico paso por paso, esté tapado o no", () => {
    for (const caso of [
      pedido({ monto: 18900, monto_pagado: 18900 }),
      pedido({ monto: 18900, monto_pagado: 9450 }),
      pedido({ monto: 18900, monto_pagado: null, informe_cierre_id: null, origen: "excel" }),
      pedido({ monto: null, monto_pagado: null }),
    ]) {
      const antes = bloquesPedido(caso).flatMap((b) => b.pasos);
      const despues = bloquesPedido(sinPrecios(caso)).flatMap((b) => b.pasos);
      expect(despues.map((p) => `${p.clave}:${p.hecho}:${p.trabado ?? ""}`)).toEqual(
        antes.map((p) => `${p.clave}:${p.hecho}:${p.trabado ?? ""}`),
      );
    }
  });
});

describe("puedeVerPrecios", () => {
  it("gerencia y admin ven todo; el área de postventa, nada", () => {
    expect(puedeVerPrecios({ rol: "gerencia", es_postventa: false })).toBe(true);
    expect(puedeVerPrecios({ rol: "admin", es_postventa: false })).toBe(true);
    expect(puedeVerPrecios({ rol: "comercial", es_postventa: true })).toBe(false);
    // Un comercial que además vende mantenimiento (0093) SÍ las ve: cotiza.
    expect(puedeVerPrecios({ rol: "comercial", es_postventa: false })).toBe(true);
    expect(puedeVerPrecios({ rol: "central", es_postventa: false })).toBe(true);
  });
});

// El circuito del pedido en el orden que dictó el ing. Carlos el 01-09 (0150):
// pago → aprobación → probado y embalado → plano; y el despacho solo con la
// APERTURA, que solo se emite con las cuatro condiciones cumplidas.
describe("bloquesPedido: el orden de Carlos y la apertura de despacho", () => {
  const claves = (s: ServicioPostventa) => bloquesPedido(s).flatMap((b) => b.pasos.map((p) => p.clave));
  const paso = (s: ServicioPostventa, clave: string) =>
    bloquesPedido(s)
      .flatMap((b) => b.pasos)
      .find((p) => p.clave === clave)!;

  it("arranca por la confirmación de Finanzas y sigue por la aprobación", () => {
    expect(claves(pedido({})).slice(0, 4)).toEqual(["pago", "aprobado", "prueba", "plano"]);
  });

  it("probar y embalar NO espera al pago: el paso de pago no traba nada", () => {
    const s = pedido({ monto: 10000, monto_pagado: 5000 });
    expect(paso(s, "pago").hecho).toBe(false);
    expect(paso(s, "pago").trabado).toBeUndefined();
    expect(paso(s, "prueba").trabado).toBeUndefined();
  });

  it("la apertura dice qué falta, y se puede emitir solo con todo cumplido", () => {
    const incompleto = pedido({ monto: 10000, monto_pagado: 10000 });
    expect(paso(incompleto, "apertura").hecho).toBe(false);
    expect(paso(incompleto, "apertura").trabado).toContain("la dirección verificada");
    expect(paso(incompleto, "apertura").trabado).toContain("probado y embalado");
    expect(paso(incompleto, "apertura").trabado).toContain("plano");

    const listo = pedido({
      monto: 10000,
      monto_pagado: 10000,
      pago_confirmado_at: "2026-09-01T15:00:00Z",
      direccion_verificada_at: "2026-09-01T15:10:00Z",
      prueba_lista_at: "2026-09-01T15:20:00Z",
      plano_enviado_at: "2026-09-01T15:30:00Z",
    });
    expect(paso(listo, "apertura").trabado).toBeUndefined();
    expect(paso(listo, "apertura").hecho).toBe(false);
    expect(paso({ ...listo, apertura_despacho_at: "2026-09-01T16:00:00Z" }, "apertura").hecho).toBe(true);
  });

  it("sin apertura no sale nada del almacén; con apertura, el despacho queda libre", () => {
    const s = pedido({
      monto: 10000,
      monto_pagado: 10000,
      pago_confirmado_at: "2026-09-01T15:00:00Z",
      direccion_verificada_at: "2026-09-01T15:10:00Z",
      prueba_lista_at: "2026-09-01T15:20:00Z",
      plano_enviado_at: "2026-09-01T15:30:00Z",
    });
    expect(paso(s, "despacho").trabado).toContain("Sin apertura");
    expect(paso({ ...s, apertura_despacho_at: "2026-09-01T16:00:00Z" }, "despacho").trabado).toBeUndefined();
  });

  // LA REGLA CAMBIÓ EL 09-09. Carlos, revisando el circuito con Lesly:
  // «preinstalación confirmada, eso es parte de la puesta en marcha… la
  // apertura de despacho sí va en el despacho». Antes frenaba la apertura;
  // ahora vive en el bloque de la puesta en marcha y en el despacho queda solo
  // como advertencia, porque mandar un camión a provincia sin agua, desagüe ni
  // energía listos sigue siendo un viaje perdido.
  it("en provincia la preinstalación ya NO frena la apertura, pero avisa en el despacho", () => {
    const s = pedido({
      modalidad: "provincia",
      pago_confirmado_at: "2026-09-01T15:00:00Z",
      direccion_verificada_at: "2026-09-01T15:10:00Z",
      prueba_lista_at: "2026-09-01T15:20:00Z",
      plano_enviado_at: "2026-09-01T15:30:00Z",
    });
    expect(paso(s, "apertura").trabado).toBeUndefined();
    expect(paso({ ...s, apertura_despacho_at: "2026-09-01T16:00:00Z" }, "despacho").trabado).toContain("preinstalación");
  });

  it("la preinstalación es del bloque de la puesta en marcha, no del despacho", () => {
    const s = pedido({ modalidad: "provincia" });
    const bloques = bloquesPedido(s);
    const despacho = bloques.find((b) => b.titulo === "Despacho");
    const puesta = bloques.find((b) => b.numero === 3);
    expect(despacho?.pasos.map((x) => x.clave)).not.toContain("preinstalacion");
    expect(puesta?.pasos.map((x) => x.clave)).toContain("preinstalacion");
  });

  // ÍTEM 6 de la reunión del 22-09: en Lima también hay preinstalación, pero
  // por videollamada, no por foto. Comparte columna con la de provincia.
  it("en Lima el equipo también lleva preinstalación, pero como videollamada", () => {
    const s = pedido({ modalidad: "lima" });
    expect(paso(s, "preinstalacion").etiqueta).toBe("Videollamada de preinstalación: falta hacerla");
    expect(paso(s, "preinstalacion").responsable).toBe("postventa");
    expect(paso(s, "preinstalacion").hecho).toBe(false);
    expect(paso({ ...s, preinstalacion_ok_at: "2026-09-22T10:00:00Z" }, "preinstalacion").hecho).toBe(true);
    expect(paso({ ...s, preinstalacion_ok_at: "2026-09-22T10:00:00Z" }, "preinstalacion").etiqueta).toBe("Videollamada de preinstalación hecha");
  });

  // 01-10 (Rubí): pendiente no puede sonar a hecho.
  it("en provincia, mientras falta, el rótulo no dice «confirmada»", () => {
    const s = pedido({ modalidad: "provincia" });
    expect(paso(s, "preinstalacion").etiqueta).toBe("Preinstalación: falta que el cliente la confirme");
    expect(paso({ ...s, preinstalacion_ok_at: "2026-09-22T10:00:00Z" }, "preinstalacion").etiqueta).toBe("Preinstalación confirmada por el cliente");
  });

  it("la videollamada de Lima no reabre un pedido que ya avanzó sin ella", () => {
    const s = pedido({ modalidad: "lima" });
    // Ya hizo la puesta en marcha: pedirla ahora sería retroactivo y sin sentido.
    expect(paso({ ...s, puesta_en_marcha: "2026-09-10" }, "preinstalacion").hecho).toBe(true);
    // Ya cerrado, de antes de que este paso existiera.
    expect(paso({ ...s, cerrado_at: "2026-09-10T10:00:00Z" }, "preinstalacion").hecho).toBe(true);
    expect(paso({ ...s, completado: true }, "preinstalacion").hecho).toBe(true);
  });

  it("un repuesto no lleva ni preinstalación de provincia ni videollamada de Lima", () => {
    const repuesto = pedido({ modalidad: "lima", tipo_pedido: "repuesto" });
    expect(claves(repuesto)).not.toContain("preinstalacion");
  });

  it("los pedidos viejos del Excel, sin cierre, no quedan trabados por la apertura", () => {
    const excel = pedido({ informe_cierre_id: null, origen: "excel", aprobado_at: null, prueba_embalaje: "SI", planos_preinstalacion: "SI" });
    expect(paso(excel, "despacho").trabado).toBeUndefined();
  });
});

describe("reunión 25-09: la preinstalación según dónde se entrega, y el embalaje", () => {
  const claves = (s: Parameters<typeof bloquesPedido>[0]) => bloquesPedido(s).map((b) => b.pasos.map((p) => p.clave));

  it("en Lima la videollamada de preinstalación va en el despacho, antes de que salga", () => {
    const [, despacho, cierre] = claves(pedido({ modalidad: "lima", tipo_pedido: "equipo" }));
    expect(despacho.indexOf("preinstalacion")).toBeGreaterThanOrEqual(0);
    expect(despacho.indexOf("preinstalacion")).toBeLessThan(despacho.indexOf("despacho"));
    expect(cierre).not.toContain("preinstalacion");
  });

  it("en provincia sigue después del despacho, en el cierre", () => {
    const [, despacho, cierre] = claves(pedido({ modalidad: "provincia", tipo_pedido: "equipo" }));
    expect(despacho).not.toContain("preinstalacion");
    expect(cierre.indexOf("preinstalacion")).toBeLessThan(cierre.indexOf("puesta"));
  });

  it("en Lima lo que ya salió no pide la llamada que nadie registró", () => {
    const s = pedido({ modalidad: "lima", tipo_pedido: "equipo", despachado_at: "2026-09-20T15:00:00Z" });
    expect(bloquesPedido(s).flatMap((b) => b.pasos).find((p) => p.clave === "preinstalacion")?.hecho).toBe(true);
  });

  it("el embalaje se recorre como un repuesto: sin plano, sin preinstalación y sin informe", () => {
    const todas = claves(pedido({ tipo_pedido: "embalaje", modalidad: "provincia" })).flat();
    expect(todas).not.toContain("plano");
    expect(todas).not.toContain("preinstalacion");
    expect(todas).not.toContain("puesta");
    expect(todas).toContain("prueba");
    expect(todas).toContain("cerrado");
  });
});

describe("0314: el accesorio (coches y carros) no se conecta", () => {
  const claves = (s: Parameters<typeof bloquesPedido>[0]) => bloquesPedido(s).map((b) => b.pasos.map((p) => p.clave));

  it("en provincia: sin plano, sin preinstalación y sin puesta en marcha, aunque se haya marcado sin plano o no", () => {
    for (const sin_plano of [true, false]) {
      const todas = claves(pedido({ tipo_pedido: "accesorio", modalidad: "provincia", sin_plano })).flat();
      expect(todas).not.toContain("plano");
      expect(todas).not.toContain("preinstalacion");
      expect(todas).not.toContain("puesta");
      expect(todas).toEqual(expect.arrayContaining(["prueba", "direccion", "apertura", "despacho", "cerrado"]));
    }
  });

  it("si recoge en planta: se entrega en planta y se cierra, sin apertura", () => {
    const [, entrega] = claves(pedido({ tipo_pedido: "accesorio", entrega_en: "planta" }));
    expect(entrega).toEqual(["despacho"]);
  });

  it("la apertura no pide el equipo probado ni el plano: pide el accesorio listo", () => {
    const apertura = bloquesPedido(pedido({ tipo_pedido: "accesorio", modalidad: "provincia" }))
      .flatMap((b) => b.pasos)
      .find((p) => p.clave === "apertura");
    expect(apertura?.trabado ?? "").not.toMatch(/plano|probado/);
  });
});

describe("«No se le envió» el plano (Rubí, 30-09)", () => {
  const paso = (s: Parameters<typeof bloquesPedido>[0]) =>
    bloquesPedido(s).flatMap((b) => b.pasos).find((p) => p.clave === "plano");

  it("el paso queda a la vista, cerrado y dicho como no enviado", () => {
    const p = paso(pedido({ tipo_pedido: "equipo", sin_plano: true, sin_plano_motivo: "No se le envió: el equipo llegó antes" }));
    expect(p?.hecho).toBe(true);
    expect(p?.etiqueta).toBe("Plano de preinstalación: no se le envió");
    expect(p?.detalle).toBe("el equipo llegó antes");
  });

  it("guarda quién lo tenía a cargo y lo muestra en el paso", () => {
    const p = paso(pedido({ tipo_pedido: "equipo", sin_plano: true, sin_plano_motivo: textoPlanoNoEnviado("ya en marcha", "Juan Pérez") }));
    expect(p?.hecho).toBe(true);
    expect(p?.detalle).toBe("ya en marcha · Lo tenía a cargo: Juan Pérez");
  });

  it("«No lleva plano» sigue escondiendo el paso", () => {
    expect(paso(pedido({ tipo_pedido: "equipo", sin_plano: true, sin_plano_motivo: "Es un calderín" }))).toBeUndefined();
  });

  it("no traba la apertura por el plano", () => {
    const apertura = bloquesPedido(pedido({ tipo_pedido: "equipo", sin_plano: true, sin_plano_motivo: "No se le envió: x" }))
      .flatMap((b) => b.pasos)
      .find((p) => p.clave === "apertura");
    expect(apertura?.trabado ?? "").not.toContain("plano");
  });
});

describe("sin cobro: garantía desde un caso (Rubí, 12-10)", () => {
  const pago = (s: ServicioPostventa) => bloquesPedido(s).flatMap((b) => b.pasos).find((p) => p.clave === "pago")!;

  it("la entrega de repuestos por garantía no espera a Finanzas", () => {
    const s = pedido({ origen: "caso", monto: null, tipo_pedido: "repuesto", tipo_servicio: "GARANTÍA · ENTREGA DE REPUESTOS", apertura_tipo: "entrega_garantia" } as Partial<ServicioPostventa>);
    expect(pedidoSinCobro(s)).toBe(true);
    expect(pago(s).hecho).toBe(true);
    expect(pago(s).etiqueta).toBe("Sin cobro: entrega por garantía");
  });

  it("un pedido del CRM sigue pidiendo la confirmación de Finanzas", () => {
    const s = pedido({ monto: 10000, monto_pagado: 0 });
    expect(pedidoSinCobro(s)).toBe(false);
    expect(pago(s).hecho).toBe(false);
  });
});

describe("orden a Finanzas para facturar (0460, reunión 13-10)", () => {
  const base = { cerrado_at: null, completado: false, origen: null, pago_confirmado_at: null, pago_estado: "parcial" } as unknown as Parameters<typeof llevaOrdenFacturar>[0];
  it("aparece a crédito o con saldo después del despacho", () => {
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: 0 })).toBe(true);
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: 50 })).toBe(true);
  });
  it("no aparece al contado, sin condición ni en lo ya cerrado", () => {
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: 100 })).toBe(false);
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: null })).toBe(false);
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: 0, cerrado_at: "2026-10-01T00:00:00Z" })).toBe(false);
  });
  it("no aparece si ya está pagado completo", () => {
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: 0, pago_estado: "completo" })).toBe(false);
  });
  it("con letras aparece aunque el Excel diga pagado y no tenga % (COFACO 21-10)", () => {
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: null, pago_estado: "completo", letras_cantidad: 3, letras_estado: "entregadas" })).toBe(true);
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: null, letras_estado: "no_lleva" })).toBe(false);
  });
  it("una vez dada, se queda a la vista", () => {
    expect(llevaOrdenFacturar({ ...base, pct_antes_despacho: 100, orden_facturar_at: "2026-10-13T20:00:00Z" })).toBe(true);
  });
});

describe("visto bueno de Finanzas para la salida (0469, COFACO 14-10)", () => {
  const cofaco = { forma_pago: "50% ADELANTO + 50% SALDO EN 3 LETRAS", pct_antes_despacho: null, origen: "excel", letras_cantidad: null, tipo_pedido: "equipo" as const, confirmacion_abono: "SI" };

  it("pide visto bueno a las ventas con letras, crédito o condición < 100 %", () => {
    expect(pideVistoBuenoFinanzas(cofaco)).toBe(true);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "Crédito 30 días" })).toBe(true);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "CONTADO", pct_antes_despacho: 50 })).toBe(true);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "CONTADO" })).toBe(false);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "CONTADO", pct_antes_despacho: 100 })).toBe(false);
    // 0473: el plazo escrito, el crédito anotado en el abono y el Excel sin un «SI» limpio.
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "ADELANTO 60% SALDO 40% (FACTURA A 30 DIAS)" })).toBe(true);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "ADELANTO 60%", confirmacion_abono: "credito" })).toBe(true);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "CONTADO", confirmacion_abono: "Pendiente" })).toBe(true);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "CONTADO", confirmacion_abono: "SI PENDIENTE UNA COMISION" })).toBe(true);
    expect(pideVistoBuenoFinanzas({ ...cofaco, forma_pago: "CONTADO", confirmacion_abono: null, informe_cierre_id: "inf", pago_confirmado_at: null })).toBe(false);
  });

  it("no lo pide a servicios ni a lo abierto desde un caso", () => {
    expect(pideVistoBuenoFinanzas({ ...cofaco, tipo_pedido: "mantenimiento" })).toBe(false);
    expect(pideVistoBuenoFinanzas({ ...cofaco, origen: "caso" })).toBe(false);
  });

  it("deja de faltar con el visto bueno, la autorización con código o si ya salió", () => {
    const base = { ...cofaco, finanzas_vb_at: null, salida_autorizada_at: null, despachado_at: null };
    expect(faltaVistoBuenoFinanzas(base)).toBe(true);
    expect(faltaVistoBuenoFinanzas({ ...base, finanzas_vb_at: "2026-10-14T10:00:00Z" })).toBe(false);
    expect(faltaVistoBuenoFinanzas({ ...base, salida_autorizada_at: "2026-10-14T10:00:00Z" })).toBe(false);
    expect(faltaVistoBuenoFinanzas({ ...base, despachado_at: "2026-10-14T10:00:00Z" })).toBe(false);
  });

  it("el pedido del Excel con «abono: SI» ya no emite la apertura sin el visto bueno", () => {
    const s = pedido({ ...cofaco, confirmacion_abono: "SI", prueba_embalaje: "SI", planos_preinstalacion: "SI", direccion_verificada_at: "2026-10-14T13:31:00Z", informe_cierre_id: null });
    const pasos = bloquesPedido(s).flatMap((b) => b.pasos);
    expect(pasos.find((p) => p.clave === "vb_finanzas")?.hecho).toBe(false);
    expect(pasos.find((p) => p.clave === "apertura")?.trabado).toMatch(/visto bueno de Finanzas/);
    const conVB = bloquesPedido({ ...s, finanzas_vb_at: "2026-10-14T13:00:00Z", letras_estado: "van_con_el_equipo", letras_cantidad: 3 }).flatMap((b) => b.pasos);
    expect(conVB.find((p) => p.clave === "apertura")?.trabado).toBeUndefined();
    expect(conVB.find((p) => p.clave === "vb_finanzas")?.detalle).toMatch(/van con el equipo \(3\)/);
  });
});

describe("letras que viajan con el equipo (0470)", () => {
  const base = { forma_pago: "50% ADELANTO + 50% SALDO EN 3 LETRAS", origen: "excel", confirmacion_abono: "SI", prueba_embalaje: "SI", planos_preinstalacion: "SI", informe_cierre_id: null, finanzas_vb_at: "2026-10-14T13:00:00Z", letras_estado: "van_con_el_equipo" as const, letras_cantidad: 3 };

  it("el almacén tiene que tener las letras antes de salir, salvo autorización con código", () => {
    expect(faltanLetrasEnAlmacen({ ...base, letras_recibidas_almacen_at: null, salida_autorizada_at: null, despachado_at: null })).toBe(true);
    expect(faltanLetrasEnAlmacen({ ...base, letras_recibidas_almacen_at: "2026-10-14T14:00:00Z", salida_autorizada_at: null, despachado_at: null })).toBe(false);
    expect(faltanLetrasEnAlmacen({ ...base, letras_recibidas_almacen_at: null, salida_autorizada_at: "2026-10-14T14:00:00Z", despachado_at: null })).toBe(false);
  });

  it("después de salir, el paso de las letras queda trabado hasta confirmar la entrega", () => {
    const salio = pedido({ ...base, letras_recibidas_almacen_at: "2026-10-14T14:00:00Z", despachado_at: "2026-10-14T15:00:00Z" });
    const paso = bloquesPedido(salio).flatMap((b) => b.pasos).find((p) => p.clave === "letras");
    expect(paso?.hecho).toBe(false);
    expect(paso?.trabado).toMatch(/Finanzas tiene que confirmar a quién se entregaron/);
    expect(paso?.responsable).toBe("finanzas");
    const entregadas = bloquesPedido({ ...salio, letras_estado: "entregadas", letras_entregadas_a: "Edinson García" }).flatMap((b) => b.pasos).find((p) => p.clave === "letras");
    expect(entregadas?.hecho).toBe(true);
    expect(entregadas?.detalle).toMatch(/Edinson García/);
  });

  it("sin letras no aparece el paso", () => {
    expect(bloquesPedido(pedido({ forma_pago: "CONTADO" })).flatMap((b) => b.pasos).some((p) => p.clave === "letras")).toBe(false);
  });
});

describe("quién hizo cada etapa (0473)", () => {
  it("el paso hecho trae el nombre de quien lo hizo y la guía dice quién la autorizó", () => {
    const s = pedido({
      aprobado_at: "2026-10-14T13:00:00Z",
      aprobado_por: "u-ariana",
      apertura_despacho_at: "2026-10-14T13:34:00Z",
      apertura_despacho_por: "u-ariana",
      guia_confirmada_at: "2026-10-14T13:51:00Z",
      guia_confirmada_por: "u-fact",
    } as Partial<ServicioPostventa>);
    const pasos = bloquesPedido(s, { "u-ariana": "Ariana", "u-fact": "Facturación 1" }).flatMap((b) => b.pasos);
    expect(pasos.find((p) => p.clave === "aprobado")?.quien).toBe("Ariana");
    expect(pasos.find((p) => p.clave === "apertura")?.detalle).toMatch(/guía autorizada por Facturación 1/);
    // Lo que no está hecho no lleva nombre.
    expect(pasos.find((p) => p.clave === "cerrado")?.quien ?? null).toBeNull();
  });
});

describe("maquinasPorSerie (Rubí 14-10: un informe de puesta en marcha por serie)", () => {
  it("la secadora de la torre sale con su serie, después de su lavadora", () => {
    // El pedido real de la foto de Rubí: una lavadora sola y una torre LG Giant C Max.
    const lista = [
      { id: "a", equipo_id: "e1", serie: "604KWNM5N407", descripcion: "LAVADORA CENTRIFUGA SEMI INDUSTRIAL OPL – APILABLE", parte_de: null, parte_nombre: null },
      { id: "b", equipo_id: "e2", serie: "604KWJU5N412", descripcion: "LAVADORA – SECADORA SEMI INDUSTRIAL", parte_de: null, parte_nombre: null },
      { id: "c", equipo_id: "e3", serie: "304KWUC0V206", descripcion: "Secadora · LAVADORA – SECADORA SEMI INDUSTRIAL", parte_de: "b", parte_nombre: "Secadora" },
    ];
    expect(maquinasPorSerie(lista).map((m) => m.serie)).toEqual(["604KWNM5N407", "604KWJU5N412", "304KWUC0V206"]);
    expect(maquinasPorSerie(lista)[1].descripcion).toMatch(/^Lavadora · /);
    expect(maquinasPorSerie(lista)[2]).toMatchObject({ equipoId: "e3", descripcion: "Secadora · LAVADORA – SECADORA SEMI INDUSTRIAL" });
  });
});

describe("pagoParcialSinCubrir: el abono confirmado que no cubre lo acordado (reunión 15-10)", () => {
  // Wong Lu Vega: US$ 7 900 de contado (100 %), pagó US$ 1 580 (20 %) y
  // Finanzas lo confirmó. Salía en verde y postventa quiso despachar.
  const wong = { monto: 7900, monto_pagado: 1580, pct_antes_despacho: 100, pago_confirmado_at: "2026-10-07T15:40:00Z" };

  it("con cifras dice cuánto pagó, cuánto falta y por qué no sale", () => {
    const r = pagoParcialSinCubrir(pedido(wong));
    expect(r?.corto).toBe("Pagó el 20 % (USD 1,580), faltan USD 6,320");
    expect(r?.largo).toContain("La condición es contado");
    expect(r?.largo).toContain("No se despacha hasta que Finanzas confirme lo que falta");
  });

  it("el paso de pago queda hecho pero con alerta, no verde", () => {
    const pago = bloquesPedido(pedido(wong)).flatMap((b) => b.pasos).find((p) => p.clave === "pago");
    expect(pago?.hecho).toBe(true);
    expect(pago?.etiqueta).toBe("Pago parcial: Finanzas confirmó solo un adelanto, falta el saldo");
    expect(pago?.alerta).toContain("faltan USD 6,320");
  });

  it("sin cifras (postventa no ve montos) lo dice sin números", () => {
    const r = pagoParcialSinCubrir(sinPrecios(pedido(wong)));
    expect(r?.corto).toBe("Pagó solo un adelanto, falta el saldo");
    expect(r?.largo).toContain("La condición es contado");
  });

  it("PRODECO: 50 % acordado y todavía no se llega", () => {
    const r = pagoParcialSinCubrir(pedido({ monto: 49558.82, monto_pagado: 21890, pct_antes_despacho: 50, pago_confirmado_at: "2026-10-01T15:00:00Z" }));
    expect(r?.largo).toContain("La condición es 50 % antes del despacho y todavía no se llega");
  });

  it("la apertura queda trabada: es lo mismo que mira el servidor al emitirla", () => {
    for (const s of [pedido(wong), sinPrecios(pedido(wong))]) {
      const apertura = bloquesPedido(s).flatMap((b) => b.pasos).find((p) => p.clave === "apertura");
      expect(apertura?.hecho).toBe(false);
      expect(apertura?.trabado).toBeTruthy();
    }
    const pagado = bloquesPedido(pedido({ monto: 7900, monto_pagado: 7900, pct_antes_despacho: 100, pago_confirmado_at: "2026-10-07T15:40:00Z" })).flatMap((b) => b.pasos).find((p) => p.clave === "apertura");
    expect(pagado?.trabado ?? "").not.toMatch(/saldo|pago/i);
  });

  it("no aplica cuando el adelanto acordado está cubierto, cuando falta la confirmación, ni con salida autorizada", () => {
    expect(pagoParcialSinCubrir(pedido({ monto: 10000, monto_pagado: 5000, pct_antes_despacho: 50, pago_confirmado_at: "2026-10-01T15:00:00Z" }))).toBeNull();
    expect(pagoParcialSinCubrir(pedido({ ...wong, pago_confirmado_at: null }))).toBeNull();
    expect(pagoParcialSinCubrir(pedido({ ...wong, salida_autorizada_at: "2026-10-08T15:00:00Z" }))).toBeNull();
    expect(pagoParcialSinCubrir(pedido({ ...wong, despachado_at: "2026-10-08T15:00:00Z" }))).toBeNull();
    expect(bloquesPedido(pedido({ monto: 7900, monto_pagado: 7900, pct_antes_despacho: 100, pago_confirmado_at: "2026-10-07T15:40:00Z" })).flatMap((b) => b.pasos).find((p) => p.clave === "pago")?.alerta).toBeUndefined();
  });
});

describe("condicionContadoConSaldo: el aviso del cierre cuando dice contado pero describe un saldo (15-10)", () => {
  it("Wong Lu Vega: 20 % adelanto // 80 % a fin de mes con 100 % antes del despacho", () => {
    expect(condicionContadoConSaldo("20% ADELANTO // 80% FINALES DE MES O PRIMERA SEMANA DE NOVIEMBRE", 100)).toBe(true);
    expect(condicionContadoConSaldo("CONTADO 50% adelanto y saldo contra entrega", 100)).toBe(true);
    expect(condicionContadoConSaldo("CREDITO 30 dias", 100)).toBe(true);
  });
  it("no avisa cuando el porcentaje ya refleja el adelanto, ni cuando todo se paga antes del despacho", () => {
    expect(condicionContadoConSaldo("20% ADELANTO // 80% FINALES DE MES", 20)).toBe(false);
    expect(condicionContadoConSaldo("30% ADELANTO + 70% ANTES DEL DESPACHO", 100)).toBe(false);
    expect(condicionContadoConSaldo("CONTADO", 100)).toBe(false);
    expect(condicionContadoConSaldo("CONTADO", null)).toBe(false);
  });
});

// REUNIÓN DE GERENCIA 20-10 (0551, 0553): reglas nuevas del cierre y del despacho.
describe("cierreExigePuesta (0551)", () => {
  it("un equipo vendido no se cierra sin puesta en marcha", () => {
    expect(cierreExigePuesta({ tipo_pedido: "equipo", origen: "crm" })).toBe(true);
    expect(cierreExigePuesta({ tipo_pedido: null, origen: "crm" })).toBe(true);
  });
  it("el mantenimiento y la revisión tampoco (su informe es la puesta)", () => {
    expect(cierreExigePuesta({ tipo_pedido: "mantenimiento" })).toBe(true);
    expect(cierreExigePuesta({ tipo_pedido: "revision" })).toBe(true);
  });
  it("lo que no se instala sí se cierra sin puesta en marcha", () => {
    expect(cierreExigePuesta({ tipo_pedido: "repuesto", con_instalacion: false })).toBe(false);
    expect(cierreExigePuesta({ tipo_pedido: "embalaje" })).toBe(false);
    expect(cierreExigePuesta({ tipo_pedido: "accesorio" })).toBe(false);
  });
  it("el repuesto con instalación sí la exige", () => {
    expect(cierreExigePuesta({ tipo_pedido: "repuesto", con_instalacion: true })).toBe(true);
  });
  it("lo que vino del Excel se cierra con el atajo de siempre", () => {
    expect(cierreExigePuesta({ tipo_pedido: "equipo", origen: "excel" })).toBe(false);
  });
});

describe("faltanFotosDeAgencia (0553)", () => {
  const base = { despachado_at: "2026-10-14T15:00:00Z", informe_cierre_id: "inf", entrega_modo: "agencia", tipo_pedido: "equipo" as const, agencia_fotos: [] };
  it("salió por agencia y no hay foto: falta", () => {
    expect(faltanFotosDeAgencia(base)).toBe(true);
  });
  it("con la foto ya subida, no falta", () => {
    expect(faltanFotosDeAgencia({ ...base, agencia_fotos: [{ path: "x" }] })).toBe(false);
  });
  it("si se recogió en planta o va a domicilio, no aplica", () => {
    expect(faltanFotosDeAgencia({ ...base, entrega_modo: "planta" })).toBe(false);
    expect(faltanFotosDeAgencia({ ...base, entrega_modo: "domicilio" })).toBe(false);
  });
  it("todavía no salió: no se pide", () => {
    expect(faltanFotosDeAgencia({ ...base, despachado_at: null })).toBe(false);
  });
  it("un servicio no lleva máquina a la agencia", () => {
    expect(faltanFotosDeAgencia({ ...base, tipo_pedido: "mantenimiento" })).toBe(false);
  });
  it("lo que salió antes de que el almacén tuviera cuenta no se reclama", () => {
    expect(faltanFotosDeAgencia({ ...base, despachado_at: "2026-09-10T15:00:00Z" })).toBe(false);
  });
});

describe("paso «Guía y fotos enviadas al cliente» (0553)", () => {
  const paso = (s: ServicioPostventa) => bloquesPedido(s).flatMap((b) => b.pasos).find((p) => p.clave === "guia_cliente");
  it("sale cuando el equipo salió desde el 20-10 y espera el clic de postventa", () => {
    const p = paso(pedido({ despachado_at: "2026-10-21T15:00:00Z" }));
    expect(p).toBeTruthy();
    expect(p!.hecho).toBe(false);
    expect(p!.responsable).toBe("postventa");
  });
  it("queda hecho con el registro del envío", () => {
    const s = pedido({ despachado_at: "2026-10-21T15:00:00Z" }) as ServicioPostventa & { guia_enviada_cliente_at: string };
    s.guia_enviada_cliente_at = "2026-10-21T18:00:00Z";
    expect(paso(s)!.hecho).toBe(true);
  });
  it("no se reabre lo que salió antes del 20-10", () => {
    expect(paso(pedido({ despachado_at: "2026-10-14T15:00:00Z" }))).toBeUndefined();
  });
  it("un servicio no tiene guía que mandar", () => {
    expect(paso(pedido({ despachado_at: "2026-10-21T15:00:00Z", tipo_pedido: "mantenimiento" }))).toBeUndefined();
  });
});

// CASO ANDEX (20-10): la apertura no se manda por correo sin emitirla; se dice qué falta.
describe("faltaParaEmitirApertura", () => {
  it("con pasos sin hacer antes de la apertura, los nombra", () => {
    const falta = faltaParaEmitirApertura(pedido({}));
    expect(falta.length).toBeGreaterThan(0);
    expect(falta.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
  });
  it("ya emitida, no falta nada", () => {
    expect(faltaParaEmitirApertura(pedido({ apertura_despacho_at: "2026-10-20T15:00:00Z" } as Partial<ServicioPostventa>))).toEqual([]);
  });
});
