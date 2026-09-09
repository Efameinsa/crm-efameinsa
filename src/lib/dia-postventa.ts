import type { ServicioPostventa } from "@/lib/postventa";

/**
 * El día del área, en cuatro números.
 *
 * Carlos lo pidió dos veces el 09-09, y las dos con la palabra «urgente»:
 * «acá nos falta la agenda diaria… ¿qué atenciones tuve? ¿cuántos pendientes
 * tengo?» y después «todo esto me tiene que salir en mi agenda diaria: cuáles
 * tenemos despachos programados, despachos pendientes, puesta en marcha
 * pendiente, entregas pendientes. En postventa sí va a ser más nutrido».
 *
 * El porqué no es cosmético: «siguen trabajando en el board… están llenando de
 * información repetida que ya está acá». Mientras el CRM no conteste «¿qué
 * tengo hoy?», el área sigue llevando su cuenta aparte.
 *
 * SE CUENTA POR LO QUE FALTA HACER, no por etiquetas. Cada pedido cae en UNA
 * casilla —la primera que le corresponde yendo de atrás hacia adelante en el
 * circuito—, así que los números suman sin pisarse y se puede confiar en
 * ellos.
 */
export type CasilleroDia =
  | "puesta_pendiente"
  | "despacho_programado"
  | "listo_sin_fecha"
  | "sin_apertura";

export const ETIQUETA_CASILLERO: Record<CasilleroDia, string> = {
  puesta_pendiente: "Despachados, falta la puesta en marcha",
  despacho_programado: "Despachos programados",
  listo_sin_fecha: "Listos para despachar, sin fecha",
  sin_apertura: "Todavía sin apertura de despacho",
};

export const AYUDA_CASILLERO: Record<CasilleroDia, string> = {
  puesta_pendiente: "El equipo ya salió del almacén y el cliente todavía no lo tiene andando.",
  despacho_programado: "Con día puesto y el camión sin salir.",
  listo_sin_fecha: "La apertura está emitida: solo falta decidir cuándo sale.",
  sin_apertura: "Falta algo de la preparación para poder emitir la apertura.",
};

/**
 * En qué casilla cae un pedido vivo, o `null` si ya no pide nada.
 *
 * El orden importa: se pregunta primero por lo más avanzado. Un pedido
 * despachado no vuelve a contarse como «programado» solo porque conserve su
 * fecha.
 */
export function casilleroDelPedido(s: ServicioPostventa, hoyIso: string): CasilleroDia | null {
  if (s.completado || s.cerrado_at) return null;
  if (s.despachado_at) return s.puesta_en_marcha ? null : "puesta_pendiente";
  if (s.apertura_despacho_at) {
    // Una fecha ya pasada sigue siendo un despacho que no salió: se cuenta como
    // programado igual, porque es exactamente lo que hay que destrabar hoy.
    return s.fecha_despacho ? "despacho_programado" : "listo_sin_fecha";
  }
  return "sin_apertura";
}

/** Los cuatro números, en el orden en que se miran. */
export function contarElDia(
  pedidos: ServicioPostventa[],
  hoyIso: string,
): { casillero: CasilleroDia; cuantos: number; atrasados: number }[] {
  const orden: CasilleroDia[] = ["puesta_pendiente", "despacho_programado", "listo_sin_fecha", "sin_apertura"];
  const cuenta = new Map<CasilleroDia, { cuantos: number; atrasados: number }>(
    orden.map((c) => [c, { cuantos: 0, atrasados: 0 }]),
  );
  for (const s of pedidos) {
    const c = casilleroDelPedido(s, hoyIso);
    if (!c) continue;
    const casilla = cuenta.get(c)!;
    casilla.cuantos += 1;
    // ATRASADO es lo que tenía fecha y ya pasó. Es el número que de verdad
    // duele y el que el board llevaba a mano.
    if (c === "despacho_programado" && s.fecha_despacho && s.fecha_despacho < hoyIso) casilla.atrasados += 1;
  }
  return orden.map((casillero) => ({ casillero, ...cuenta.get(casillero)! }));
}
