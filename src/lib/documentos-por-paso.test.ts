import { describe, expect, it } from "vitest";
import { documentosPorPaso } from "./documentos-por-paso";

const base = {
  servicioId: "s1",
  cierre: null,
  cotizacion: null,
  adjuntos: [],
  capturaFinanzas: null,
  protocolo: false,
  aperturaDespacho: false,
  fotos: [],
  aperturas: [],
  informes: [],
};

describe("documentosPorPaso", () => {
  it("el cierre, la cotización y la OC van en «aprobado»; captura y voucher en «pago»", () => {
    const d = documentosPorPaso({
      ...base,
      cierre: { id: "c1", codigo: "024-2026" },
      cotizacion: { id: "q1", codigo: "Presu_741-26" },
      capturaFinanzas: "https://x/captura",
      adjuntos: [
        { tipo: "voucher", nombre: "v.jpg", url: "https://x/v" },
        { tipo: "orden_compra", nombre: "oc.pdf", url: "https://x/oc" },
        { tipo: "cotizacion", nombre: "Presu_663-26, JULCA GUEVARA YANET.pdf", url: "https://x/c" },
        { tipo: "otro", nombre: "ruc.pdf", url: "https://x/ruc" },
      ],
    });
    expect(d.aprobado.map((x) => x.texto)).toEqual(["Cierre N.º 024-2026", "Cotización Presu_741-26", "Cotización Presu_663-26", "Orden de compra"]);
    expect(d.aprobado[0]).toMatchObject({ href: "/api/informes/c1/pdf", tipo: "pdf" });
    expect(d.pago.map((x) => x.texto)).toEqual(["Captura de Finanzas", "Voucher"]);
  });

  it("protocolo, apertura, guía, fotos de salida y máquina entregada", () => {
    const d = documentosPorPaso({
      ...base,
      protocolo: true,
      aperturaDespacho: true,
      fotos: [
        { etiqueta: "protocolo", nombre: "p", url: "u1" },
        { etiqueta: "frente", nombre: "f", url: "u2" },
        { etiqueta: "video", nombre: "v", url: "u3" },
        { etiqueta: "guia", nombre: "g.pdf", url: "u4" },
        { etiqueta: "maquina", nombre: "m", url: "u5" },
      ],
    });
    expect(d.prueba[0].href).toBe("/pedidos/s1/protocolo");
    expect(d.apertura[0].href).toBe("/postventa/pedidos/s1/apertura");
    expect(d.despacho.map((x) => x.texto)).toEqual(["Guía de remisión", "Fotos de la salida (2)"]);
    expect(d.verificado[0]).toMatchObject({ texto: "Máquina entregada", href: "u5" });
  });

  it("cada llamada va a su paso; la anulada no; la puesta en el local sin repetir la de la llamada", () => {
    const d = documentosPorPaso({
      ...base,
      aperturas: [
        { id: "a1", tipo: "videollamada_preinstalacion", anulada: false, revisada: true, conHojaCliente: true, informeId: "i1", informeNumero: "012-2026" },
        { id: "a2", tipo: "videollamada_puesta_marcha", anulada: false, revisada: false, conHojaCliente: false, informeId: null, informeNumero: null },
        { id: "a3", tipo: "soporte_videollamada", anulada: true, revisada: false, conHojaCliente: false, informeId: "i9", informeNumero: "099-2026" },
      ],
      informes: [
        { id: "i1", tipo: "videollamada_preinstalacion", numero: "012-2026" },
        { id: "i2", tipo: "puesta_en_marcha", numero: "015-2026" },
        { id: "i3", tipo: "mantenimiento_preventivo", numero: "020-2026" },
      ],
    });
    expect(d.preinstalacion.map((x) => x.texto)).toEqual(["Informe N.º 012-2026", "Hoja para el cliente"]);
    expect(d.puesta.map((x) => x.texto)).toEqual(["Llamada de puesta en marcha (sin informe aún)", "Informe N.º 015-2026"]);
  });

  it("un archivo que no se pudo firmar no deja un enlace roto", () => {
    const d = documentosPorPaso({ ...base, adjuntos: [{ tipo: "voucher", nombre: "v", url: null }] });
    expect(d.pago).toBeUndefined();
  });
});
