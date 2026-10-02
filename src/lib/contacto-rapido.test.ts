import { describe, expect, it } from "vitest";
import { contactoRapido, telefonoParaMostrar } from "./contacto-rapido";

describe("telefonoParaMostrar", () => {
  it("saca el celular con o sin 51 delante", () => {
    expect(telefonoParaMostrar("51925540748")).toEqual({ valor: "925 540 748", marcar: "+51925540748", celular: true });
    expect(telefonoParaMostrar("+51 932 262 669")?.valor).toBe("932 262 669");
    expect(telefonoParaMostrar("932-262-669")?.valor).toBe("932 262 669");
  });
  it("de varios números en el campo, el primer celular", () => {
    expect(telefonoParaMostrar("926230863 (Whatsapp) / 902484698 (llamadas)")?.valor).toBe("926 230 863");
    expect(telefonoParaMostrar("981207330 981312852 908932643")?.valor).toBe("981 207 330");
    expect(telefonoParaMostrar("01-7274093 / 987254067")?.valor).toBe("987 254 067");
  });
  it("un fijo sale como está escrito", () => {
    expect(telefonoParaMostrar("01-3603100 ANX 1141")).toEqual({ valor: "01-3603100 ANX 1141", marcar: "013603100", celular: false });
    expect(telefonoParaMostrar("053-483040")?.celular).toBe(false);
  });
  it("sin número no hay nada", () => {
    expect(telefonoParaMostrar("")).toBeNull();
    expect(telefonoParaMostrar("no tiene")).toBeNull();
  });
});

describe("contactoRapido", () => {
  it("el principal manda aunque otro tenga celular", () => {
    expect(
      contactoRapido([
        { telefono: "987654321", email: null, es_principal: false },
        { telefono: "01-6161000", email: null, es_principal: true },
      ]),
    ).toMatchObject({ tipo: "telefono", valor: "01-6161000" });
  });
  it("entre los demás, el celular antes que el fijo", () => {
    expect(
      contactoRapido([
        { telefono: "01-6161000", email: null, es_principal: false, created_at: "2026-01-01" },
        { telefono: "987654321", email: null, es_principal: false, created_at: "2026-02-01" },
      ]),
    ).toMatchObject({ valor: "987 654 321" });
  });
  it("el operativo va al final", () => {
    expect(
      contactoRapido([
        { telefono: "911111111", email: null, es_principal: false, categoria: "operativo" },
        { telefono: "922222222", email: null, es_principal: false, categoria: "comercial" },
      ]),
    ).toMatchObject({ valor: "922 222 222" });
  });
  it("sin teléfono, el correo", () => {
    expect(contactoRapido([{ telefono: null, email: "compras@cliente.pe", es_principal: true }])).toEqual({
      tipo: "email",
      valor: "compras@cliente.pe",
    });
  });
  it("sin nada, null", () => {
    expect(contactoRapido([])).toBeNull();
    expect(contactoRapido([{ telefono: " ", email: null, es_principal: true }])).toBeNull();
  });
});
