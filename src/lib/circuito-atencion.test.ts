import { describe, expect, it } from "vitest";
import {
  CIRCUITO_POR_TIPO,
  ETAPAS_ATENCION,
  ETIQUETA_ETAPA,
  ETIQUETA_TIPO_ATENCION,
  faltaLaMaquina,
  PASOS_VISIBLES,
  motivoNoCorresponde,
  reglaDeLaCasilla,
  reglaDelPaso,
  saltarLoQueNoCorresponde,
  type TipoAtencion,
} from "./atenciones";

/**
 * El circuito de cada tipo, tal como quedó en la reunión de gerencia del
 * 28-09 (14:18). Si alguien cambia la tabla, este test dice qué decisión está
 * deshaciendo.
 */
const TIPOS = Object.keys(ETIQUETA_TIPO_ATENCION) as TipoAtencion[];

describe("circuito por tipo", () => {
  it("los cinco tipos tienen circuito, incluido soporte técnico", () => {
    expect(TIPOS.sort()).toEqual(
      ["problema_tecnico", "puesta_en_marcha", "solicitud_mantenimiento", "solicitud_repuesto", "soporte_tecnico"].sort(),
    );
    for (const t of TIPOS) expect(Object.keys(CIRCUITO_POR_TIPO[t]).sort()).toEqual([...ETAPAS_ATENCION].sort());
  });

  it("solicitud, registro y cierre son obligatorios para todos; el seguimiento nunca se espera", () => {
    for (const t of TIPOS) {
      expect(reglaDelPaso(t, "solicitud")).toBe("obligatorio");
      expect(reglaDelPaso(t, "registro")).toBe("obligatorio");
      expect(reglaDelPaso(t, "cierre")).toBe("obligatorio");
      expect(reglaDelPaso(t, "seguimiento")).toBe("opcional");
    }
  });

  it("problema técnico, soporte técnico y mantenimiento: el circuito completo", () => {
    for (const t of ["problema_tecnico", "soporte_tecnico", "solicitud_mantenimiento"] as const) {
      for (const e of ["diagnostico", "planificacion", "atencion", "pruebas", "conformidad"] as const) {
        expect(reglaDelPaso(t, e), `${t}/${e}`).toBe("obligatorio");
      }
    }
  });

  it("puesta en marcha: antecedentes y atención opcionales; pruebas y conformidad obligatorias", () => {
    expect(reglaDelPaso("puesta_en_marcha", "diagnostico")).toBe("opcional");
    expect(reglaDelPaso("puesta_en_marcha", "planificacion")).toBe("obligatorio");
    expect(reglaDelPaso("puesta_en_marcha", "atencion")).toBe("opcional");
    expect(reglaDelPaso("puesta_en_marcha", "pruebas")).toBe("obligatorio");
    expect(reglaDelPaso("puesta_en_marcha", "conformidad")).toBe("obligatorio");
  });

  it("repuesto: antecedentes opcionales y sin pruebas ni conformidad", () => {
    expect(reglaDelPaso("solicitud_repuesto", "diagnostico")).toBe("opcional");
    expect(reglaDelPaso("solicitud_repuesto", "planificacion")).toBe("obligatorio");
    expect(reglaDelPaso("solicitud_repuesto", "atencion")).toBe("obligatorio");
    expect(reglaDelPaso("solicitud_repuesto", "pruebas")).toBe("no_corresponde");
    expect(reglaDelPaso("solicitud_repuesto", "conformidad")).toBe("no_corresponde");
  });

  it("un tipo desconocido lleva el circuito completo", () => {
    expect(reglaDelPaso("otra_cosa", "diagnostico")).toBe("obligatorio");
  });
});

describe("la tira", () => {
  it("la etapa de diagnóstico se muestra como «Antecedentes»", () => {
    expect(ETIQUETA_ETAPA.diagnostico).toBe("Antecedentes");
    expect(PASOS_VISIBLES.find((p) => p.clave === "diagnostico")?.etiqueta).toBe("Antecedentes");
  });

  it("la casilla «Pruebas y conformidad» no corresponde al repuesto y es obligatoria en los demás", () => {
    const casilla = PASOS_VISIBLES.find((p) => p.clave === "pruebas")!;
    expect(reglaDeLaCasilla("solicitud_repuesto", casilla.cubre)).toBe("no_corresponde");
    expect(reglaDeLaCasilla("puesta_en_marcha", casilla.cubre)).toBe("obligatorio");
    expect(reglaDeLaCasilla("problema_tecnico", casilla.cubre)).toBe("obligatorio");
  });

  it("dice a qué tipo no corresponde", () => {
    expect(motivoNoCorresponde("solicitud_repuesto")).toBe("No corresponde a Repuesto");
  });
});

describe("pasar de largo lo que no corresponde", () => {
  it("un repuesto que termina la atención queda listo para cerrar", () => {
    expect(saltarLoQueNoCorresponde("solicitud_repuesto", "atencion")).toEqual({
      etapa: "conformidad",
      omitidas: ["pruebas", "conformidad"],
    });
  });

  it("los demás tipos no se saltean nada al terminar la atención", () => {
    for (const t of ["problema_tecnico", "soporte_tecnico", "solicitud_mantenimiento", "puesta_en_marcha"] as const) {
      expect(saltarLoQueNoCorresponde(t, "atencion")).toEqual({ etapa: "atencion", omitidas: [] });
    }
  });

  it("los opcionales no se saltean solos: los salta una persona", () => {
    expect(saltarLoQueNoCorresponde("puesta_en_marcha", "registro")).toEqual({ etapa: "registro", omitidas: [] });
    expect(saltarLoQueNoCorresponde("puesta_en_marcha", "planificacion")).toEqual({ etapa: "planificacion", omitidas: [] });
  });
});

/**
 * Rubí, 28-09: la tira hacía latir «Antecedentes» mientras el panel seguía
 * pidiendo la máquina. El registro se cumple al saber de qué máquina se habla.
 */
describe("el registro espera la máquina", () => {
  const recien = { etapa: "registro", en_garantia: null, garantia_omitida_at: null, cerrado_at: null } as const;

  it("un caso recién nacido, sin máquina, todavía no cumplió el registro", () => {
    expect(faltaLaMaquina(recien)).toBe(true);
  });

  it("con la garantía verificada —en garantía o fuera de ella— ya se cumplió", () => {
    expect(faltaLaMaquina({ ...recien, en_garantia: true })).toBe(false);
    expect(faltaLaMaquina({ ...recien, en_garantia: false })).toBe(false);
  });

  it("seguir sin identificar la máquina también lo cumple", () => {
    expect(faltaLaMaquina({ ...recien, garantia_omitida_at: "2026-09-29T13:00:00Z" })).toBe(false);
  });

  it("no aplica fuera del registro ni en un caso cerrado", () => {
    expect(faltaLaMaquina({ ...recien, etapa: "solicitud" })).toBe(false);
    expect(faltaLaMaquina({ ...recien, etapa: "planificacion" })).toBe(false);
    expect(faltaLaMaquina({ ...recien, cerrado_at: "2026-09-29T13:00:00Z" })).toBe(false);
  });
});
