import { describe, expect, it } from "vitest";
import { estadoDelRotulo, resumirAsiSeQuedo, sinRotuloDelImport } from "@/lib/asi-se-quedo";
import type { EventoTimeline } from "@/components/crm/linea-tiempo-cuenta";

const gestion = (id: string, fecha: string, expediente: string, nota: string, extra: Partial<EventoTimeline> = {}): EventoTimeline =>
  ({ tipo: "actividad", id, fecha, oportunidadId: null, expediente, tipoActividad: "nota", nota, resultado: null, quien: "C5 · Katerine", ...extra }) as EventoTimeline;

describe("rótulo del importador", () => {
  it("se saca del texto y se lee el estado", () => {
    const n = "[Histórico COTIZ., estado C3_Esperar] nos comunicamo con el sr. Tony";
    expect(sinRotuloDelImport(n)).toBe("nos comunicamo con el sr. Tony");
    expect(estadoDelRotulo(n)).toBe("C3_Esperar");
  });
  it("una nota escrita en el CRM queda igual y sin estado", () => {
    expect(sinRotuloDelImport("Llamé, no contesta")).toBe("Llamé, no contesta");
    expect(estadoDelRotulo("Llamé, no contesta")).toBeNull();
  });
  it("el estado (vacío) no se muestra", () => {
    expect(estadoDelRotulo("[Histórico PROSP., estado (vacío)] x")).toBeNull();
  });
  it("una nota que era solo rótulo queda en null", () => {
    expect(sinRotuloDelImport("[Histórico PROSP., estado (vacío)]")).toBeNull();
  });
});

describe("resumirAsiSeQuedo (PYRAMID METALS, 30-09)", () => {
  const archivados = [
    { id: "jul17", proxima_accion: null, proxima_accion_at: null },
    { id: "jul20", proxima_accion: "Llamar al cliente", proxima_accion_at: "2026-07-22" },
  ];
  const eventos = [
    gestion("a", "2026-09-30T15:41:25Z", "nuevo", "Nos comunicamos con el sr Leymer"),
    gestion("b", "2026-07-17T17:00:00Z", "jul17", "[Histórico COTIZ., estado P1_F_Realiz_Y_Cotizado] busca licitar una lavadora"),
    gestion("c", "2026-07-18T12:00:00Z", "jul20", "[Histórico COTIZ., estado C3_Esperar] hoy no labora"),
    gestion("d", "2026-07-24T17:00:00Z", "jul20", "[Histórico COTIZ., estado C3_Esperar] no procede, quedó en stand by"),
  ];

  it("toma la última del archivo, no la del expediente actual", () => {
    const r = resumirAsiSeQuedo(eventos, archivados, "nuevo")!;
    expect(r.fecha).toBe("2026-07-24T17:00:00Z");
    expect(r.nota).toBe("no procede, quedó en stand by");
    expect(r.estadoExcel).toBe("C3_Esperar");
    expect(r.gestiones).toBe(3);
    expect(r.desde).toBe("2026-07-17T17:00:00Z");
  });
  it("«quedó en» sale del expediente archivado cuando la gestión no lo trae", () => {
    expect(resumirAsiSeQuedo(eventos, archivados, "nuevo")!.quedoEn).toEqual({ accion: "Llamar al cliente", fecha: "2026-07-22" });
  });
  it("sin expedientes archivados no hay recuadro", () => {
    expect(resumirAsiSeQuedo(eventos, [], "nuevo")).toBeNull();
  });
  it("no mezcla otro expediente VIVO del cliente", () => {
    const vivo = [gestion("p", "2026-09-29T10:00:00Z", "postventa", "revisión de la secadora")];
    expect(resumirAsiSeQuedo(vivo, archivados, "nuevo")).toBeNull();
  });
  it("si el expediente que se mira es el archivado, no se resume a sí mismo", () => {
    expect(resumirAsiSeQuedo(eventos.filter((e) => e.expediente === "jul17"), archivados, "jul17")).toBeNull();
  });
});
