import { describe, expect, it } from "vitest";
import { separarNombreYCelular, textoAgregado, ultimos9 } from "./contacto-operativo";

describe("separarNombreYCelular", () => {
  it("el chip de la ficha: «Nombre · celular»", () => {
    expect(separarNombreYCelular("LUCERO · 923 661 839")).toEqual({ nombre: "LUCERO", cargo: null, telefono: "923 661 839" });
  });
  it("el ejemplo de la apertura: nombre, cargo y celular", () => {
    expect(separarNombreYCelular("Juan Pérez, técnico del cliente · 987 654 321")).toEqual({
      nombre: "Juan Pérez",
      cargo: "técnico del cliente",
      telefono: "987 654 321",
    });
  });
  it("la nota del despacho: paréntesis como cargo y el horario fuera", () => {
    expect(separarNombreYCelular("Juan Pérez (almacén), 987 654 321 — recibe de 2 a 5 pm")).toEqual({
      nombre: "Juan Pérez",
      cargo: "almacén",
      telefono: "987 654 321",
    });
  });
  it("como lo escribió Gabriela: el número primero", () => {
    expect(separarNombreYCelular("923 661 839 LUCERO")).toEqual({ nombre: "LUCERO", cargo: null, telefono: "923 661 839" });
  });
  it("«coordiné con» y «cel.» no son parte del nombre", () => {
    expect(separarNombreYCelular("Coordiné con el Sr. Luis Rojas cel. 912-345-678")?.nombre).toBe("Sr. Luis Rojas");
  });
  it("con +51", () => {
    expect(separarNombreYCelular("Ana Soto +51 987654321")).toEqual({ nombre: "Ana Soto", cargo: null, telefono: "+51 987654321" });
  });
  it("sin número no hay nada que sumar", () => {
    expect(separarNombreYCelular("con el electricista, recibe de 2 a 5 pm")).toBeNull();
    expect(separarNombreYCelular("")).toBeNull();
  });
  it("solo el número: sin nombre", () => {
    expect(separarNombreYCelular("987 654 321")).toEqual({ nombre: null, cargo: null, telefono: "987 654 321" });
  });
});

describe("ultimos9", () => {
  it("compara con o sin +51 y espacios", () => {
    expect(ultimos9("+51 923 661 839")).toBe(ultimos9("923661839"));
  });
});

describe("textoAgregado", () => {
  it("quién, cuándo y desde dónde", () => {
    expect(textoAgregado({ agregado: { nombre: "Rubí" }, agregado_at: "2026-09-30T17:00:00Z", origen: "apertura" })).toMatch(/^Lo sumó Rubí · 30 .* · en la apertura al almacén$/);
  });
});
