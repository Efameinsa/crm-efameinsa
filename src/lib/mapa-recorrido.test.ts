import { describe, expect, it } from "vitest";
import { haceCuanto, rutaDeRecepcion, rutaDelCaso, rutaDelPedido, resumenDeRuta } from "@/lib/mapa-recorrido";
import type { ServicioPostventa } from "@/lib/postventa";

// Un pedido de equipo recién liberado: lo mínimo para que bloquesPedido lo recorra.
const pedido = (x: Partial<ServicioPostventa> & Record<string, unknown> = {}) =>
  ({
    id: "p1",
    tipo_pedido: "equipo",
    equipo: "Lavadora UW060",
    cliente_texto: "Cliente SAC",
    informe_cierre_id: "c1",
    numero_pedido_erp: "PED-0001",
    created_at: "2026-10-10T15:00:00Z",
    series_pedidas_at: "2026-10-10T16:00:00Z",
    liquidacion_adjunto: "liq.pdf",
    liquidacion_at: "2026-10-11T15:00:00Z",
    pedido_ejecutado_at: "2026-10-12T15:00:00Z",
    completado: false,
    cerrado_at: null,
    moneda: "PEN",
    monto: null,
    monto_pagado: null,
    ...x,
  }) as unknown as ServicioPostventa;

describe("mapa del pedido", () => {
  it("lo hecho por Central queda en verde y se atasca en el primer paso de postventa sin hacer", () => {
    const r = rutaDelPedido(pedido({ pago_confirmado_at: "2026-10-12T16:00:00Z", estado_pago: "completo" }), { sinSerie: 0 });
    const claves = r.etapas.map((e) => e.clave);
    expect(claves.slice(0, 6)).toEqual(["cierre", "series", "pedido_generado", "liquidacion_subida", "liquidacion_aceptada", "ejecutado"]);
    expect(r.etapas.slice(0, 6).every((e) => e.hecho)).toBe(true);
    expect(r.actual).toBeGreaterThanOrEqual(6);
    const actual = r.etapas[r.actual];
    expect(actual.hecho).toBe(false);
    expect(actual.noAplica).toBeUndefined();
  });

  it("antes de ejecutarse, el atasco es de Central o de Finanzas, no de postventa", () => {
    const r = rutaDelPedido(pedido({ liquidacion_adjunto: null, liquidacion_at: null, pedido_ejecutado_at: null }), { sinSerie: 0 });
    expect(r.etapas[r.actual].clave).toBe("liquidacion_subida");
    expect(r.etapas[r.actual].area).toBe("finanzas");
    expect(resumenDeRuta(r)).toContain("Finanzas");
  });

  it("si Central no pidió las series, el atasco es de Central; si las pidió, del almacén", () => {
    const sinPedir = rutaDelPedido(pedido({ series_pedidas_at: null, numero_pedido_erp: null, liquidacion_adjunto: null, liquidacion_at: null, pedido_ejecutado_at: null }), { sinSerie: 2 });
    expect(sinPedir.etapas[sinPedir.actual]).toMatchObject({ clave: "series", area: "central" });
    const pedidas = rutaDelPedido(pedido({ numero_pedido_erp: null, liquidacion_adjunto: null, liquidacion_at: null, pedido_ejecutado_at: null }), { sinSerie: 2 });
    expect(pedidas.etapas[pedidas.actual]).toMatchObject({ clave: "series", area: "almacen" });
  });

  it("ejecutado con series pendientes: las series no se pintan en rojo", () => {
    const r = rutaDelPedido(pedido(), { sinSerie: 1 });
    const series = r.etapas.find((e) => e.clave === "series")!;
    expect(series.hecho).toBe(false);
    expect(series.noAplica).toMatch(/pendiente/);
    expect(r.etapas[r.actual].clave).not.toBe("series");
  });

  it("un pedido cerrado no tiene etapa atascada", () => {
    const r = rutaDelPedido(pedido({ cerrado_at: "2026-10-20T15:00:00Z" }), { sinSerie: 0 });
    expect(r.actual).toBe(-1);
    expect(resumenDeRuta(r)).toBe("Recorrido completo");
  });

  it("con la apertura emitida aparece la guía de Contabilidad", () => {
    const r = rutaDelPedido(pedido({ apertura_despacho_at: "2026-10-15T15:00:00Z" }), { sinSerie: 0 });
    const i = r.etapas.findIndex((e) => e.clave === "apertura");
    expect(r.etapas[i + 1]).toMatchObject({ clave: "guia", area: "contabilidad", hecho: false });
  });
});

describe("mapa del caso", () => {
  const caso = { id: "a1", codigo: "CASO-00001", tipo: "problema_tecnico", solicitado_at: "2026-10-20T15:00:00Z", en_garantia: true, programada_at: null, etapas_omitidas: {}, cerrado_at: null } as const;

  it("recién derivado: Central ya hizo lo suyo y le toca a postventa anotar los antecedentes", () => {
    const r = rutaDelCaso({ ...caso, etapa: "registro", registrado_at: "2026-10-20T15:10:00Z" } as never);
    expect(r.etapas.slice(0, 2).every((e) => e.hecho)).toBe(true);
    expect(r.etapas[r.actual]).toMatchObject({ clave: "diagnostico", area: "postventa" });
  });

  it("en pruebas, la conformidad es del cliente", () => {
    const r = rutaDelCaso({ ...caso, etapa: "pruebas" } as never);
    expect(r.etapas[r.actual]).toMatchObject({ clave: "pruebas", area: "cliente" });
  });

  it("un repuesto no lleva pruebas: no corresponde, ni verde ni rojo", () => {
    const r = rutaDelCaso({ ...caso, tipo: "solicitud_repuesto", etapa: "atencion" } as never);
    expect(r.etapas.find((e) => e.clave === "pruebas")!.noAplica).toBeTruthy();
    expect(r.etapas[r.actual].clave).toBe("cierre");
  });

  it("una etapa saltada con su motivo no se pinta verde ni roja", () => {
    const r = rutaDelCaso({ ...caso, tipo: "puesta_en_marcha", etapa: "planificacion", etapas_omitidas: { diagnostico: { motivo: "sin historia" } } } as never);
    expect(r.etapas.find((e) => e.clave === "diagnostico")!.noAplica).toBe("Saltado: sin historia");
  });

  it("cerrado: terminado", () => {
    const r = rutaDelCaso({ ...caso, etapa: "cierre", cerrado_at: "2026-10-21T15:00:00Z" } as never);
    expect(r.actual).toBe(-1);
  });
});

describe("mapa de la recepción en planta", () => {
  it("llegó pero falta revisar: le toca al almacén", () => {
    const r = rutaDeRecepcion({ id: "r1", codigo: "REC-00001", created_at: "2026-10-20T15:00:00Z", recibido_at: "2026-10-21T15:00:00Z", revisado_at: null, listo_at: null });
    expect(r.etapas[r.actual]).toMatchObject({ clave: "revisado", area: "almacen" });
    expect(r.desde).toBe("2026-10-21T15:00:00Z");
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-10-23T15:00:00Z");
  it("minutos, horas y días", () => {
    expect(haceCuanto("2026-10-23T14:30:00Z", ahora)).toBe("hace 30 min");
    expect(haceCuanto("2026-10-23T05:00:00Z", ahora)).toBe("hace 10 h");
    expect(haceCuanto("2026-10-20T15:00:00Z", ahora)).toBe("hace 3 d");
    expect(haceCuanto(null, ahora)).toBeNull();
  });
});
