import { describe, expect, it } from "vitest";
import { agruparPorCliente, nombreDeCliente } from "./fichas-del-mismo-cliente";

const caso = (cliente: string, cuentaId: string | null) => ({ cliente, cuentaId });

describe("nombreDeCliente", () => {
  it("quita la forma societaria, escrita como esté", () => {
    expect(nombreDeCliente("GRUPO SANTA ELENA S.A.")).toBe("GRUPO SANTA ELENA");
    expect(nombreDeCliente("GRUPO SANTA ELENA SA")).toBe("GRUPO SANTA ELENA");
    expect(nombreDeCliente("Grupo Santa Elena")).toBe("GRUPO SANTA ELENA");
    expect(nombreDeCliente("NEWREST PERU S.A.C.")).toBe("NEWREST PERU");
  });

  it("quita tildes y puntuación, no palabras", () => {
    expect(nombreDeCliente("Corporación Panaservice S.A.C.")).toBe("CORPORACION PANASERVICE");
  });

  it("no confunde a dos empresas escritas distinto", () => {
    expect(nombreDeCliente("NEWREST PERU SAC")).not.toBe(nombreDeCliente("NEWRESTO PERU SAC"));
    expect(nombreDeCliente("NEWREST")).not.toBe(nombreDeCliente("NEWREST PERU"));
  });
});

describe("agruparPorCliente", () => {
  it("el caso real del 09-09: las tres fichas de GRUPO SANTA ELENA son un cliente", () => {
    const grupos = agruparPorCliente([
      caso("GRUPO SANTA ELENA", "cta-a"),
      caso("GRUPO SANTA ELENA S.A.", "cta-b"),
      caso("GRUPO SANTA ELENA", "cta-c"),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].casos).toHaveLength(3);
    expect(grupos[0].fichas.map((f) => f.id)).toEqual(["cta-a", "cta-b", "cta-c"]);
    // Se muestra el nombre más completo, que es el de la ficha con RUC.
    expect(grupos[0].cliente).toBe("GRUPO SANTA ELENA S.A.");
  });

  it("varios casos de la MISMA ficha siguen siendo una sola ficha", () => {
    const grupos = agruparPorCliente([caso("NESSUS HOTELES", "cta-a"), caso("NESSUS HOTELES", "cta-a")]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].fichas).toHaveLength(1);
    expect(grupos[0].casos).toHaveLength(2);
  });

  it("NEWREST y NEWRESTO no se juntan: adivinar un dedazo es inventar", () => {
    const grupos = agruparPorCliente([caso("NEWREST PERU S.A.C.", "cta-a"), caso("NEWRESTO PERU SAC", "cta-b")]);
    expect(grupos).toHaveLength(2);
  });

  it("dos clientes distintos no se tocan", () => {
    const grupos = agruparPorCliente([caso("GRUPO SANTA ELENA", "cta-a"), caso("CORPORACION PANASERVICE", "cta-b")]);
    expect(grupos).toHaveLength(2);
  });

  it("lo que todavía no tiene ficha se agrupa por su nombre y no aporta enlaces", () => {
    const grupos = agruparPorCliente([caso("LAVANDERIA JL", null), caso("LAVANDERÍA JL", null)]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].fichas).toEqual([]);
    expect(grupos[0].casos).toHaveLength(2);
  });

  it("una ficha y un caso suelto con el mismo nombre se juntan, y queda el enlace de la ficha", () => {
    const grupos = agruparPorCliente([caso("GRUPO SANTA ELENA S.A.", "cta-a"), caso("GRUPO SANTA ELENA", null)]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].fichas).toEqual([{ id: "cta-a", nombre: "GRUPO SANTA ELENA S.A." }]);
  });

  it("sin casos, sin grupos", () => {
    expect(agruparPorCliente([])).toEqual([]);
  });
});
