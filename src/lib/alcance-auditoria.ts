/**
 * QUIÉN PUEDE «ENTRAR COMO» QUIÉN (0160 y 26-09).
 *
 * Gerencia y admin: cualquier cuenta. Operaciones (Lesly, Santos 26-09: «así
 * como el gerente tiene una vista para supervisar otras cuentas, Lesly
 * también debe poder, pero de las cuentas de central, comercial, almacén,
 * contabilidad y finanzas»): Central, las cuentas comerciales —ahí están
 * también almacén y postventa—, Finanzas y Facturación. Nunca gerencia, admin
 * ni otra cuenta de operaciones. La misma regla la aplica la pantalla (qué
 * cuentas lista) y el servidor (a quién abre la sesión).
 */
export const ROLES_QUE_AUDITAN = ["gerencia", "admin", "operaciones"] as const;

const AUDITABLES_POR_OPERACIONES = ["central", "comercial", "finanzas", "facturacion"];

export function puedeAuditar(
  yo: { id: string; rol: string },
  cuenta: { id: string; rol: string; es_operaciones?: boolean | null },
): boolean {
  if (cuenta.id === yo.id) return false;
  if (yo.rol === "gerencia" || yo.rol === "admin") return true;
  if (yo.rol === "operaciones") return AUDITABLES_POR_OPERACIONES.includes(cuenta.rol) && !cuenta.es_operaciones;
  return false;
}
