import { describe, expect, it } from "vitest";
import { pareceDelCatalogo, pideUnRubro } from "@/lib/pedidos-catalogo";

describe("pareceDelCatalogo (0523)", () => {
  it("marca lo que es de Lesly", () => {
    expect(pareceDelCatalogo("AGREGAR FICHA TECNICA Y COSTO DE LAVADORA TEÑIDORA EFAMEIN")).toBe(true);
    expect(pareceDelCatalogo("No encuentro el modelo UT075 para cotizar")).toBe(true);
    expect(pareceDelCatalogo("Actualizar el precio de la secadora")).toBe(true);
  });
  it("no marca lo que es de una pantalla del CRM", () => {
    expect(pareceDelCatalogo("En la parte en donde se detalla el producto del pedido, una torre son 2 ítems")).toBe(false);
    expect(pareceDelCatalogo("Quiero un botón para agregar fotos en cada producto")).toBe(false);
    expect(pareceDelCatalogo("Solicitud de un repuesto que no hay stock: el código sale mal")).toBe(false);
  });
  it("reconoce el pedido de un rubro", () => {
    expect(pideUnRubro("MAS OPCIONES EN RUBROS")).toBe(true);
    expect(pideUnRubro("El botón no carga")).toBe(false);
  });
});
