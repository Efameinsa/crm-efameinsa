import { beforeEach, describe, expect, it, vi } from "vitest";

const insertar = vi.fn();
let setters: { id: string }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      if (tabla === "perfiles") return { select: () => ({ eq: () => ({ eq: async () => ({ data: setters }) }) }) };
      return { insert: async (filas: unknown) => (insertar(filas), { error: null }) };
    },
  }),
}));

import { encolarLlamadaSetter } from "./setter-llamadas";

beforeEach(() => {
  insertar.mockClear();
  setters = [{ id: "u1" }];
});

describe("encolarLlamadaSetter", () => {
  it("pone la llamada en la cola de cada setter, con el número normalizado", async () => {
    setters = [{ id: "u1" }, { id: "u2" }];
    await encolarLlamadaSetter({ leadId: "l1", nombre: "Ana", telefono: "987 654 321", detalle: "Lavandería" });
    expect(insertar).toHaveBeenCalledTimes(1);
    const filas = insertar.mock.calls[0][0] as { user_id: string; telefono: string; lead_id: string; nombre: string }[];
    expect(filas.map((f) => f.user_id)).toEqual(["u1", "u2"]);
    expect(filas[0]).toMatchObject({ lead_id: "l1", nombre: "Ana", telefono: "+51987654321" });
  });

  it("sin teléfono o con uno que no es teléfono, no hace nada", async () => {
    await encolarLlamadaSetter({ leadId: "l1", nombre: "Ana", telefono: "" });
    await encolarLlamadaSetter({ leadId: "l1", nombre: "Ana", telefono: "abc" });
    await encolarLlamadaSetter({ leadId: "l1", nombre: "Ana", telefono: null });
    expect(insertar).not.toHaveBeenCalled();
  });

  it("si nadie es setter, no inserta", async () => {
    setters = [];
    await encolarLlamadaSetter({ leadId: "l1", nombre: "Ana", telefono: "987654321" });
    expect(insertar).not.toHaveBeenCalled();
  });
});
