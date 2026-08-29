/**
 * Los tipos de equipo del catálogo y las casillas que usa cada uno.
 *
 * «Solo hay tres categorías que tienen diferente cantidad de inputs, como
 * planchas industriales y coches; ahí podría haber una pregunta de qué tipo de
 * producto subir y según eso se acomodaría la vista» (28-08). Exacto, y no hace
 * falta adivinarlo: está en los 121 equipos cargados.
 *
 * Lo que dice el catálogo de hoy, contado equipo por equipo:
 *
 *   · LAVADORA (45)      capacidad 45/45 · panel 44 · controles 45 · calentamiento 3
 *   · SECADORA (40)      capacidad 40/40 · calentamiento 38 · panel 39 · controles 40
 *   · PLANCHADOR (26)    calentamiento 24 · controles 26 · panel CERO · capacidad 9
 *   · COCHE (6)          solo volumen — ni panel, ni controles, ni calentamiento
 *   · TORRE (4)          todas
 *
 * Por eso una plancha no muestra «Panel computarizado»: ninguna de las 26 lo
 * tiene, y un campo que nunca se llena solo sirve para que quien carga el
 * equipo se pregunte si se le olvidó algo. Y un coche pide «Volumen», que es
 * como lo rotula su propia ficha impresa.
 *
 * Las casillas que un tipo no usa no desaparecen del equipo: si un equipo ya
 * las trae cargadas se siguen viendo (el catálogo real siempre tiene su
 * excepción), pero no se ofrecen al cargar uno nuevo.
 */

export type CasillaEquipo = "capacidad" | "calentamiento" | "panel" | "controles" | "montaje" | "colores";

export interface TipoEquipo {
  clave: string;
  nombre: string;
  /** Cómo lo rotula la ficha impresa; «Volumen» en los coches. */
  rotuloCapacidad: string;
  casillas: CasillaEquipo[];
  /** Un ejemplo real del catálogo, para que se entienda de qué se habla. */
  ejemplo: string;
}

export const TIPOS_EQUIPO: TipoEquipo[] = [
  {
    clave: "lavadora",
    nombre: "Lavadora",
    rotuloCapacidad: "Capacidad",
    casillas: ["capacidad", "panel", "controles", "montaje"],
    ejemplo: "PRIMUS RX280, UNIMAC UT075",
  },
  {
    clave: "secadora",
    nombre: "Secadora",
    rotuloCapacidad: "Capacidad",
    casillas: ["capacidad", "calentamiento", "panel", "controles", "montaje"],
    ejemplo: "PRIMUS DX septiembre, LG TITAN",
  },
  {
    clave: "planchador",
    nombre: "Plancha o planchador",
    rotuloCapacidad: "Capacidad",
    casillas: ["calentamiento", "controles", "capacidad"],
    ejemplo: "SIDI MONDIAL FENIX, calandrias",
  },
  {
    clave: "coche",
    nombre: "Coche de transporte",
    rotuloCapacidad: "Volumen",
    casillas: ["capacidad", "colores"],
    ejemplo: "Efamein HM-402, HM-408",
  },
  {
    clave: "lavadora-secadora",
    nombre: "Torre lavadora-secadora",
    rotuloCapacidad: "Capacidad",
    casillas: ["capacidad", "calentamiento", "panel", "controles", "montaje"],
    ejemplo: "las dos máquinas en una",
  },
];

const TODAS: CasillaEquipo[] = ["capacidad", "calentamiento", "panel", "controles", "montaje", "colores"];

/** El tipo de un equipo por su categoría; null si no encaja en ninguno. */
export function tipoDeCategoria(categoria: string | null): TipoEquipo | null {
  if (!categoria) return null;
  const c = categoria.trim().toLowerCase();
  return TIPOS_EQUIPO.find((t) => t.clave === c) ?? null;
}

/**
 * Qué casillas mostrar para un equipo.
 *
 * Las de su tipo, más cualquiera que el equipo YA tenga cargada aunque su tipo
 * no la use: esconder un dato que existe es peor que mostrar uno de más — se
 * seguiría imprimiendo en la ficha y nadie podría corregirlo desde acá.
 */
export function casillasDe(categoria: string | null, yaCargadas: CasillaEquipo[] = []): CasillaEquipo[] {
  const tipo = tipoDeCategoria(categoria);
  if (!tipo) return TODAS;
  return TODAS.filter((c) => tipo.casillas.includes(c) || yaCargadas.includes(c));
}
