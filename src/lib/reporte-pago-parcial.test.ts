import { describe, expect, it } from "vitest";
import type { ServicioPostventa } from "@/lib/postventa";
import { filasPagoParcial } from "@/lib/reporte-pendientes";

const base = {
  id: "x",
  cliente_texto: "20123456789 - HOTEL PRUEBA SAC",
  equipo: "LAVADORA UNIMAC",
  monto: 1000,
  monto_pagado: 300,
  moneda: "USD",
  forma_pago: "30 % adelanto, saldo contra entrega",
  informe_cierre_id: "inf",
  origen: "cierre",
  pago_confirmado_at: null,
  pago_estado: null,
  completado: false,
} as unknown as ServicioPostventa;

describe("filasPagoParcial (buzón, Ariana 13-10)", () => {
  it("deja solo los que deben el saldo y no los sin cobro", () => {
    const pagado = { ...base, id: "p", monto_pagado: 1000 } as ServicioPostventa;
    const garantia = { ...base, id: "g", origen: "caso", monto: null, monto_pagado: 0 } as unknown as ServicioPostventa;
    const filas = filasPagoParcial([base, pagado, garantia], true);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ cliente: "HOTEL PRUEBA SAC", ruc: "20123456789", total: 1000, pagado: 300, saldo: 700 });
    expect(filas[0].finanzas).toBe("Aún no se le pidió confirmar");
  });

  it("sin permiso de cifras no lleva montos", () => {
    const [f] = filasPagoParcial([base], false);
    expect(f.total).toBeNull();
    expect(f.saldo).toBeNull();
  });
});
