import { createClient } from "@/lib/supabase/server";

export interface Supervisor {
  id: string;
  nombre: string;
}

/**
 * A quién hay que pedirle el código para corregir una derivación.
 *
 * Sin esta lista, la pantalla le pedía a Central «el código del supervisor» sin
 * decirle de quién (reportado por Darwin el 27-08, el mismo día que se subió el
 * PIN): un candado que no dice dónde está la llave no es un control, es un
 * callejón. Ahora los nombres salen al lado del campo.
 *
 * Solo `gerencia`: el código de `admin` también sirve —es la salida de
 * emergencia si gerencia no está— pero no es a quien Central tiene que llamar,
 * así que no se ofrece.
 */
export async function cargarSupervisores(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Supervisor[]> {
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre")
    .eq("rol", "gerencia")
    .eq("activo", true)
    .order("nombre");
  return data ?? [];
}
