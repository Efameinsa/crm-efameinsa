/**
 * ¿Hay algo escrito sin guardar en esta pestaña? (Santos, 30-09)
 *
 * Los formularios largos se anotan acá mientras tienen cambios pendientes, y
 * la pastilla de «Hay una versión nueva» lo pregunta antes de recargar: a
 * Gabriela un despliegue le rompió la corrección a medias y todo se perdió.
 */
const pendientes = new Set<string>();

export function marcarSinGuardar(clave: string, hay: boolean) {
  if (hay) pendientes.add(clave);
  else pendientes.delete(clave);
}

export function haySinGuardar(): boolean {
  return pendientes.size > 0;
}
