import { describe, expect, it } from "vitest";
import {
  armarVisitasEquipo,
  clasificarAccion,
  contarVisitasEquipo,
  fechaHoraLima,
  type GestionVisita,
  type PlanAgenda,
  type VisitaPlantaFila,
} from "./visitas-equipo";

const R = { desde: "2026-09-28", hasta: "2026-10-04", hoy: "2026-10-01" };

const plan = (p: Partial<PlanAgenda>): PlanAgenda => ({
  oportunidadId: "op1",
  cuentaId: "cu1",
  cliente: "ACME",
  direccion: "Av. Lima 123, Ate",
  comercialId: "c2",
  texto: "Visitar al cliente",
  fecha: "2026-09-29",
  hora: "10:00",
  programadaAt: null,
  vigente: true,
  accionActual: null,
  fechaActual: null,
  ...p,
});

const gestion = (g: Partial<GestionVisita>): GestionVisita => ({
  id: "g1",
  tipo: "visita",
  comercialId: "c2",
  oportunidadId: "op1",
  cuentaId: "cu1",
  cliente: "ACME",
  direccion: null,
  realizadaAt: "2026-09-29T16:00:00Z",
  fecha: "2026-09-29",
  hora: "11:00",
  resultadoCodigo: "EVALUANDO_COTIZ",
  resultadoNombre: "Evaluando",
  nota: "Se visitó",
  ...g,
});

const planta = (v: Partial<VisitaPlantaFila>): VisitaPlantaFila => ({
  id: "vp1",
  comercialId: "c4",
  cuentaId: "cu9",
  oportunidadId: null,
  empresa: "AQUA",
  motivo: "Ver la lavadora",
  fecha: "2026-10-02",
  hora: "15:00",
  cancelada: false,
  canceladaMotivo: null,
  cerrada: false,
  noVino: false,
  resultado: null,
  actividadId: null,
  ...v,
});

const vacio = { planes: [], tareas: [], planta: [], gestiones: [] };

describe("clasificarAccion", () => {
  it("reconoce visita, videollamada y planta", () => {
    expect(clasificarAccion("Visitar al cliente")).toBe("visita");
    expect(clasificarAccion("se envio visita para lunes")).toBe("visita");
    expect(clasificarAccion("se derivara video llamada para puesta en marcha")).toBe("videollamada");
    expect(clasificarAccion("Reunión por Zoom con el jefe de planta")).toBe("videollamada");
    expect(clasificarAccion("El cliente vendrá el sábado 19 a planta.")).toBe("planta");
  });
  it("la llamada para confirmar la visita no es la visita", () => {
    expect(clasificarAccion("Llamar para confirmar la hora de la videollamada.")).toBeNull();
    expect(clasificarAccion("Confirmar visita")).toBeNull();
    expect(clasificarAccion("Volver a llamar")).toBeNull();
    expect(clasificarAccion(null)).toBeNull();
  });
});

describe("armarVisitasEquipo", () => {
  it("lo agendado y hecho sale UNA vez, como hecho", () => {
    const l = armarVisitasEquipo({ ...vacio, planes: [plan({})], gestiones: [gestion({})] }, R);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ estado: "hecha", programada: true, origen: "agenda", hechaEl: { fecha: "2026-09-29", hora: "11:00" } });
  });

  it("agendada, sin gestión y el día ya pasó: vencida sin registrar", () => {
    const [v] = armarVisitasEquipo({ ...vacio, planes: [plan({})] }, R);
    expect(v.estado).toBe("vencida");
    expect(v.lugar).toBe("Av. Lima 123, Ate");
  });

  it("agendada para más adelante: pendiente", () => {
    const [v] = armarVisitasEquipo({ ...vacio, planes: [plan({ fecha: "2026-10-03" })] }, R);
    expect(v.estado).toBe("pendiente");
  });

  it("la cambiaron por otra acción: cancelada, con lo que se puso en su lugar", () => {
    const [v] = armarVisitasEquipo(
      {
        ...vacio,
        planes: [plan({ programadaAt: "2026-09-26T15:00:00Z", vigente: false, accionActual: "Volver a llamar", fechaActual: "2026-10-05" })],
      },
      R,
    );
    expect(v.estado).toBe("cancelada");
    expect(v.estadoNota).toContain("Volver a llamar");
  });

  it("la misma visita de la oportunidad y de la gestión que la dejó no se duplica", () => {
    const l = armarVisitasEquipo(
      { ...vacio, planes: [plan({ programadaAt: "2026-09-26T15:00:00Z" }), plan({ programadaAt: null })] },
      R,
    );
    expect(l).toHaveLength(1);
    expect(l[0].estado).toBe("vencida");
  });

  it("una gestión anterior a cuando se agendó no la cumple", () => {
    const l = armarVisitasEquipo(
      {
        ...vacio,
        planes: [plan({ programadaAt: "2026-09-29T20:00:00Z", fecha: "2026-10-02" })],
        gestiones: [gestion({ realizadaAt: "2026-09-29T16:00:00Z" })],
      },
      R,
    );
    expect(l.find((v) => v.origen === "agenda")?.estado).toBe("pendiente");
    expect(l.find((v) => v.origen === "gestion")?.estado).toBe("hecha");
  });

  it("una videollamada no cumple una visita presencial", () => {
    const l = armarVisitasEquipo({ ...vacio, planes: [plan({})], gestiones: [gestion({ tipo: "reunion_online" })] }, R);
    expect(l.map((v) => [v.origen, v.clase, v.estado])).toEqual([
      ["agenda", "visita", "vencida"],
      ["gestion", "videollamada", "hecha"],
    ]);
  });

  it("visita que terminó en «No contestó»: no se concretó", () => {
    const [v] = armarVisitasEquipo({ ...vacio, gestiones: [gestion({ resultadoCodigo: "NO_CONTESTO", resultadoNombre: "No contestó" })] }, R);
    expect(v.estado).toBe("no_concretada");
    expect(v.programada).toBe(false);
  });

  it("visita a planta: su gestión showroom no sale aparte", () => {
    const l = armarVisitasEquipo(
      {
        ...vacio,
        planta: [planta({ cerrada: true, resultado: "evaluando", actividadId: "g9", fecha: "2026-09-30" })],
        gestiones: [gestion({ id: "g9", tipo: "showroom", fecha: "2026-09-30" })],
      },
      R,
    );
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ clase: "planta", estado: "hecha", estadoNota: "Evaluando", lugar: "En la planta" });
  });

  it("planta: no vino, cancelada, vencida y pendiente", () => {
    const l = armarVisitasEquipo(
      {
        ...vacio,
        planta: [
          planta({ id: "a", fecha: "2026-09-29", cerrada: true, resultado: "no_vino", noVino: true }),
          planta({ id: "b", fecha: "2026-09-29", cancelada: true, canceladaMotivo: "Postergó" }),
          planta({ id: "c", fecha: "2026-09-30" }),
          planta({ id: "d", fecha: "2026-10-02" }),
        ],
      },
      R,
    );
    const porId = Object.fromEntries(l.map((v) => [v.clave, v.estado]));
    expect(porId).toEqual({ "planta:a": "no_concretada", "planta:b": "cancelada", "planta:c": "vencida", "planta:d": "pendiente" });
  });

  it("deja fuera lo que no es de la semana", () => {
    const l = armarVisitasEquipo({ ...vacio, planes: [plan({ fecha: "2026-10-06" })], gestiones: [gestion({ fecha: "2026-09-27", oportunidadId: "x", cuentaId: "y" })] }, R);
    expect(l).toHaveLength(0);
  });

  it("cuenta agendadas, hechas, pendientes y vencidas", () => {
    const l = armarVisitasEquipo(
      { ...vacio, planes: [plan({}), plan({ oportunidadId: "op2", cuentaId: "cu2", fecha: "2026-10-03" })], gestiones: [gestion({ id: "g5", oportunidadId: "op7", cuentaId: "cu7" })] },
      R,
    );
    expect(contarVisitasEquipo(l)).toEqual({ programadas: 2, hechas: 1, pendientes: 1, vencidas: 1, canceladas: 0 });
  });
});

describe("fechaHoraLima", () => {
  it("convierte a la hora de Lima (UTC-5)", () => {
    expect(fechaHoraLima("2026-10-01T03:30:00Z")).toEqual({ fecha: "2026-09-30", hora: "22:30" });
  });
});
