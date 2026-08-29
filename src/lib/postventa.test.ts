import { describe, expect, it } from "vitest";
import {
  seriesDeTexto,
  estadoGarantia,
  slaCaso,
  estadoPago,
  sinPrecios,
  puedeVerPrecios,
  bloquesPedido,
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

  it("respeta el 'SI' del Excel y la confirmación explícita", () => {
    expect(estadoPago(pedido({ monto: 10000, confirmacion_abono: "SI" }))).toBe("completo");
    expect(estadoPago(pedido({ monto: 10000, pago_confirmado_at: "2026-08-01T10:00:00Z" }))).toBe("completo");
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
    expect(pasoDePago(tapado).etiqueta).toBe("Falta el saldo");
    // Sin cifra: la etiqueta no puede nombrar el saldo.
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
