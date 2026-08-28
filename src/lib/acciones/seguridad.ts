"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * El código de autorización que el supervisor tiene en pantalla ahora mismo.
 *
 * Lo calcula la BASE, no el navegador (migración 0092): así no hay dos relojes
 * que puedan desfasarse entre quien lo dicta y quien lo valida, y la semilla
 * con la que se deriva no sale nunca del servidor.
 *
 * `expiraEn` son los segundos que le quedan a la ventana de diez minutos (0110).
 * Sirve
 * para el relojito: es el mismo dato con el que la base va a validar, así que
 * lo que se ve en pantalla y lo que se acepta no pueden discrepar.
 */
export async function obtenerPinSupervisor(): Promise<{
  error: string | null;
  codigo?: string;
  expiraEn?: number;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mi_pin_supervisor");
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  const fila = (data as { codigo: string; expira_en: number }[] | null)?.[0];
  if (!fila) return { error: "No se pudo generar el código" };

  return { error: null, codigo: fila.codigo, expiraEn: fila.expira_en };
}

/**
 * ¿Hoy se puede corregir una derivación sin código?
 *
 * Gerencia puede levantar el PIN por un rato —el 28-08 lo hizo por el día,
 * migración 0111— y el permiso vive en la base con su fecha de vencimiento. La
 * pantalla pregunta para no exigir un código que el servidor ya no va a mirar:
 * si el campo siguiera siendo obligatorio, el permiso no serviría de nada.
 */
export async function permisoSinPin(): Promise<{ hasta: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pin_libre_hasta");
  return { hasta: (data as string | null) ?? null };
}
