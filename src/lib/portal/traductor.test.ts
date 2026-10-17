import { describe, expect, test } from "vitest";
import {
  clasificarArchivo,
  diaComoIso,
  estadoCotizacionCliente,
  etapaCasoCliente,
  nombreDocumento,
  normalizarTelefono,
  pasosDelPedido,
  tipoCasoCliente,
  tipoPedidoCliente,
  tituloPedido,
  validaHasta,
  type PedidoParaCliente,
} from "./traductor";

const base: PedidoParaCliente = {
  id: "p1",
  created_at: "2026-10-01T15:00:00Z",
  origen: "cierre",
  tipo_pedido: "equipo",
  tipo_servicio: "venta",
  modalidad: "lima",
  completado: false,
  cerrado_at: null,
};

const claves = (s: PedidoParaCliente, extra?: Parameters<typeof pasosDelPedido>[1]) => pasosDelPedido(s, extra).map((p) => p.clave);

describe("pasos del pedido", () => {
  test("un equipo en Lima recorre todos los pasos, sin agencia", () => {
    expect(claves(base)).toEqual([
      "confirmado",
      "pago",
      "plano",
      "probado",
      "despacho_programado",
      "salio",
      "recibido",
      "instalacion_agendada",
      "tecnico_salio",
      "tecnico_llego",
      "puesta_en_marcha",
      "documentos",
    ]);
  });

  test("con agencia aparece «En la agencia de su ciudad», y sin agencia no", () => {
    expect(claves({ ...base, entrega_modo: "agencia" })).toContain("agencia");
    expect(claves({ ...base, entrega_modo: "domicilio" })).not.toContain("agencia");
  });

  test("el confirmado siempre tiene fecha; lo que falta queda pendiente", () => {
    const pasos = pasosDelPedido({ ...base, aprobado_at: "2026-10-02T10:00:00Z" });
    expect(pasos[0]).toEqual({ clave: "confirmado", fecha: "2026-10-02T10:00:00Z" });
    expect(pasos.find((p) => p.clave === "salio")?.fecha).toBeNull();
  });

  test("las fechas reales llegan a su paso", () => {
    const s: PedidoParaCliente = {
      ...base,
      entrega_modo: "agencia",
      pago_confirmado_at: "2026-10-03T10:00:00Z",
      plano_enviado_at: "2026-10-03T11:00:00Z",
      prueba_lista_at: "2026-10-04T10:00:00Z",
      fecha_despacho: "2026-10-05",
      despacho_hora: "09:30",
      despachado_at: "2026-10-05T14:00:00Z",
      agencia_at: "2026-10-06T15:00:00Z",
      recibido_cliente_at: "2026-10-07T16:00:00Z",
      tecnico_salio_at: "2026-10-08T13:00:00Z",
      tecnico_llego_at: "2026-10-08T15:00:00Z",
      puesta_en_marcha: "2026-10-08",
    };
    const f = Object.fromEntries(pasosDelPedido(s, { instalacionProgramada: "2026-10-08T14:00:00Z", documentosAt: "2026-10-09T10:00:00Z" }).map((p) => [p.clave, p.fecha]));
    expect(f.pago).toBe("2026-10-03T10:00:00Z");
    expect(f.despacho_programado).toBe("2026-10-05T09:30:00-05:00");
    expect(f.agencia).toBe("2026-10-06T15:00:00Z");
    expect(f.recibido).toBe("2026-10-07T16:00:00Z");
    expect(f.instalacion_agendada).toBe("2026-10-08T14:00:00Z");
    expect(f.tecnico_salio).toBe("2026-10-08T13:00:00Z");
    expect(f.puesta_en_marcha).toBe("2026-10-08T12:00:00-05:00");
    expect(f.documentos).toBe("2026-10-09T10:00:00Z");
  });

  test("un repuesto sin instalación no tiene técnico ni puesta en marcha, ni plano", () => {
    const c = claves({ ...base, tipo_pedido: "repuesto" });
    expect(c).not.toContain("plano");
    expect(c).not.toContain("tecnico_salio");
    expect(c).not.toContain("puesta_en_marcha");
    expect(c).toContain("salio");
  });

  test("un repuesto que se recoge en planta: sin despacho, entregarlo es recibirlo", () => {
    const pasos = pasosDelPedido({ ...base, tipo_pedido: "repuesto", entrega_en: "planta", despachado_at: "2026-10-05T14:00:00Z" });
    const c = pasos.map((p) => p.clave);
    expect(c).not.toContain("salio");
    expect(c).not.toContain("despacho_programado");
    expect(pasos.find((p) => p.clave === "recibido")?.fecha).toBe("2026-10-05T14:00:00Z");
  });

  test("un mantenimiento: sin probado ni despacho; «despachado» es el técnico en el cliente", () => {
    const pasos = pasosDelPedido({ ...base, tipo_pedido: "mantenimiento", fecha_despacho: "2026-10-10", despachado_at: "2026-10-10T15:00:00Z" });
    const c = pasos.map((p) => p.clave);
    expect(c).toEqual(["confirmado", "pago", "instalacion_agendada", "tecnico_salio", "tecnico_llego", "puesta_en_marcha", "documentos"]);
    const f = Object.fromEntries(pasos.map((p) => [p.clave, p.fecha]));
    expect(f.instalacion_agendada).toBe("2026-10-10T12:00:00-05:00");
    expect(f.tecnico_llego).toBe("2026-10-10T15:00:00Z");
  });

  test("el pedido sin cobro (abierto desde un caso) no muestra el pago", () => {
    expect(claves({ ...base, origen: "caso", tipo_pedido: "repuesto" })).not.toContain("pago");
  });

  test("en provincia el técnico solo aparece si alguien lo marcó (la puesta suele ser por videollamada)", () => {
    expect(claves({ ...base, modalidad: "provincia" })).not.toContain("tecnico_salio");
    expect(claves({ ...base, modalidad: "provincia", tecnico_salio_at: "2026-10-08T13:00:00Z" })).toContain("tecnico_salio");
  });

  test("lo del Excel marcado «SI» sin fecha se ve hecho", () => {
    const pasos = pasosDelPedido({ ...base, confirmacion_abono: "SI", prueba_embalaje: "si" });
    expect(pasos.find((p) => p.clave === "pago")?.fecha).not.toBeNull();
    expect(pasos.find((p) => p.clave === "probado")?.fecha).not.toBeNull();
  });

  test("un pedido cerrado no deja ningún paso pendiente", () => {
    const pasos = pasosDelPedido({ ...base, completado: true, cerrado_at: "2026-09-01T10:00:00Z" });
    expect(pasos.every((p) => p.fecha)).toBe(true);
  });

  test("ningún paso sale con una clave fuera del contrato", () => {
    const permitidas = new Set([
      "confirmado", "pago", "plano", "probado", "despacho_programado", "salio", "agencia", "recibido",
      "instalacion_agendada", "tecnico_salio", "tecnico_llego", "puesta_en_marcha", "documentos",
    ]);
    for (const tipo of ["equipo", "repuesto", "accesorio", "mantenimiento", "revision", "embalaje"] as const) {
      for (const p of pasosDelPedido({ ...base, tipo_pedido: tipo, entrega_modo: "agencia" })) expect(permitidas.has(p.clave)).toBe(true);
    }
  });
});

describe("tipo de pedido", () => {
  test("se traduce al vocabulario del contrato", () => {
    expect(tipoPedidoCliente({ tipo_pedido: "equipo", tipo_servicio: "venta" })).toBe("equipo");
    expect(tipoPedidoCliente({ tipo_pedido: null, tipo_servicio: "venta" })).toBe("equipo");
    expect(tipoPedidoCliente({ tipo_pedido: "repuesto", tipo_servicio: "venta" })).toBe("repuesto");
    expect(tipoPedidoCliente({ tipo_pedido: "accesorio", tipo_servicio: "venta" })).toBe("repuesto");
    expect(tipoPedidoCliente({ tipo_pedido: "mantenimiento", tipo_servicio: "Mantenimiento" })).toBe("mantenimiento");
    expect(tipoPedidoCliente({ tipo_pedido: "repuesto", tipo_servicio: "GARANTÍA · ENTREGA DE REPUESTOS" })).toBe("garantia");
    expect(tipoPedidoCliente({ tipo_pedido: "revision", tipo_servicio: "x", apertura_tipo: "entrega_garantia" })).toBe("garantia");
    expect(tipoPedidoCliente({ tipo_pedido: "revision", tipo_servicio: "revisión" })).toBe("otro");
    expect(tipoPedidoCliente({ tipo_pedido: "embalaje", tipo_servicio: "x" })).toBe("otro");
  });

  test("el título es el primer renglón del equipo", () => {
    expect(tituloPedido("Lavadora UniMac UW45\nSecadora")).toBe("Lavadora UniMac UW45");
    expect(tituloPedido(null)).toBe("Su pedido");
    expect(tituloPedido("x".repeat(200)).length).toBe(118);
  });
});

describe("etapa del caso", () => {
  test("de las nueve etapas del CRM a las seis del cliente", () => {
    expect(etapaCasoCliente({ etapa: "solicitud" })).toBe("recibido");
    expect(etapaCasoCliente({ etapa: "diagnostico" })).toBe("recibido");
    expect(etapaCasoCliente({ etapa: "planificacion" })).toBe("programado");
    expect(etapaCasoCliente({ etapa: "diagnostico", programada_at: "2026-10-10T10:00:00Z" })).toBe("programado");
    expect(etapaCasoCliente({ etapa: "planificacion", tecnico_salio_at: "x" })).toBe("en_camino");
    expect(etapaCasoCliente({ etapa: "planificacion", tecnico_salio_at: "x", tecnico_llego_at: "y" })).toBe("en_atencion");
    expect(etapaCasoCliente({ etapa: "pruebas" })).toBe("en_atencion");
    expect(etapaCasoCliente({ etapa: "seguimiento" })).toBe("resuelto");
    expect(etapaCasoCliente({ etapa: "cierre", cerrado_at: "z", resultado: "resuelto" })).toBe("resuelto");
    expect(etapaCasoCliente({ etapa: "cierre", cerrado_at: "z", resultado: "no_procede" })).toBe("cerrado");
  });

  test("el tipo de caso desconocido es «otro»", () => {
    expect(tipoCasoCliente("problema_tecnico")).toBe("problema_tecnico");
    expect(tipoCasoCliente("algo_interno")).toBe("otro");
    expect(tipoCasoCliente(null)).toBe("otro");
  });
});

describe("cotización", () => {
  const ahora = new Date("2026-10-17T12:00:00Z").getTime();
  test("el borrador no se muestra", () => {
    expect(estadoCotizacionCliente({ estado: "borrador" }, null, ahora)).toBeNull();
  });
  test("enviada que pasó su validez se lee vencida", () => {
    expect(estadoCotizacionCliente({ estado: "enviada" }, "2026-10-01T00:00:00Z", ahora)).toBe("vencida");
    expect(estadoCotizacionCliente({ estado: "enviada" }, "2026-10-30T00:00:00Z", ahora)).toBe("enviada");
  });
  test("anulada manda aunque el estado diga otra cosa", () => {
    expect(estadoCotizacionCliente({ estado: "enviada", anulada_at: "2026-10-02T00:00:00Z" }, null, ahora)).toBe("anulada");
  });
  test("la validez se cuenta desde que salió", () => {
    expect(validaHasta({ enviada_at: "2026-10-01T00:00:00.000Z", vigencia_dias: 15 })).toBe("2026-10-16T00:00:00.000Z");
    expect(validaHasta({ enviada_at: null, created_at: null, vigencia_dias: 15 })).toBeNull();
  });
});

describe("archivos", () => {
  test("foto, documento o nada", () => {
    expect(clasificarArchivo({ path: "a/b.jpg", tipo: "image/jpeg", etiqueta: "frente" })).toBe("foto");
    expect(clasificarArchivo({ path: "a/b.jpg", tipo: "image/jpeg", etiqueta: "guia" })).toBe("documento");
    expect(clasificarArchivo({ path: "a/b.pdf", tipo: "application/pdf" })).toBe("documento");
    expect(clasificarArchivo({ path: "a/b.mp4", tipo: "video/mp4", etiqueta: "video" })).toBeNull();
    expect(clasificarArchivo({ path: "" })).toBeNull();
    expect(clasificarArchivo(null)).toBeNull();
  });
  test("el nombre del documento lo entiende el cliente", () => {
    expect(nombreDocumento({ etiqueta: "guia" }, "salida")).toBe("Guía de remisión");
    expect(nombreDocumento({}, "protocolo")).toBe("Protocolo de prueba");
    expect(nombreDocumento({}, "puesta_en_marcha")).toBe("Informe de puesta en marcha");
    expect(nombreDocumento({}, "informe")).toBe("Informe de servicio");
  });
});

describe("teléfono y fechas", () => {
  test("normaliza igual que normalizar_telefono de la base", () => {
    expect(normalizarTelefono("+51 987 654 321")).toBe("987654321");
    expect(normalizarTelefono("987-654-321")).toBe("987654321");
    expect(normalizarTelefono("51987654321")).toBe("987654321");
    expect(normalizarTelefono("(01) 504-1695")).toBe("015041695");
    expect(normalizarTelefono(null)).toBeNull();
  });
  test("un día solo queda a mediodía de Lima", () => {
    expect(diaComoIso("2026-10-17")).toBe("2026-10-17T12:00:00-05:00");
    expect(diaComoIso("2026-10-17", "9:05")).toBe("2026-10-17T09:05:00-05:00");
    expect(diaComoIso(null)).toBeNull();
    expect(diaComoIso("hola")).toBeNull();
  });
});
