/**
 * ¿El token es inválido, o simplemente no se pudo preguntar?
 *
 * getUser() devuelve usuario nulo en dos casos que no son lo mismo: el token
 * ya no vale, o no hubo forma de verificarlo (un tropiezo de red, Supabase
 * lento, un límite de tasa). Hasta el 07-09 el CRM trataba los dos igual y
 * mandaba al login, así que un parpadeo de conexión se veía —y se sentía—
 * como un cierre de sesión.
 *
 * Solo lo primero justifica sacar a alguien de su sesión. Vive en su propio
 * archivo porque lo usan el proxy (que corre en el borde) y el servidor, y el
 * proxy no puede arrastrar las dependencias de `auth.ts`.
 */
export function esFalloDeAutenticacion(error: {
  status?: number;
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.status === 401 || error.status === 403) return true;
  const senal = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    senal.includes("session_not_found") ||
    senal.includes("invalid claim") ||
    senal.includes("jwt") ||
    senal.includes("refresh_token_not_found") ||
    senal.includes("session missing")
  );
}
