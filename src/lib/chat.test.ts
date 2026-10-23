import { describe, expect, it } from "vitest";
import { areaDePerfil, chatDelEnlace, diasSinEntrar, mencionesEnElTexto, partirMenciones } from "@/lib/chat";

describe("chat del caso", () => {
  it("el enlace «#chat=…» dice qué chat abrir", () => {
    expect(chatDelEnlace("/postventa/atenciones/a1#chat=caso:a1")).toEqual({ tipo: "caso", id: "a1" });
    expect(chatDelEnlace("/postventa/pedidos/p-9#chat=pedido:p-9")).toEqual({ tipo: "pedido", id: "p-9" });
    expect(chatDelEnlace("/postventa/pedidos/p-9#mapa=pedido:p-9")).toBeNull();
  });
  it("cada quien escribe con su área", () => {
    expect(areaDePerfil({ rol: "comercial", es_postventa: true })).toBe("Postventa");
    expect(areaDePerfil({ rol: "comercial", es_almacen: true })).toBe("Almacén");
    expect(areaDePerfil({ rol: "facturacion" })).toBe("Contabilidad");
    expect(areaDePerfil({ rol: "operaciones" })).toBe("Operaciones");
    expect(areaDePerfil({ rol: "comercial" })).toBe("Comercial");
  });
});

describe("el «@» y la ausencia (0599)", () => {
  const gente = [
    { id: "j", nombre: "Jhon Kalsin Sullca" },
    { id: "b", nombre: "Brenda Taboada" },
  ];
  it("resalta solo los nombres elegidos", () => {
    expect(partirMenciones("@Jhon Kalsin Sullca cómo quedó?", gente)).toEqual([
      { texto: "@Jhon Kalsin Sullca", mencion: true },
      { texto: " cómo quedó?", mencion: false },
    ]);
    expect(partirMenciones("sin arroba", gente)).toEqual([{ texto: "sin arroba", mencion: false }]);
  });
  it("manda solo a quien sigue en el texto", () => {
    expect(mencionesEnElTexto("@Brenda Taboada ok", gente)).toEqual(["b"]);
    expect(mencionesEnElTexto("lo borré", gente)).toEqual([]);
  });
  it("cuenta los días sin entrar en hora de Lima", () => {
    const ahora = new Date("2026-10-23T20:30:00Z");
    expect(diasSinEntrar("2026-10-21T17:59:00Z", ahora)).toBe(2);
    expect(diasSinEntrar("2026-10-23T14:00:00Z", ahora)).toBe(0);
    expect(diasSinEntrar(null, ahora)).toBeNull();
  });
});
