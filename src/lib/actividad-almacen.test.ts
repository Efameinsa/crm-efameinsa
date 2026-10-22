import { describe, expect, it } from "vitest";
import { armarActividad } from "./actividad-almacen";

describe("armarActividad", () => {
  it("arma la frase del reporte", () => {
    expect(armarActividad({ tipo: "Embalaje", que: "coche HM-401", cantidad: "3", para: "Hotel Sol", nota: "" })).toBe("Embalaje · 3 × coche HM-401 · para Hotel Sol");
    expect(armarActividad({ tipo: "Recepción", que: "repuestos", cantidad: "", para: "Importaciones", nota: "4 cajas" })).toBe("Recepción · repuestos · de Importaciones · 4 cajas");
    expect(armarActividad({ tipo: "Otra", que: "", cantidad: "", para: "", nota: "Se atendió a un transportista" })).toBe("Se atendió a un transportista");
  });
});
