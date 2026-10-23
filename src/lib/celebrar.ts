/**
 * LA CELEBRACIÓN (Santos, 23-10-2026): «al cerrar un caso o un pedido en el CRM
 * debe salir celebracion-efamein, y cuando se termina un estadio o se realiza
 * un paso de un estado a otro debe salir celebracion-crm». Como el unicornio de
 * Asana al terminar una tarea, pero con la marca: la «e» del isotipo cruza la
 * pantalla y estampa un sello (paso), o Efamein sale al centro con confeti (cierre).
 *
 * Este archivo es solo el timbre. Cualquier componente cliente llama a
 * `celebrar("paso")` o `celebrar("cierre")` justo después del `toast.success`;
 * quien escucha y dibuja es `<Celebraciones />` (components/crm/celebraciones.tsx),
 * montado una sola vez en el layout raíz. Así los quince sitios que cambian de
 * estado no cargan nada: el reproductor se trae recién la primera vez que hace
 * falta. Si no hay ventana (servidor), no hace nada.
 */
export type Celebracion = "paso" | "cierre";

export const EVENTO_CELEBRAR = "efa:celebrar";

export function celebrar(tipo: Celebracion) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Celebracion>(EVENTO_CELEBRAR, { detail: tipo }));
}
