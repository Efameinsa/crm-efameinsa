/**
 * EL RECORRIDO DE CAMPO, LEÍDO COMO LO LEE GERENCIA (0363).
 *
 * Ing. Carlos, reunión 01-10-2026 11:05, sobre el piloto de Brenda: «hacer
 * que lo más preciso sea posible … no queremos 2 metros, pero menos de 10
 * metros … después si entra o no entra a su CRM ya lo puedes medir todo».
 *
 * El navegador manda una lectura al ingresar y cada 10 minutos mientras el CRM
 * esté abierto. Acá se ordena eso para la pantalla: qué tan buena fue cada
 * lectura y en qué tramos NO hubo señal (CRM cerrado, laptop suspendida, sin
 * internet). Un hueco no es una falta: es un dato, y se dice como tal.
 */

export type EstadoUbicacion = "ok" | "denegado" | "no_disponible" | "tiempo_agotado" | "no_soportado";
export type OrigenUbicacion = "ingreso" | "periodica" | "manual";

export interface RegistroUbicacion {
  id: string;
  user_id: string;
  lat: number | null;
  lon: number | null;
  precision_m: number | null;
  origen: OrigenUbicacion;
  estado: EstadoUbicacion;
  detalle: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Cada cuánto manda el navegador una lectura mientras el CRM está abierto. */
export const INTERVALO_MIN = 10;
/**
 * Desde cuántos minutos sin lecturas se habla de «sin señal». El intervalo es
 * de 10; el navegador frena los temporizadores de las pestañas de fondo y la
 * lectura con wifi tarda hasta 20 s, así que con 25 no se marcan huecos que no
 * son tales.
 */
export const HUECO_MIN = 25;
/** Por encima de esto la lectura ya no dice en qué cuadra está: se pinta en rojo. */
export const PRECISION_DUDOSA_M = 100;

export function precisionDudosa(m: number | null | undefined): boolean {
  return m == null || m > PRECISION_DUDOSA_M;
}

/** «±8 m», «±1,2 km»; sin dato, «sin precisión». */
export function textoPrecision(m: number | null | undefined): string {
  if (m == null) return "sin precisión";
  if (m >= 1000) return `±${(m / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} km`;
  return `±${Math.round(m)} m`;
}

export function urlGoogleMaps(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/** Lo que pasó cuando no hubo coordenadas, dicho para gerencia. */
export function textoEstado(estado: EstadoUbicacion): string {
  switch (estado) {
    case "ok":
      return "Ubicación registrada";
    case "denegado":
      return "No dio permiso de ubicación en el navegador";
    case "no_disponible":
      return "El equipo no supo ubicarse (ubicación de Windows apagada o sin wifi cerca)";
    case "tiempo_agotado":
      return "El equipo no respondió a tiempo";
    case "no_soportado":
      return "El navegador no permite ubicar";
  }
}

export interface TramoSinSenal {
  desde: string;
  /** null: sigue sin señal hasta ahora. */
  hasta: string | null;
  minutos: number;
}

/**
 * Los tramos sin lectura entre dos registros (de cualquier estado: una fila
 * «denegado» también prueba que el CRM estaba abierto). Si la última lectura
 * es vieja y el día es hoy, el tramo queda abierto hasta `ahora`.
 */
export function tramosSinSenal(
  registros: Pick<RegistroUbicacion, "created_at">[],
  opciones: { ahora?: number; esHoy?: boolean; huecoMin?: number } = {},
): TramoSinSenal[] {
  const umbral = (opciones.huecoMin ?? HUECO_MIN) * 60_000;
  const tiempos = registros.map((r) => new Date(r.created_at).getTime()).sort((a, b) => a - b);
  const tramos: TramoSinSenal[] = [];
  for (let i = 1; i < tiempos.length; i++) {
    const hueco = tiempos[i] - tiempos[i - 1];
    if (hueco > umbral) {
      tramos.push({
        desde: new Date(tiempos[i - 1]).toISOString(),
        hasta: new Date(tiempos[i]).toISOString(),
        minutos: Math.round(hueco / 60_000),
      });
    }
  }
  const ultimo = tiempos[tiempos.length - 1];
  if (opciones.esHoy && ultimo != null) {
    const ahora = opciones.ahora ?? Date.now();
    if (ahora - ultimo > umbral) {
      tramos.push({ desde: new Date(ultimo).toISOString(), hasta: null, minutos: Math.round((ahora - ultimo) / 60_000) });
    }
  }
  return tramos;
}

/** «45 min», «2 h 15 min». */
export function duracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Distancia en metros entre dos puntos (haversine): para no repetir el mismo lugar en el recorrido. */
export function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
