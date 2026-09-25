// Sin dependencias de servidor: lo usan el layout, las páginas y el proxy.

/**
 * LA VISTA NUEVA PARA TODOS (gerencia la aprobó el 25-09).
 *
 * Mientras esto está en `false`, la vista nueva la ven las cuentas _test y
 * cualquier cuenta oficial que la active desde su menú (cookie «nueva»): así
 * se prueba con cuentas reales antes del cambio. El día del cambio se pone en
 * `true` y pasa a ser la de todos; quien necesite la anterior la elige con
 * «Vista anterior» (cookie «actual») durante la transición.
 */
export const VISTA_NUEVA_PARA_TODOS = false;

/** Una sola regla para el layout, las páginas que redirigen y el proxy. */
export function usaVistaNueva(demo: boolean, cookieVista: string | undefined): boolean {
  if (demo) return cookieVista !== "actual";
  return VISTA_NUEVA_PARA_TODOS ? cookieVista !== "actual" : cookieVista === "nueva";
}
