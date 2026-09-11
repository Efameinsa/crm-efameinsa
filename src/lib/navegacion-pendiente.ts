import { useSyncExternalStore } from "react";

/**
 * «ESTÁ PASANDO ALGO»: una sola señal para toda la pantalla.
 *
 * Santos, 11-09, sobre las listas que paginan en el servidor (carteras,
 * clientes de gerencia y Central, cotizaciones): tardan un tercio de segundo
 * —son las más rápidas del CRM— pero en ese tercio la pantalla se queda
 * idéntica y después cambia de golpe, así que se siente lenta y se vuelve a
 * hacer clic. Next deja lo viejo en pantalla a propósito mientras llega lo
 * nuevo (así funcionan las transiciones), y el filtro que sabe que navegó es
 * un componente y la tabla que debería atenuarse es otro.
 *
 * Esto los conecta sin pasar props: quien navega llama `marcarPendiente()`, y
 * `EsperaDeNavegacion` —que envuelve la tabla— lo lee y se atenúa hasta que
 * la URL cambia. Es un almacén de un solo booleano, sin librería.
 */

let pendiente = false;
const oyentes = new Set<() => void>();

export function marcarPendiente(valor = true) {
  if (pendiente === valor) return;
  pendiente = valor;
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
}

export function useNavegacionPendiente(): boolean {
  return useSyncExternalStore(suscribir, () => pendiente, () => false);
}
