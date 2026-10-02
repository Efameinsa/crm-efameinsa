/**
 * ¿SE RASTREA A ESTA PERSONA CUANDO USA LA APP DE ANDROID?
 *
 * Santos (02-10-2026): «¿no se puede rastrear todas las cuentas que instalen la apk?». Sí: por regla de
 * gerencia el celular es de la empresa y el GPS va 24/7, así que no hay que marcar a nadie.
 *
 *   1. `rastreo_excluido`  → NO. Gerencia la dejó fuera; gana sobre todo lo demás.
 *   2. `trabajo_de_campo`  → SÍ. Marcada a mano (el piloto de la 0363); también las de práctica, para probar.
 *   3. cuenta de práctica / demostración (`es_prueba`) → NO: no es una persona con un celular.
 *   4. gerencia y administración → NO por defecto: son quienes deciden el rastreo y pueden usar la app en
 *      un celular personal. Se rastrean solo si se las marca a mano (punto 2). Santos aún no decidió esto
 *      (02-10-2026): hasta que lo haga, lo prudente es no rastrear a los directivos sin que lo pidan.
 *   5. cualquier otra cuenta → SÍ.
 *
 * Las sesiones de auditoría no pasan por acá: el layout las deja fuera antes.
 * Siempre con la aceptación escrita de la persona (0368): sin ella la app no rastrea.
 */
export interface PerfilRastreable {
  trabajo_de_campo?: boolean | null;
  es_prueba?: boolean | null;
  rastreo_excluido?: boolean | null;
  rol?: string | null;
}

export function seRastrea(p: PerfilRastreable): boolean {
  if (p.rastreo_excluido) return false;
  if (p.trabajo_de_campo) return true;
  if (p.es_prueba) return false;
  return p.rol !== "gerencia" && p.rol !== "admin";
}
