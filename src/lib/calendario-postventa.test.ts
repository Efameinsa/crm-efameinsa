import { describe, expect, it } from "vitest";
import {
  eventosDePedido,
  eventoDeCaso,
  agruparPorDia,
  filtrarPorZona,
  sinFecha,
  type CasoAgendable,
} from "./calendario-postventa";
import { lunesDe, diasDeSemana, sumarDias, sumarMes, diasDelMes, rotuloSemana } from "./calendario";
import type { ServicioPostventa } from "./postventa";

function pedido(p: Partial<ServicioPostventa> = {}): ServicioPostventa {
  return {
    id: "srv-1",
    cliente_texto: "LAVANDERÍA PRE ANDINA S.A.C.",
    cuenta_id: null,
    equipo: "LAVADORA TITAN MAX 17 KG",
    tipo_servicio: "venta",
    ubicacion: "LA VICTORIA",
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
    informe_cierre_id: null,
    numero_pedido_erp: null,
    pedido_ejecutado_at: null,
    liquidacion_at: null,
    aprobado_at: null,
    modalidad: "lima",
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
    ...p,
  };
}

function caso(p: Partial<CasoAgendable> = {}): CasoAgendable {
  return {
    id: "op-1",
    tipo_postventa: "garantia",
    intencion: null,
    etapa: "asignada",
    proxima_accion: "Visita técnica",
    proxima_accion_at: "2026-08-27",
    proxima_accion_hora: "10:00:00",
    cliente: "CLÍNICA SAN GABRIEL",
    zona: null,
    ...p,
  };
}

describe("eventosDePedido", () => {
  it("saca las dos citas que mueven gente: despacho y puesta en marcha", () => {
    const e = eventosDePedido(pedido({ fecha_despacho: "2026-08-24", puesta_en_marcha: "2026-08-27" }));
    expect(e.map((x) => x.tipo)).toEqual(["despacho", "puesta_en_marcha"]);
    expect(e[0].href).toBe("/postventa/pedidos/srv-1");
    expect(e[1].titulo).toBe("Puesta en marcha");
  });

  it("no inventa citas cuando el pedido no tiene fecha", () => {
    expect(eventosDePedido(pedido())).toEqual([]);
  });

  it("marca lo ya ocurrido sin sacarlo del calendario", () => {
    const [despacho] = eventosDePedido(
      pedido({ fecha_despacho: "2026-08-24", despachado_at: "2026-08-24T15:00:00Z" }),
    );
    expect(despacho.hecho).toBe(true);
    expect(despacho.titulo).toBe("Despachado");
  });

  it("avisa que la puesta en marcha de provincia es remota: no se manda técnico", () => {
    const [puesta] = eventosDePedido(pedido({ puesta_en_marcha: "2026-08-27", modalidad: "provincia" }));
    expect(puesta.titulo).toBe("Puesta en marcha (remota)");
    expect(puesta.zona).toBe("provincia");
  });
});

describe("eventoDeCaso", () => {
  it("agenda el compromiso del caso con su hora", () => {
    const e = eventoDeCaso(caso())!;
    expect(e.fecha).toBe("2026-08-27");
    expect(e.hora).toBe("10:00");
    expect(e.href).toBe("/comercial/oportunidades/op-1");
    expect(e.tipo).toBe("garantia");
  });

  it("un caso sin fecha comprometida no entra al calendario", () => {
    expect(eventoDeCaso(caso({ proxima_accion_at: null }))).toBeNull();
  });
});

describe("agruparPorDia", () => {
  it("ordena el día por hora y deja lo sin hora al final", () => {
    const eventos = [
      { ...eventoDeCaso(caso({ id: "b", proxima_accion_hora: null }))! },
      { ...eventoDeCaso(caso({ id: "a", proxima_accion_hora: "09:30:00" }))! },
      { ...eventoDeCaso(caso({ id: "c", proxima_accion_hora: "15:00:00" }))! },
    ];
    const dia = agruparPorDia(eventos).get("2026-08-27")!;
    expect(dia.map((e) => e.clave)).toEqual(["caso-a", "caso-c", "caso-b"]);
  });
});

describe("filtrarPorZona", () => {
  const lima = eventosDePedido(pedido({ id: "l", fecha_despacho: "2026-08-24", modalidad: "lima" }));
  const provincia = eventosDePedido(pedido({ id: "p", fecha_despacho: "2026-08-24", modalidad: "provincia" }));
  const sinZona = [eventoDeCaso(caso())!];

  it("separa las dos formas de planificar", () => {
    expect(filtrarPorZona([...lima, ...provincia], "lima").map((e) => e.clave)).toEqual(["l-despacho"]);
    expect(filtrarPorZona([...lima, ...provincia], "provincia").map((e) => e.clave)).toEqual(["p-despacho"]);
  });

  it("nunca esconde lo que no tiene zona cargada", () => {
    expect(filtrarPorZona([...lima, ...sinZona], "provincia").map((e) => e.clave)).toContain("caso-op-1");
  });

  it("sin filtro devuelve todo", () => {
    expect(filtrarPorZona([...lima, ...provincia], "")).toHaveLength(2);
  });
});

describe("sinFecha", () => {
  it("junta los pedidos abiertos sin ninguna fecha — es donde el trabajo desaparece", () => {
    const abiertos = [
      pedido({ id: "1" }),
      pedido({ id: "2", fecha_despacho: "2026-08-24" }),
      pedido({ id: "3", completado: true }),
      pedido({ id: "4", puesta_en_marcha: "2026-09-01" }),
    ];
    expect(sinFecha(abiertos).map((s) => s.id)).toEqual(["1"]);
  });
});

describe("la grilla compartida con la agenda comercial", () => {
  it("la semana empieza el lunes y llega al sábado, que también se trabaja", () => {
    expect(lunesDe("2026-08-28")).toBe("2026-08-24"); // viernes → lunes 24
    expect(lunesDe("2026-08-24")).toBe("2026-08-24");
    expect(diasDeSemana("2026-08-24")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  it("cruza meses y años sin correrse un día", () => {
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarMes("2026-12", 1)).toBe("2027-01");
    expect(lunesDe("2026-01-01")).toBe("2025-12-29");
  });

  it("la grilla del mes arranca en lunes y cubre el mes entero", () => {
    const dias = diasDelMes("2026-08");
    expect(dias[0].iso).toBe("2026-07-27"); // el lunes anterior al 1 de agosto
    expect(dias.filter((d) => !d.otroMes)).toHaveLength(31);
  });

  it("rotula la semana como se dice en voz alta", () => {
    expect(rotuloSemana("2026-08-24")).toBe("Semana del 24 al 29 de agosto");
    expect(rotuloSemana("2026-08-31")).toBe("Semana del 31 de agosto al 5 de septiembre de 2026");
  });
});
