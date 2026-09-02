/**
 * Palabras para «Mi día» del comercial.
 *
 * Gerencia miró la pantalla de Katerine el 01-09 (Word de observaciones,
 * punto 2): «Vencidas 60», y preguntó si eso depende de que el comercial
 * complete alguna información. La respuesta tenía dos partes y ninguna se
 * veía: (a) 48 de esas 60 eran filas del Excel que nadie tocó desde la
 * importación, y (b) las que sí son suyas no decían hace cuánto vencieron ni
 * si les falta la próxima acción.
 *
 * Lo primero lo resuelve el archivo (migración 0130, `sanear-oportunidades-
 * fosiles.mjs`). Lo segundo, estas dos frases: una vencida de ayer y una de
 * marzo no pueden verse iguales, y «Sin acción definida» en gris parecía un
 * dato cuando es una tarea pendiente del comercial.
 */

const DIA_MS = 86_400_000;

/** Días entre dos fechas `YYYY-MM-DD`, sin zona horaria de por medio. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)));
  return Math.round((b - a) / DIA_MS);
}

/**
 * «venció ayer», «venció hace 6 días», «venció hace 3 meses», «venció hace
 * más de un año». Sin cifras que obliguen a restar de cabeza (el mismo criterio
 * del reloj humano de postventa, Santos 01-09).
 */
export function vencioHace(fecha: string, hoy: string): string {
  const dias = diasEntre(fecha, hoy);
  if (dias <= 0) return "vence hoy";
  if (dias === 1) return "venció ayer";
  if (dias < 45) return `venció hace ${dias} días`;
  if (dias < 365) return `venció hace ${Math.round(dias / 30)} meses`;
  if (dias < 730) return "venció hace más de un año";
  return `venció hace ${Math.floor(dias / 365)} años`;
}
