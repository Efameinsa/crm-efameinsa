import { describe, expect, it } from "vitest";
import {
  columnaDe,
  diasEntre,
  diasSinMantenimiento,
  diasDeAtraso,
  ordenarRuta,
  textoMantenimiento,
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

describe("textoMantenimiento", () => {
  it("marca el «nunca» con alerta: es la venta cruzada", () => {
    expect(textoMantenimiento(fila({ compraAt: "2024-03-01" }), HOY)).toEqual({ texto: "nunca", alerta: true });
  });

  it("no confunde «no registrado» con «nunca»", () => {
    // La mayoría de las 103 cuentas todavía no tiene su equipo fichado en el
    // parque instalado. Decirle a Ariana «nunca» sería darle un argumento que
    // puede quedar mal en la llamada.
    expect(textoMantenimiento(fila(), HOY)).toEqual({ texto: "no registrado", alerta: false });
  });

  it("avisa cuando ya pasó el intervalo del preventivo (4-6 meses)", () => {
    expect(textoMantenimiento(fila({ ultimoMantenimiento: "2026-08-20" }), HOY).alerta).toBe(false);
    expect(textoMantenimiento(fila({ ultimoMantenimiento: "2026-02-01" }), HOY).alerta).toBe(true);
    expect(textoMantenimiento(fila({ ultimoMantenimiento: "2026-08-10" }), HOY).texto).toBe("este mes");
  });
});

describe("diasDeAtraso", () => {
  it("no cuenta como atraso lo que todavía no vence", () => {
    expect(diasDeAtraso(fila({ proximaAccionAt: "2026-09-10" }), HOY)).toBeNull();
    expect(diasDeAtraso(fila({ proximaAccionAt: HOY }), HOY)).toBe(0);
    expect(diasDeAtraso(fila({ proximaAccionAt: "2026-08-21" }), HOY)).toBe(7);
  });
});
