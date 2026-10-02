import { describe, expect, it } from "vitest";
import {
  COPIA_GRANDE_CARACTERES,
  esRutaDeExportacion,
  reglasQueSeCumplen,
  sanearDetalle,
  seVigila,
  type EventoSeguridad,
  type TipoEvento,
} from "./seguridad-conducta";

const MIN = 60_000;
const AHORA = Date.UTC(2026, 9, 2, 15, 0, 0);
const ev = (tipo: TipoEvento, haceMin: number, detalle?: Record<string, unknown>): EventoSeguridad => ({ tipo, t: AHORA - haceMin * MIN, detalle });
const ids = (e: EventoSeguridad[], avisos: Record<string, number> = {}) => reglasQueSeCumplen(e, AHORA, avisos).map((a) => a.regla);

describe("reglasQueSeCumplen", () => {
  it("una sola captura de pantalla ya avisa", () => {
    const r = reglasQueSeCumplen([ev("captura_pantalla", 1)], AHORA);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ regla: "captura", cuenta: 1 });
    expect(r[0].resumen).toBe("hizo 1 captura de pantalla en 10 min");
  });

  it("una captura de hace una hora no cuenta en la ventana de 10 minutos", () => {
    expect(ids([ev("captura_pantalla", 60)])).toEqual([]);
  });

  it("copiar un dato suelto (un teléfono) no avisa, ni aunque sean varios", () => {
    const e = Array.from({ length: 10 }, (_, i) => ev("copiar", i, { caracteres: 9 }));
    expect(ids(e)).toEqual([]);
  });

  it("copiar un bloque grande avisa una vez", () => {
    expect(ids([ev("copiar", 2, { caracteres: COPIA_GRANDE_CARACTERES })])).toEqual(["copia_grande"]);
    expect(ids([ev("copiar", 2, { caracteres: COPIA_GRANDE_CARACTERES - 1 })])).toEqual([]);
  });

  it("15 copias en 10 minutos avisan; 14 no", () => {
    const quince = Array.from({ length: 15 }, (_, i) => ev("copiar", i % 9, { caracteres: 12 }));
    expect(ids(quince)).toEqual(["copia_repetida"]);
    expect(ids(quince.slice(1))).toEqual([]);
  });

  it("8 salidas de documentos en 10 minutos avisan, mezclando tipos", () => {
    const e = [
      ...Array.from({ length: 4 }, (_, i) => ev("exportacion", i)),
      ...Array.from({ length: 3 }, (_, i) => ev("descarga", i)),
      ev("compartir", 5),
    ];
    expect(ids(e)).toEqual(["salidas_rafaga"]);
    expect(ids(e.slice(1))).toEqual([]);
  });

  it("25 salidas repartidas en el día avisan por el acumulado diario, no por la ráfaga", () => {
    const e = Array.from({ length: 25 }, (_, i) => ev("exportacion", 30 + i * 20));
    expect(ids(e)).toEqual(["salidas_dia"]);
  });

  it("no repite el aviso dentro del enfriamiento y vuelve a avisar pasado el tiempo", () => {
    const e = [ev("captura_pantalla", 1)];
    expect(ids(e, { captura: AHORA - 5 * MIN })).toEqual([]);
    expect(ids(e, { captura: AHORA - 11 * MIN })).toEqual(["captura"]);
  });

  it("una regla ya avisada no tapa a las demás", () => {
    const e = [ev("captura_pantalla", 1), ev("copiar", 1, { caracteres: 5000 })];
    expect(ids(e, { captura: AHORA - MIN }).sort()).toEqual(["copia_grande"]);
  });
});

describe("sanearDetalle", () => {
  it("de una copia solo guarda cuántos caracteres, nunca el texto", () => {
    const d = sanearDetalle("copiar", { caracteres: 42, texto: "987654321 Juan Pérez", en: "campo", ruta: "/clientes/abc?q=secreto" });
    expect(d).toEqual({ caracteres: 42, en: "campo", ruta: "/clientes/abc" });
    expect(JSON.stringify(d)).not.toContain("Juan");
    expect(JSON.stringify(d)).not.toContain("secreto");
  });

  it("tira lo que no está en la lista blanca y limita los largos", () => {
    const d = sanearDetalle("descarga", { nombre: "x".repeat(500), correo: "a@b.c", ruta: "no es ruta?" });
    expect((d.nombre as string).length).toBe(80);
    expect(d).not.toHaveProperty("correo");
  });

  it("acepta basura sin romperse", () => {
    expect(sanearDetalle("captura_pantalla", null)).toEqual({});
    expect(sanearDetalle("copiar", "texto suelto")).toEqual({});
    expect(sanearDetalle("copiar", { caracteres: "no" })).toEqual({});
  });
});

describe("esRutaDeExportacion", () => {
  it.each([
    "/api/cotizaciones/8f1c/pdf",
    "/api/reportes/central",
    "/api/reportes/mensual",
    "/api/postventa/pedidos/reporte",
    "/api/postventa/pedidos/ab12/apertura/pdf",
    "/api/marketing/conversiones",
  ])("%s es una exportación", (r) => expect(esRutaDeExportacion(r)).toBe(true));

  it.each(["/api/cotizaciones/8f1c/pdf/vista-previa", "/api/productos/1/vista-previa", "/api/campo/osmand", "/comercial", "/api/reportes/central/x"])(
    "%s no lo es",
    (r) => expect(esRutaDeExportacion(r)).toBe(false),
  );
});

describe("seVigila", () => {
  it("gerencia y admin no; el resto sí", () => {
    expect(seVigila({ rol: "gerencia" })).toBe(false);
    expect(seVigila({ rol: "admin" })).toBe(false);
    expect(seVigila({ rol: "comercial" })).toBe(true);
    expect(seVigila({ rol: null })).toBe(true);
  });
});
