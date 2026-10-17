import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { TecnicoEnCamino } from "@/components/crm/tecnico-en-camino";

/**
 * Carga las dos marcas del técnico (0527) por su cuenta, para que la página
 * del pedido o del caso no dependa de que la migración ya esté aplicada: si
 * las columnas todavía no existen, el panel no aparece y nada más cambia.
 */
export async function TecnicoEnCaminoPanel({ donde, id }: { donde: "pedido" | "caso"; id: string }) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(donde === "pedido" ? "servicios_postventa" : "atenciones")
    .select("tecnico_salio_at, tecnico_salio_por, tecnico_llego_at, tecnico_llego_por, cerrado_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const fila = data as {
    tecnico_salio_at: string | null;
    tecnico_salio_por: string | null;
    tecnico_llego_at: string | null;
    tecnico_llego_por: string | null;
    cerrado_at: string | null;
  };
  const ids = [fila.tecnico_salio_por, fila.tecnico_llego_por].filter((x): x is string => Boolean(x));
  const { data: personas } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = (pid: string | null) => (pid ? ((personas ?? []) as { id: string; nombre: string }[]).find((p) => p.id === pid)?.nombre ?? null : null);

  const puede =
    (Boolean(perfil.es_postventa) && !perfil.solo_preventivo) ||
    Boolean(perfil.es_almacen) ||
    Boolean(perfil.es_operaciones) ||
    ["gerencia", "admin", "operaciones"].includes(perfil.rol);

  return (
    <TecnicoEnCamino
      donde={donde}
      id={id}
      salio={{ at: fila.tecnico_salio_at, quien: nombre(fila.tecnico_salio_por) }}
      llego={{ at: fila.tecnico_llego_at, quien: nombre(fila.tecnico_llego_por) }}
      puede={puede}
      cerrado={Boolean(fila.cerrado_at)}
    />
  );
}
