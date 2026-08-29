/**
 * Qué le falta al formulario de corregir una derivación para poder enviarse.
 *
 * Vive fuera del componente porque es la regla que decide si el botón
 * «Reasignar» está habilitado, y eso se prueba. Central reportó el 28-08 que el
 * botón estaba inhabilitado sin ninguna manera de saber por qué: un botón gris
 * y mudo es una pared. Ahora la pantalla enumera lo que falta con las mismas
 * palabras del formulario, en su mismo orden.
 */
export interface EstadoReasignacion {
  /** Cuántos comerciales se pueden elegir (ya descontado el actual). */
  destinos: number;
  /** El comercial elegido, si ya eligió alguno. */
  destino: string;
  motivo: string;
  pin: string;
  /** Gerencia levantó el código: hoy no se pide. */
  sinPin: boolean;
}

/** El motivo es lo único que después explica por qué se derivó mal. */
export const MINIMO_MOTIVO = 10;

export function faltasParaReasignar(e: EstadoReasignacion): string[] {
  const falta: string[] = [];
  const motivo = e.motivo.trim();

  if (e.destinos === 0) falta.push("no hay otro comercial activo al que pasarlo");
  else if (!e.destino) falta.push("elegir el comercial");

  if (motivo.length === 0) falta.push("escribir el motivo");
  else if (motivo.length < MINIMO_MOTIVO)
    falta.push(`completar el motivo (${MINIMO_MOTIVO - motivo.length} caracteres más)`);

  if (!e.sinPin && e.pin.length !== 4) falta.push("el código del supervisor, de cuatro dígitos");

  return falta;
}

export function puedeReasignar(e: EstadoReasignacion): boolean {
  return faltasParaReasignar(e).length === 0;
}
