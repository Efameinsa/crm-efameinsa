// Debe reproducir exactamente normalizar_telefono() de
// supabase/migrations/0001_esquema_inicial.sql — se usa para que la búsqueda
// de duplicados en el cliente/servidor coincida con la columna generada
// `telefono_normalizado` de la base de datos.
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length > 9 && digitos.startsWith("51")) {
    return digitos.slice(2);
  }
  return digitos;
}
