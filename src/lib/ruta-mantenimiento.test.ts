import { describe, expect, it } from "vitest";
import {
  columnaDe,
  diasEntre,
  diasSinMantenimiento,
  diasDeAtraso,
  estadoCompra,
  estadoLlamada,
  estadoMantenimiento,
  filtrarRuta,
  haceCuantoDias,
  ordenarRuta,
  type FilaRuta,
} from "./ruta-mantenimiento";

const HOY = "2026-08-28";

// Las filas de prueba son las reales de la ruta de Ariana, con sus nombres y
// sus fechas tal como quedaron al importar su Excel el 27-08.
function fila(p: Partial<FilaRuta> = {}): FilaRuta {
  return {
    id: "op-1",
    cuentaId: "cta-1",
    razonSocial: "MUGURUZA RIVERA ELMO ISSAC",
    zona: "PUENTE PIEDRA",
    etapa: "filtrada",
    compraAt: null,
    ultimoMantenimiento: null,
    serie: null,
    equipo: null,
    ultimaGestionAt: null,
    ultimaNota: null,
    proximaAccion: null,
    proximaAccionAt: null,
    monto: null,
    moneda: null,
    cerradaAt: null,
    contacto: null,
    telefono: null,
    carteraDe: null,
    ...p,
  };
}

describe("columnaDe", () => {
  it("pone en «por llamar» lo que vino del Excel con el recontacto vencido", () => {
    // Este es el caso masivo: las 103 filas importadas traen una llamada
    // registrada y una fecha de recontacto ya pasada.
    const f = fila({ ultimaGestionAt: "2026-08-26T10:00:00Z", proximaAccionAt: "2026-08-26" });
    expect(columnaDe(f, HOY)).toBe("por_llamar");
  });

  it("también pone en «por llamar» al que nunca se llamó y al que no tiene fecha", () => {
    expect(columnaDe(fila(), HOY)).toBe("por_llamar");
    expect(columnaDe(fila({ ultimaGestionAt: "2026-08-26T10:00:00Z" }), HOY)).toBe("por_llamar");
  });

  it("deja en «llamados» solo lo que tiene el recontacto por delante", () => {
    const f = fila({ ultimaGestionAt: "2026-08-27T10:00:00Z", proximaAccionAt: "2026-09-15" });
    expect(columnaDe(f, HOY)).toBe("llamados");
  });

  it("separa lo cotizado y lo cerrado por su etapa", () => {
    expect(columnaDe(fila({ etapa: "cotizada", proximaAccionAt: "2026-09-15", ultimaGestionAt: "x" }), HOY)).toBe(
      "cotizados",
    );
    expect(columnaDe(fila({ etapa: "venta" }), HOY)).toBe("cerrados");
    expect(columnaDe(fila({ etapa: "rechazada" }), HOY)).toBe("cerrados");
  });
});

describe("diasEntre", () => {
  it("cuenta días con fechas de calendario y con timestamps", () => {
    expect(diasEntre("2026-08-21", HOY)).toBe(7);
    expect(diasEntre("2026-08-26T15:30:00Z", HOY)).toBe(2);
    expect(diasEntre(null, HOY)).toBeNull();
  });
});

describe("diasSinMantenimiento", () => {
  it("cuenta desde el último mantenimiento cuando lo hubo", () => {
    expect(diasSinMantenimiento(fila({ ultimoMantenimiento: "2026-02-28", compraAt: "2024-03-01" }), HOY)).toBe(181);
  });

  it("cuenta desde la compra cuando nunca se le hizo uno — es el argumento de la llamada", () => {
    expect(diasSinMantenimiento(fila({ compraAt: "2024-03-01" }), HOY)).toBe(910);
  });

  it("no inventa antigüedad cuando no se sabe ninguna de las dos fechas", () => {
    expect(diasSinMantenimiento(fila(), HOY)).toBeNull();
  });
});

describe("ordenarRuta", () => {
  it("primero lo que nunca se llamó, después lo más atrasado", () => {
    const nunca = fila({ id: "nunca", razonSocial: "A" });
    const atrasado = fila({
      id: "atrasado",
      razonSocial: "B",
      ultimaGestionAt: "2026-08-01T10:00:00Z",
      proximaAccionAt: "2026-08-05",
    });
    const alDia = fila({
      id: "aldia",
      razonSocial: "C",
      ultimaGestionAt: "2026-08-27T10:00:00Z",
      proximaAccionAt: "2026-09-20",
    });
    expect(ordenarRuta([alDia, atrasado, nunca], HOY).map((f) => f.id)).toEqual(["nunca", "atrasado", "aldia"]);
  });

  it("a igual atraso, arriba el que lleva más tiempo sin mantenimiento", () => {
    const viejo = fila({ id: "viejo", razonSocial: "A", ultimaGestionAt: "x", proximaAccionAt: "2026-08-26", compraAt: "2024-01-10" });
    const nuevo = fila({ id: "nuevo", razonSocial: "B", ultimaGestionAt: "x", proximaAccionAt: "2026-08-26", compraAt: "2025-12-10" });
    expect(ordenarRuta([nuevo, viejo], HOY).map((f) => f.id)).toEqual(["viejo", "nuevo"]);
  });

  it("con todo igual ordena por nombre, para que la lista no baile entre recargas", () => {
    const a = fila({ id: "a", razonSocial: "ECOLAV SORELA S.A.C.", ultimaGestionAt: "x", proximaAccionAt: "2026-08-26" });
    const b = fila({ id: "b", razonSocial: "AVICOLA SAN FERNANDO", ultimaGestionAt: "x", proximaAccionAt: "2026-08-26" });
    expect(ordenarRuta([a, b], HOY).map((f) => f.id)).toEqual(["b", "a"]);
    expect(ordenarRuta([b, a], HOY).map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("no modifica el arreglo que recibe", () => {
    const filas = [fila({ id: "1", ultimaGestionAt: "x" }), fila({ id: "2" })];
    ordenarRuta(filas, HOY);
    expect(filas.map((f) => f.id)).toEqual(["1", "2"]);
  });
});

describe("diasDeAtraso", () => {
  it("no cuenta como atraso lo que todavía no vence", () => {
    expect(diasDeAtraso(fila({ proximaAccionAt: "2026-09-10" }), HOY)).toBeNull();
    expect(diasDeAtraso(fila({ proximaAccionAt: HOY }), HOY)).toBe(0);
    expect(diasDeAtraso(fila({ proximaAccionAt: "2026-08-21" }), HOY)).toBe(7);
  });
});

describe("los tres ejes con los que se arma la tanda del día", () => {
  it("separa «nunca» de «no registrado», que es la diferencia que importa", () => {
    expect(estadoMantenimiento(fila({ compraAt: "2024-03-01" }), HOY)).toBe("nunca");
    expect(estadoMantenimiento(fila(), HOY)).toBe("sin_dato");
    expect(estadoMantenimiento(fila({ ultimoMantenimiento: "2026-02-01" }), HOY)).toBe("vencido");
    expect(estadoMantenimiento(fila({ ultimoMantenimiento: "2026-08-01" }), HOY)).toBe("al_dia");
  });

  it("clasifica hace cuánto es cliente", () => {
    expect(estadoCompra(fila(), HOY)).toBe("sin_dato");
    expect(estadoCompra(fila({ compraAt: "2026-05-01" }), HOY)).toBe("menos_1a");
    expect(estadoCompra(fila({ compraAt: "2025-03-01" }), HOY)).toBe("entre_1_2a");
    expect(estadoCompra(fila({ compraAt: "2023-01-15" }), HOY)).toBe("mas_2a");
  });

  it("distingue al que nunca se llamó del que se llamó hace un mes", () => {
    expect(estadoLlamada(fila(), HOY)).toBe("nunca");
    expect(estadoLlamada(fila({ ultimaGestionAt: "2026-08-26T10:00:00Z" }), HOY)).toBe("reciente");
    expect(estadoLlamada(fila({ ultimaGestionAt: "2026-06-01T10:00:00Z" }), HOY)).toBe("hace_mas_30d");
  });
});

describe("filtrarRuta", () => {
  const nuncaMant = fila({ id: "a", razonSocial: "ADRA PERU", compraAt: "2023-02-01", telefono: "972094462" });
  const alDia = fila({ id: "b", razonSocial: "LAVANDERIA SOL", compraAt: "2026-01-10", ultimoMantenimiento: "2026-07-01" });
  const sinNada = fila({ id: "c", razonSocial: "CLIENTE SIN IDENTIFICAR", serie: "202510801141" });
  const TODAS = [nuncaMant, alDia, sinNada];

  it("cruza los tres ejes con Y: la tanda es el corte, no una suma de listas", () => {
    expect(filtrarRuta(TODAS, HOY, { mant: "nunca" }).map((f) => f.id)).toEqual(["a"]);
    expect(filtrarRuta(TODAS, HOY, { mant: "nunca", compra: "mas_2a" }).map((f) => f.id)).toEqual(["a"]);
    // El mismo cliente, pedido con una compra que no es la suya: no aparece.
    expect(filtrarRuta(TODAS, HOY, { mant: "nunca", compra: "menos_1a" })).toEqual([]);
  });

  it("sin filtros no recorta nada", () => {
    expect(filtrarRuta(TODAS, HOY, {})).toHaveLength(3);
  });

  it("busca por nombre, por serie y por teléfono", () => {
    expect(filtrarRuta(TODAS, HOY, { q: "adra" }).map((f) => f.id)).toEqual(["a"]);
    expect(filtrarRuta(TODAS, HOY, { q: "2025108" }).map((f) => f.id)).toEqual(["c"]);
    // El cliente devuelve la llamada y lo único que hay es el número.
    expect(filtrarRuta(TODAS, HOY, { q: "972 094 462" }).map((f) => f.id)).toEqual(["a"]);
  });
});

describe("haceCuantoDias", () => {
  it("dice la antigüedad como se dice en la llamada", () => {
    expect(haceCuantoDias(0)).toBe("hoy");
    expect(haceCuantoDias(1)).toBe("ayer");
    expect(haceCuantoDias(12)).toBe("hace 12 días");
    expect(haceCuantoDias(420)).toBe("hace 14 meses");
    expect(haceCuantoDias(1100)).toBe("hace 3 años");
    expect(haceCuantoDias(null)).toBe("—");
  });
});
