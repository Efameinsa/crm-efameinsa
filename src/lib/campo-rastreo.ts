/**
 * ¿SE RASTREA A ESTA PERSONA CUANDO USA LA APP DE ANDROID?
 *
 * Santos (02-10-2026): «¿no se puede rastrear todas las cuentas que instalen la apk?». Sí: por regla de
 * gerencia el celular es de la empresa y el GPS va 24/7, así que no hay que marcar a nadie.
 *
 *   1. `rastreo_excluido`  → NO. Gerencia la dejó fuera; gana sobre todo lo demás.
 *   2. `trabajo_de_campo`  → SÍ. Marcada a mano (el piloto de la 0363); también las de práctica, para probar.
 *   3. cuenta de práctica / demostración (`es_prueba`) → NO: no es una persona con un celular.
 *   4. cualquier otra cuenta → SÍ.
 *
 * Las sesiones de auditoría no pasan por acá: el layout las deja fuera antes.
 * Siempre con la aceptación escrita de la persona (0368): sin ella la app no rastrea.
 */
export interface PerfilRastreable {
  trabajo_de_campo?: boolean | null;
  es_prueba?: boolean | null;
  rastreo_excluido?: boolean | null;
}

export function seRastrea(p: PerfilRastreable): boolean {
  if (p.rastreo_excluido) return false;
  if (p.trabajo_de_campo) return true;
  return !p.es_prueba;
}
