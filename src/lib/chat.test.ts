import { describe, expect, it } from "vitest";
import { areaDePerfil, chatDelEnlace } from "@/lib/chat";

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
