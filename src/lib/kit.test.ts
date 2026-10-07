import { describe, expect, it } from "vitest";
import { bloquesConKit, conCantidad, detalleKitSiCambio, partirCantidad, piezasDeKit } from "./kit";

// La ficha real del KIT DE INSTALACION PARA SECADORA LG (IM0204081264), 06-10.
const FICHA = {
  bloques: [
    { t: "titulo", texto: "CARACTERÍSTICAS" },
    { t: "vineta", texto: "MANOMETRO PARA GAS BAJA PRESION   1 UND" },
    { t: "vineta", texto: "MANGUERA DE GAS 1/2 X 1500 MM                 1 UND" },
    { t: "vineta", texto: 'DUCTO FLEXIBLE 4" 3 METROS' },
    { t: "vineta", texto: "NIPLE FN 1/4 X 2 2 UND" },
  ],
};

describe("kit con cantidades", () => {
  it("separa la cantidad del final, aunque la pieza tenga números", () => {
    expect(partirCantidad("MANGUERA DE GAS 1/2 X 1500 MM                 1 UND")).toEqual({ texto: "MANGUERA DE GAS 1/2 X 1500 MM", numero: "1", unidad: "UND" });
    expect(partirCantidad("NIPLE FN 1/4 X 2 2 UND")).toEqual({ texto: "NIPLE FN 1/4 X 2", numero: "2", unidad: "UND" });
    expect(partirCantidad('- DUCTO FLEXIBLE 4" 3 METROS')).toEqual({ texto: 'DUCTO FLEXIBLE 4"', numero: "3", unidad: "METROS" });
    expect(partirCantidad("Puesta en marcha incluida")).toBeNull();
  });

  it("reconoce las piezas del kit y deja fuera los títulos", () => {
    expect(piezasDeKit(FICHA)).toHaveLength(4);
    expect(piezasDeKit({ bloques: [{ t: "vineta", texto: "Motor 1 UND" }] })).toEqual([]);
  });

  it("cambia el ducto a 10 metros solo en la cotización", () => {
    const piezas = piezasDeKit(FICHA);
    const nuevas = piezas.map((p, i) => (i === 2 ? conCantidad(partirCantidad(p)!, "10") : p));
    const detalle = detalleKitSiCambio(piezas, nuevas);
    expect(detalle?.[2]).toBe('DUCTO FLEXIBLE 4" 10 METROS');
    const bloques = bloquesConKit(FICHA.bloques, detalle);
    expect(bloques?.[3].texto).toBe('DUCTO FLEXIBLE 4" 10 METROS');
    expect(bloques?.[0].texto).toBe("CARACTERÍSTICAS");
  });

  it("la pieza en 0 no sale en la cotización (Rubí, buzón 06-10)", () => {
    const piezas = piezasDeKit(FICHA);
    const nuevas = piezas.map((p, i) => (i === 0 ? conCantidad(partirCantidad(p)!, "0") : i === 2 ? conCantidad(partirCantidad(p)!, "10") : p));
    const bloques = bloquesConKit(FICHA.bloques, detalleKitSiCambio(piezas, nuevas));
    expect(bloques?.map((b) => b.texto)).toEqual([
      "CARACTERÍSTICAS",
      "MANGUERA DE GAS 1/2 X 1500 MM 1 UND",
      'DUCTO FLEXIBLE 4" 10 METROS',
      "NIPLE FN 1/4 X 2 2 UND",
    ]);
  });

  it("si vuelve a las cantidades de la ficha no hay nada que aprobar", () => {
    const piezas = piezasDeKit(FICHA);
    expect(detalleKitSiCambio(piezas, piezas.map((p) => conCantidad(partirCantidad(p)!, partirCantidad(p)!.numero)))).toBeNull();
  });
});
