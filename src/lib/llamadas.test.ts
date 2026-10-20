import { describe, expect, it } from "vitest";
import {
  cabeceraDeTranscripcion,
  carpetaPorCliente,
  carpetaPorDia,
  digitosParaComparar,
  duracionLegible,
  duracionParaNombre,
  fechaLima,
  marcaDeTiempo,
  nombreBase,
  normalizarNumero,
  numeroParaMostrar,
  pieza,
} from "./llamadas";

describe("normalizarNumero", () => {
  it("celular peruano de 9 dígitos, con espacios o guiones", () => {
    expect(normalizarNumero("987 654 321")).toBe("+51987654321");
    expect(normalizarNumero("987-654-321")).toBe("+51987654321");
  });
  it("ya con 51 o con +51", () => {
    expect(normalizarNumero("51987654321")).toBe("+51987654321");
    expect(normalizarNumero("+51 987 654 321")).toBe("+51987654321");
    expect(normalizarNumero("0051987654321")).toBe("+51987654321");
  });
  it("fijo de Lima: el 01 pasa a ser el 1 del +51", () => {
    expect(normalizarNumero("(01) 504-1695")).toBe("+5115041695");
  });
  it("número de otro país se respeta", () => {
    expect(normalizarNumero("+1 305 555 0100")).toBe("+13055550100");
  });
  it("lo que no es un teléfono da null", () => {
    expect(normalizarNumero("")).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
    expect(normalizarNumero("*123#")).toBeNull();
    expect(normalizarNumero("1234")).toBeNull();
  });
});

describe("digitosParaComparar", () => {
  it("los mismos 8 finales aunque venga escrito distinto", () => {
    expect(digitosParaComparar("+51 987 654 321")).toBe("87654321");
    expect(digitosParaComparar("987654321")).toBe("87654321");
    expect(digitosParaComparar("51-987654321")).toBe("87654321");
  });
  it("muy corto no se compara", () => {
    expect(digitosParaComparar("123")).toBeNull();
    expect(digitosParaComparar(undefined)).toBeNull();
  });
});

describe("numeroParaMostrar", () => {
  it("987 654 321", () => {
    expect(numeroParaMostrar("+51987654321")).toBe("987 654 321");
    expect(numeroParaMostrar("987654321")).toBe("987 654 321");
  });
  it("sin número muestra una raya", () => {
    expect(numeroParaMostrar(null)).toBe("—");
  });
});

describe("fechaLima", () => {
  it("la base guarda UTC: 20:42 UTC es 15:42 en Lima", () => {
    const f = fechaLima("2026-10-19T20:42:10Z");
    expect(f.fecha).toBe("2026-10-19");
    expect(f.hora).toBe("15h42");
    expect(f.horaPantalla).toBe("15:42");
    expect(f.diaSemana).toBe("lunes");
  });
  it("la 1 a. m. UTC todavía es la noche anterior en Lima", () => {
    const f = fechaLima("2026-10-20T01:30:00Z");
    expect(f.fecha).toBe("2026-10-19");
    expect(f.hora).toBe("20h30");
  });
  it("medianoche en Lima no sale «24»", () => {
    expect(fechaLima("2026-10-20T05:05:00Z").hora).toBe("00h05");
  });
});

describe("duraciones", () => {
  it("para el nombre", () => {
    expect(duracionParaNombre(0)).toBe("0s");
    expect(duracionParaNombre(45)).toBe("45s");
    expect(duracionParaNombre(205)).toBe("3m25s");
    expect(duracionParaNombre(3600)).toBe("60m00s");
    expect(duracionParaNombre(-4)).toBe("0s");
  });
  it("para leer", () => {
    expect(duracionLegible(45)).toBe("45 s");
    expect(duracionLegible(205)).toBe("3 min 25 s");
  });
});

describe("pieza", () => {
  it("mayúsculas, sin tildes ni eñes, solo guiones", () => {
    expect(pieza("Lavandería El Sol S.A.C.")).toBe("LAVANDERIA-EL-SOL-S-A-C");
    expect(pieza("MUÑOZ & HIJOS / MINA CORANI")).toBe("MUNOZ-HIJOS-MINA-CORANI");
    expect(pieza('HOSTAL "LA JOYA"')).toBe("HOSTAL-LA-JOYA");
  });
  it("vacío o solo símbolos da vacío", () => {
    expect(pieza("")).toBe("");
    expect(pieza("***")).toBe("");
    expect(pieza(null)).toBe("");
  });
  it("corta sin dejar un guion colgando", () => {
    const largo = pieza("A".repeat(55) + " BBBBBBBB", 60);
    expect(largo.length).toBeLessThanOrEqual(60);
    expect(largo.endsWith("-")).toBe(false);
  });
});

describe("nombreBase", () => {
  const base = {
    iniciada_at: "2026-10-19T20:42:10Z",
    codigoComercial: "C5",
    nombreComercial: "Santos Vilcachagua",
    cliente: "LAVANDERIA EL SOL S.A.C.",
    numero: "+51987654321",
    duracion_s: 205,
  };
  it("fecha, hora de Lima, comercial, cliente, número y duración", () => {
    expect(nombreBase(base)).toBe("2026-10-19_15h42_C5-Santos_LAVANDERIA-EL-SOL-S-A-C_987654321_3m25s");
  });
  it("sin ficha ni número ni comercial: nunca queda un hueco", () => {
    const n = nombreBase({ iniciada_at: "2026-10-19T20:42:10Z", numero: null, duracion_s: 0 });
    expect(n).toBe("2026-10-19_15h42_SIN-COMERCIAL_SIN-FICHA_SIN-NUMERO_0s");
  });
  it("sirve en Windows: ningún carácter prohibido", () => {
    const n = nombreBase({ ...base, cliente: 'BEAR CREEK MINING S.A.C. / MINA "CORANI"' });
    expect(n).not.toMatch(/[\\/:*?"<>|\s]/);
  });
  it("un número fijo conserva sus dígitos", () => {
    expect(nombreBase({ ...base, numero: "(01) 504-1695" })).toContain("_5115041695_");
  });
});

describe("carpetas", () => {
  it("por día, con la fecha de Lima", () => {
    expect(carpetaPorDia("2026-10-19T20:42:10Z")).toBe("por-dia/2026/10/2026-10-19");
    expect(carpetaPorDia("2026-10-20T01:30:00Z")).toBe("por-dia/2026/10/2026-10-19");
    expect(carpetaPorDia("2027-01-01T03:00:00Z")).toBe("por-dia/2026/12/2026-12-31");
  });
  it("por cliente, con su RUC", () => {
    expect(carpetaPorCliente("Lavandería El Sol SAC", "20601234567")).toBe("por-cliente/LAVANDERIA-EL-SOL-SAC_20601234567");
    expect(carpetaPorCliente("Lavandería El Sol SAC")).toBe("por-cliente/LAVANDERIA-EL-SOL-SAC");
  });
  it("sin ficha", () => {
    expect(carpetaPorCliente(null)).toBe("por-cliente/SIN-FICHA");
  });
});

describe("cabeceraDeTranscripcion", () => {
  it("dice de qué llamada es sin abrir el CRM", () => {
    const t = cabeceraDeTranscripcion({
      cliente: "LAVANDERIA EL SOL S.A.C.",
      documento: "20601234567",
      contacto: "Juan Pérez",
      cargo: "Jefe de mantenimiento",
      comercial: "Santos",
      codigoComercial: "C5",
      iniciada_at: "2026-10-19T20:42:10Z",
      duracion_s: 205,
      numero: "+51987654321",
      resumen: "Pidió cotización de una UniMac de 30 kg.",
      proximaAccion: "Volver a llamar el jueves",
    });
    expect(t).toContain("Cliente: LAVANDERIA EL SOL S.A.C. (RUC/DNI 20601234567)");
    expect(t).toContain("Contacto: Juan Pérez — Jefe de mantenimiento");
    expect(t).toContain("Comercial: C5 Santos");
    expect(t).toContain("Fecha: lunes 19-10-2026, 15:42 (Lima) · Duración: 3 min 25 s");
    expect(t).toContain("Número: 987 654 321");
    expect(t).toContain("--- RESUMEN ---");
    expect(t).toContain("Próxima acción: Volver a llamar el jueves");
    expect(t.trimEnd().endsWith("--- TRANSCRIPCIÓN ---")).toBe(true);
  });
  it("sin resumen todavía no pone la sección", () => {
    const t = cabeceraDeTranscripcion({ iniciada_at: "2026-10-19T20:42:10Z", duracion_s: 30, numero: null });
    expect(t).toContain("Cliente: SIN FICHA");
    expect(t).not.toContain("RESUMEN");
  });
});

describe("marcaDeTiempo", () => {
  it("[03:25]", () => {
    expect(marcaDeTiempo(205.7)).toBe("[03:25]");
    expect(marcaDeTiempo(0)).toBe("[00:00]");
  });
});

describe("digitosParaComparar: fijos de Lima", () => {
  it("el contacto guardado como (01) 504-1695 coincide con la llamada a +5115041695", () => {
    expect(digitosParaComparar("(01) 504-1695")).toBe(digitosParaComparar("+5115041695"));
  });
});
