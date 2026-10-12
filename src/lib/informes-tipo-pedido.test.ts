import { describe, expect, it } from "vitest";
import { tipoItemDelProducto, tipoPedidoDeItems } from "@/lib/informes";

// Igual que tipo_pedido_del_informe (0404) en la base: la pantalla del cierre
// muestra lo que va a deducir la base si el comercial no elige (Rubí, 12-10).
describe("tipoPedidoDeItems", () => {
  it("un repuesto solo es venta de repuesto", () => {
    expect(tipoPedidoDeItems([{ tipo: "repuesto", descripcion: "VARIADOR ASSY F8496601" }])).toBe("repuesto");
  });
  it("sin tipo es equipo, como lo emitido antes", () => {
    expect(tipoPedidoDeItems([{ descripcion: "VARIADOR ASSY F8496601" }])).toBe("equipo");
    expect(tipoPedidoDeItems([])).toBe("equipo");
  });
  it("servicios: mantenimiento, revisión o embalaje según el texto", () => {
    expect(tipoPedidoDeItems([{ tipo: "servicio", descripcion: "SERVICIO DE MANTENIMIENTO CORRECTIVO" }])).toBe("mantenimiento");
    expect(tipoPedidoDeItems([{ descripcion: "SERVICIO DE REVISIÓN TÉCNICA" }])).toBe("revision");
    expect(tipoPedidoDeItems([{ tipo: "servicio", descripcion: "Servicio de embalaje en jaula" }])).toBe("embalaje");
  });
  it("coches y carros son accesorio; lo gratuito no cuenta", () => {
    expect(tipoPedidoDeItems([{ descripcion: "COCHE DE LAVANDERIA" }, { bloque: "gratuito", descripcion: "SERVICIO DE INSTALACION" }])).toBe("accesorio");
  });
  it("mezcla de equipo y repuesto es equipo", () => {
    expect(tipoPedidoDeItems([{ tipo: "equipo", descripcion: "LAVADORA" }, { tipo: "repuesto", descripcion: "VALVULA" }])).toBe("equipo");
  });
});

describe("tipoItemDelProducto", () => {
  it("toma el segmento del catálogo", () => {
    expect(tipoItemDelProducto({ segmento: "repuesto", categoria: "repuesto" })).toBe("repuesto");
    expect(tipoItemDelProducto({ segmento: "servicio", categoria: "servicio" })).toBe("servicio");
    expect(tipoItemDelProducto({ segmento: "industrial", categoria: "lavadora" })).toBe("equipo");
    expect(tipoItemDelProducto(null)).toBe("equipo");
  });
});
