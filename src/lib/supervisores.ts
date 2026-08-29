import { createClient } from "@/lib/supabase/server";

export interface Supervisor {
  id: string;
  nombre: string;
  /** Para poder decir de dónde es: «gerencia», «operaciones»… */
  rol: string;
}

/**
 * A quién hay que pedirle el código para corregir una derivación.
 *
 * Sin esta lista, la pantalla le pedía a Central «el código del supervisor» sin
 * decirle de quién (reportado por Darwin el 27-08, el mismo día que se subió el
 * PIN): un candado que no dice dónde está la llave no es un control, es un
 * callejón.
 *
 * LA LISTA LA DA LA BASE, con el mismo criterio con el que valida el código
 * (migración 0117). Antes se armaba acá, filtrando por `rol = 'gerencia'`, y el
 * 28-08 quedó desfasada: desde la 0116 operaciones también dicta el código —el
 * de Lesly funcionó— pero el aviso seguía nombrando solo a gerencia. Una lista
 * que valida una cosa y anuncia otra es peor que no tener lista.
 */
export async function cargarSupervisores(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Supervisor[]> {
  const { data } = await supabase.rpc("supervisores_del_pin");
  return (data as Supervisor[] | null) ?? [];
}
