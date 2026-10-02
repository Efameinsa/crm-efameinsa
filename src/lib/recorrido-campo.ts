import { distanciaM } from "@/lib/ubicacion-campo";

/**
 * LO QUE EL MAPA DE GERENCIA DICE DE UN RECORRIDO (02-10-2026, Santos: «¿puedes mejorar el mapa para que
 * aumente la precisión o crees que así está bien?»).
 *
 * La PRECISIÓN la da el GPS del celular (±3-10 m al aire libre, 15-50 m bajo techo) y ningún mapa la
 * mejora. Lo que sí se puede mejorar es cómo se LEE la nube de puntos:
 *
 *   · un celular quieto no dibuja un punto sino una mancha (cada lectura cae unos metros distinta): se
 *     junta en una PARADA («estuvo 35 min en este lugar»);
 *   · una lectura mala (±150 m) no debe torcer la línea del recorrido: se deja fuera de la línea y se
 *     cuenta, en vez de hacerla pasar por un desplazamiento real;
 *   · los kilómetros se miden sobre la línea limpia, no sumando el temblor del GPS.
 *
 * Solo para los puntos del GPS de la app. Las lecturas del navegador (wifi, ±50 m) no se analizan.
 */

export interface PuntoAnalizable {
  lat: number;
  lon: number;
  /** Radio de error en metros que declara el equipo; null si no lo dijo. */
  precision: number | null;
  /** Hora de la lectura (ms Unix). */
  t: number;
}

export interface Parada {
  lat: number;
  lon: number;
  desde: number;
  hasta: number;
  minutos: number;
  puntos: number;
}

export type Nodo =
  | { tipo: "punto"; lat: number; lon: number; t: number; precision: number | null }
  | { tipo: "parada"; parada: Parada };

export interface AnalisisRecorrido {
  /** La línea limpia, en orden: puntos sueltos y paradas (cada parada es un solo nodo, en su centro). */
  nodos: Nodo[];
  paradas: Parada[];
  /** Lecturas con más error del tolerable: no entran en la línea ni en las paradas. */
  descartados: PuntoAnalizable[];
  /** Largo de la línea limpia. */
  km: number;
  primero: PuntoAnalizable | null;
  ultimo: PuntoAnalizable | null;
}

/** Más error que esto (m) y la lectura no sirve para trazar nada. */
export const PRECISION_MAX_M = 100;
/** Dentro de este radio (m) alrededor del centro de la parada, seguir ahí cuenta como seguir quieto. */
export const PARADA_RADIO_M = 40;
/** Menos tiempo que esto no es una parada: es un semáforo. */
export const PARADA_MIN = 5;
/** Si entre dos lecturas pasa más que esto sin datos, no se afirma que siguió ahí. */
export const PARADA_HUECO_MIN = 20;

const MIN_MS = 60_000;

function centro(ps: PuntoAnalizable[]): { lat: number; lon: number } {
  const lat = ps.reduce((a, p) => a + p.lat, 0) / ps.length;
  const lon = ps.reduce((a, p) => a + p.lon, 0) / ps.length;
  return { lat, lon };
}

export function analizarRecorrido(puntosCrudos: PuntoAnalizable[]): AnalisisRecorrido {
  const ordenados = [...puntosCrudos].sort((a, b) => a.t - b.t);
  const buenos: PuntoAnalizable[] = [];
  const descartados: PuntoAnalizable[] = [];
  for (const p of ordenados) {
    if (p.precision != null && p.precision > PRECISION_MAX_M) descartados.push(p);
    else buenos.push(p);
  }

  const nodos: Nodo[] = [];
  const paradas: Parada[] = [];
  let i = 0;
  while (i < buenos.length) {
    // ¿Desde `i` hay un grupo de lecturas que se quedan en el mismo lugar?
    let j = i;
    let grupo = [buenos[i]];
    while (j + 1 < buenos.length) {
      const siguiente = buenos[j + 1];
      if (siguiente.t - buenos[j].t > PARADA_HUECO_MIN * MIN_MS) break;
      const c = centro([...grupo, siguiente]);
      if (distanciaM(c, siguiente) > PARADA_RADIO_M || grupo.some((g) => distanciaM(c, g) > PARADA_RADIO_M)) break;
      grupo = [...grupo, siguiente];
      j++;
    }
    const minutos = (grupo[grupo.length - 1].t - grupo[0].t) / MIN_MS;
    if (grupo.length >= 2 && minutos >= PARADA_MIN) {
      const c = centro(grupo);
      const parada: Parada = { ...c, desde: grupo[0].t, hasta: grupo[grupo.length - 1].t, minutos: Math.round(minutos), puntos: grupo.length };
      paradas.push(parada);
      nodos.push({ tipo: "parada", parada });
      i = j + 1;
    } else {
      nodos.push({ tipo: "punto", lat: buenos[i].lat, lon: buenos[i].lon, t: buenos[i].t, precision: buenos[i].precision });
      i++;
    }
  }

  let metros = 0;
  const coord = (n: Nodo) => (n.tipo === "parada" ? { lat: n.parada.lat, lon: n.parada.lon } : { lat: n.lat, lon: n.lon });
  for (let k = 1; k < nodos.length; k++) metros += distanciaM(coord(nodos[k - 1]), coord(nodos[k]));

  return {
    nodos,
    paradas,
    descartados,
    km: Math.round(metros / 100) / 10,
    primero: buenos[0] ?? null,
    ultimo: ordenados[ordenados.length - 1] ?? null,
  };
}

/** «hace 3 min», «hace 2 h 10 min». */
export function haceMinutos(t: number, ahora: number = Date.now()): string {
  const m = Math.max(0, Math.round((ahora - t) / MIN_MS));
  if (m < 1) return "hace menos de 1 min";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
