import { describe, expect, it } from "vitest";
import {
  clavePersona,
  estadoGestionParque,
  comproParque,
  filtrarParque,
  mesesDelAnio,
  nombreCorto,
  personasDeGestion,
  personasDelParque,
  type ClienteParque,
} from "./parque";

// Los casos de la reunión de gerencia del 02-10: Ariana y Gabriela venden el
// preventivo sobre «Las ventas de la empresa» y cada una tiene que poder
// seguir lo suyo sin tocar lo de la otra.
function cliente(p: Partial<ClienteParque> = {}): ClienteParque {
  return {
    cuentaId: "cta-1",
    razonSocial: "AGRICOLA GUARME",
    numDoc: "20100000001",
    zona: "HUACHO",
    carteraDe: "C5",
    carteraNombre: "Rubí",
    equipos: 1,
    modelos: [],
    ultimaCompraAt: "2025-03-14",
    ventasDePostventa: 1,
    ventasDeComercial: 0,
    ventasDeRepuesto: 0,
    ventasDeMantenimiento: 1,
    ultimoMantenimiento: null,
    mesesSinMantenimiento: null,
    estado: "nunca",
    garantiaHasta: null,
    ultimaGestion: null,
    noContactar: false,
    enGestion: null,
    ...p,
  };
}

const gestion = (quien: string, codigo: string | null) => ({
  at: "2026-08-07T15:00:00Z",
  quien: nombreCorto(quien, codigo),
  quienClave: clavePersona(quien, codigo),
  tipo: "llamada",
});
const abierta = (quien: string, codigo: string | null) => ({
  oportunidadId: "op-1",
  quien: `${quien}${codigo ? ` (${codigo})` : ""}`,
  quienCorto: nombreCorto(quien, codigo),
  quienClave: clavePersona(quien, codigo),
  desde: "2026-08-07",
  proximaAccion: null,
});

const nadie = cliente({ cuentaId: "a", razonSocial: "NADIE LO LLAMO SAC", ultimaCompraAt: "2025-03-02" });
const deAriana = cliente({ cuentaId: "b", razonSocial: "LLAMO ARIANA", ultimaCompraAt: "2025-03-20", ultimaGestion: gestion("Ariana Pérez", "PV1") });
const enProceso = cliente({
  cuentaId: "c",
  razonSocial: "EN PROCESO GABRIELA",
  ultimaCompraAt: "2025-07-01",
  ultimaGestion: gestion("Ariana Pérez", "PV1"),
  enGestion: abierta("Gabriela Ruiz", "PV2"),
});
const viejo = cliente({ cuentaId: "d", razonSocial: "COMPRO EN 2024", ultimaCompraAt: "2024-03-10", ventasDePostventa: 0 });
const TODOS = [nadie, deAriana, enProceso, viejo];
const ids = (l: ClienteParque[]) => l.map((c) => c.cuentaId);

describe("el mes, dentro del año", () => {
  it("corta por mes solo dentro del año elegido", () => {
    expect(ids(filtrarParque(TODOS, { anio: "2025", mes: "03" }))).toEqual(["a", "b"]);
    expect(ids(filtrarParque(TODOS, { anio: "2025", mes: "07" }))).toEqual(["c"]);
    // Marzo de 2024 no es marzo de 2025.
    expect(ids(filtrarParque(TODOS, { anio: "2024", mes: "03" }))).toEqual(["d"]);
  });

  it("sin año, el mes no recorta nada: no se mezclan los marzos de todos los años", () => {
    expect(filtrarParque(TODOS, { mes: "03" })).toHaveLength(4);
  });

  it("cuenta los clientes de cada mes del año para los botones", () => {
    expect([...mesesDelAnio(TODOS, "2025")].sort()).toEqual([
      ["03", 2],
      ["07", 1],
    ]);
    expect(mesesDelAnio(TODOS, "2023").size).toBe(0);
  });
});

describe("la gestión: nadie, le falta, en proceso", () => {
  it("clasifica en qué quedó cada cliente", () => {
    expect(estadoGestionParque(nadie)).toBe("nadie");
    expect(estadoGestionParque(deAriana)).toBe("falta");
    // Con la oportunidad abierta manda «en proceso», aunque haya llamada.
    expect(estadoGestionParque(enProceso)).toBe("en_proceso");
    expect(estadoGestionParque(cliente({ enGestion: abierta("Gabriela Ruiz", "PV2") }))).toBe("en_proceso");
  });

  it("filtra por estado de la gestión y se cruza con año y mes", () => {
    expect(ids(filtrarParque(TODOS, { gestion: "nadie" }))).toEqual(["a", "d"]);
    expect(ids(filtrarParque(TODOS, { gestion: "nadie", anio: "2025", mes: "03" }))).toEqual(["a"]);
    expect(ids(filtrarParque(TODOS, { gestion: "en_proceso" }))).toEqual(["c"]);
  });
});

describe("quién lo hizo", () => {
  it("la misma persona da la misma clave venga de la actividad o de la oportunidad", () => {
    expect(gestion("Ariana Pérez", "PV1").quienClave).toBe(abierta("Ariana Pérez", "PV1").quienClave);
    // Sin código, por su nombre.
    expect(clavePersona("Carlos Gerente", null)).toBe("Carlos Gerente");
    expect(clavePersona(null, null)).toBeNull();
  });

  it("el cliente es de quien hizo la última gestión y de quien tiene la oportunidad abierta", () => {
    expect(personasDeGestion(enProceso).sort()).toEqual(["PV1", "PV2"]);
    expect(personasDeGestion(nadie)).toEqual([]);
  });

  it("«Ariana soy yo, entonces voy a continuar mi gestión»", () => {
    expect(ids(filtrarParque(TODOS, { quien: "PV1" }))).toEqual(["b", "c"]);
    expect(ids(filtrarParque(TODOS, { quien: "PV2" }))).toEqual(["c"]);
    // Las de Ariana que todavía no tienen oportunidad abierta: lo que le falta.
    expect(ids(filtrarParque(TODOS, { quien: "PV1", gestion: "falta" }))).toEqual(["b"]);
  });

  it("lista a las personas con cuántos clientes tiene cada una, de más a menos", () => {
    expect(personasDelParque(TODOS)).toEqual([
      { clave: "PV1", nombre: "Ariana (PV1)", n: 2 },
      { clave: "PV2", nombre: "Gabriela (PV2)", n: 1 },
    ]);
  });
});

describe("lo que ya existía sigue igual", () => {
  it("lote, estado y búsqueda", () => {
    expect(ids(filtrarParque(TODOS, { origen: "postventa" }))).toEqual(["a", "b", "c"]);
    expect(ids(filtrarParque(TODOS, { origen: "comercial" }))).toEqual(["d"]);
    expect(ids(filtrarParque(TODOS, { q: "gabriela" }))).toEqual(["c"]);
    expect(ids(filtrarParque(TODOS, { estado: "al_dia" }))).toEqual([]);
    expect(filtrarParque(TODOS, {})).toHaveLength(4);
  });
});

describe("qué compró (Gabriela, 05-10)", () => {
  it("máquina: fichada o vendida por un comercial; repuesto y mantenimiento por su venta", () => {
    const soloRepuesto = cliente({ equipos: 0, ventasDeComercial: 0, ventasDeRepuesto: 2, ventasDeMantenimiento: 0 });
    const maquina = cliente({ equipos: 0, ventasDeComercial: 1, ventasDeRepuesto: 0, ventasDeMantenimiento: 0 });
    expect(comproParque(soloRepuesto, "maquina")).toBe(false);
    expect(comproParque(soloRepuesto, "repuesto")).toBe(true);
    expect(comproParque(maquina, "maquina")).toBe(true);
    expect(filtrarParque([soloRepuesto, maquina], { compro: "repuesto" })).toEqual([soloRepuesto]);
  });
});
