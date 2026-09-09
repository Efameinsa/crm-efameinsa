import { describe, expect, it } from "vitest";
import { casilleroDelPedido, contarElDia } from "./dia-postventa";
import type { ServicioPostventa } from "./postventa";

const pedido = (x: Partial<ServicioPostventa>): ServicioPostventa =>
  ({
    id: "s1",
    completado: false,
    cerrado_at: null,
    despachado_at: null,
    puesta_en_marcha: null,
    apertura_despacho_at: null,
    fecha_despacho: null,
    ...x,
  }) as unknown as ServicioPostventa;

const HOY = "2026-09-09";

describe("el día del área: cada pedido cae en UNA sola casilla", () => {
  it("lo cerrado no pide nada", () => {
    expect(casilleroDelPedido(pedido({ completado: true }), HOY)).toBeNull();
    expect(casilleroDelPedido(pedido({ cerrado_at: "2026-09-01T10:00:00Z" }), HOY)).toBeNull();
  });

  it("despachado y andando tampoco", () => {
    expect(casilleroDelPedido(pedido({ despachado_at: "2026-09-02T10:00:00Z", puesta_en_marcha: "2026-09-03" }), HOY))
      .toBeNull();
  });

  it("despachado sin puesta en marcha es lo primero que se mira", () => {
    expect(casilleroDelPedido(pedido({ despachado_at: "2026-09-02T10:00:00Z" }), HOY)).toBe("puesta_pendiente");
  });

  // Es el error que hace desconfiar de un tablero: el mismo pedido contado dos
  // veces. Un despacho ya salido conserva su fecha y no vuelve a «programado».
  it("un pedido despachado NO vuelve a contarse como programado", () => {
    const s = pedido({ apertura_despacho_at: "2026-09-01T10:00:00Z", fecha_despacho: "2026-09-05", despachado_at: "2026-09-05T15:00:00Z" });
    expect(casilleroDelPedido(s, HOY)).toBe("puesta_pendiente");
  });

  it("con apertura y fecha, es un despacho programado", () => {
    expect(casilleroDelPedido(pedido({ apertura_despacho_at: "2026-09-01T10:00:00Z", fecha_despacho: "2026-09-10" }), HOY))
      .toBe("despacho_programado");
  });

  it("con apertura y sin fecha, solo falta decidir cuándo sale", () => {
    expect(casilleroDelPedido(pedido({ apertura_despacho_at: "2026-09-01T10:00:00Z" }), HOY)).toBe("listo_sin_fecha");
  });

  it("sin apertura, está en preparación", () => {
    expect(casilleroDelPedido(pedido({}), HOY)).toBe("sin_apertura");
  });
});

describe("contarElDia", () => {
  it("suma cada pedido una vez y marca los atrasados", () => {
    const cuenta = contarElDia(
      [
        pedido({ despachado_at: "2026-09-02T10:00:00Z" }),
        pedido({ apertura_despacho_at: "2026-09-01T10:00:00Z", fecha_despacho: "2026-09-04" }), // atrasado
        pedido({ apertura_despacho_at: "2026-09-01T10:00:00Z", fecha_despacho: "2026-09-12" }),
        pedido({ apertura_despacho_at: "2026-09-01T10:00:00Z" }),
        pedido({}),
        pedido({ completado: true }),
      ],
      HOY,
    );
    const de = (c: string) => cuenta.find((x) => x.casillero === c)!;
    expect(de("puesta_pendiente").cuantos).toBe(1);
    expect(de("despacho_programado").cuantos).toBe(2);
    expect(de("despacho_programado").atrasados).toBe(1);
    expect(de("listo_sin_fecha").cuantos).toBe(1);
    expect(de("sin_apertura").cuantos).toBe(1);
    // Los seis pedidos, menos el cerrado, contados exactamente una vez.
    expect(cuenta.reduce((t, x) => t + x.cuantos, 0)).toBe(5);
  });

  it("un despacho de HOY todavía no está atrasado", () => {
    const cuenta = contarElDia(
      [pedido({ apertura_despacho_at: "2026-09-01T10:00:00Z", fecha_despacho: HOY })],
      HOY,
    );
    expect(cuenta.find((x) => x.casillero === "despacho_programado")!.atrasados).toBe(0);
  });
});
