import { describe, expect, it } from "vitest";
import { faltasParaReasignar, puedeReasignar } from "./faltas-reasignacion";

const base = { destinos: 6, destino: "", motivo: "", pin: "", sinPin: false };

describe("faltasParaReasignar", () => {
  it("dice todo lo que falta cuando el formulario está vacío", () => {
    expect(faltasParaReasignar(base)).toEqual([
      "elegir el comercial",
      "escribir el motivo",
      "el código del supervisor, de cuatro dígitos",
    ]);
  });

  it("cuenta cuántas letras le faltan al motivo", () => {
    const r = faltasParaReasignar({ ...base, destino: "c0", motivo: "error", pin: "1234" });
    expect(r).toEqual(["completar el motivo (5 caracteres más)"]);
  });

  it("no pide el código cuando gerencia lo levantó", () => {
    const e = { ...base, destino: "c0", motivo: "Se derivó a comercial y pedía mantenimiento", sinPin: true };
    expect(faltasParaReasignar(e)).toEqual([]);
    expect(puedeReasignar(e)).toBe(true);
  });

  it("con el código puesto y el motivo escrito, se puede", () => {
    const e = { ...base, destino: "c0", motivo: "Se derivó a la comercial equivocada", pin: "4821" };
    expect(puedeReasignar(e)).toBe(true);
  });

  it("un código de tres dígitos todavía no alcanza", () => {
    const e = { ...base, destino: "c0", motivo: "Se derivó a la comercial equivocada", pin: "482" };
    expect(faltasParaReasignar(e)).toEqual(["el código del supervisor, de cuatro dígitos"]);
  });

  it("avisa cuando no hay a quién pasarlo, en vez de pedir que elija de una lista vacía", () => {
    const e = { ...base, destinos: 0, motivo: "Se derivó a la comercial equivocada", pin: "4821" };
    expect(faltasParaReasignar(e)).toEqual(["no hay otro comercial activo al que pasarlo"]);
  });

  it("los espacios no cuentan como motivo", () => {
    expect(faltasParaReasignar({ ...base, destino: "c0", pin: "4821", motivo: "          " })).toEqual([
      "escribir el motivo",
    ]);
  });
});
