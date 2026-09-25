// Sin dependencias de servidor: lo usan el layout, las páginas y el proxy.

/**
 * QUIÉN VE QUÉ VISTA (Santos, 25-09: «que por defecto aparezca la vista
 * moderna para todos sin opción a cambio; la vista antigua, en las cuentas
 * test»). Las cuentas oficiales ven siempre la vista nueva; las _test, siempre
 * la anterior, para comparar. Sin interruptor: la cookie ya no cuenta.
 */
export const VISTA_NUEVA_PARA_TODOS = true;

/** Una sola regla para el layout, las páginas que redirigen y el proxy. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma se mantiene para quien pasa la cookie
export function usaVistaNueva(demo: boolean, _cookieVista?: string | undefined): boolean {
  return !demo;
}
