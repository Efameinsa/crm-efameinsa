import type { createClient } from "@/lib/supabase/server";
import type { RubroFiltro } from "@/lib/reportes";
import type { OpcionRubro, ValorRubro } from "@/components/crm/filtro-rubro";
import type { Perfil } from "@/types/database";

// Filtro por rubro de la cartera (pedido del ing. Carlos, 01-09: «como no
// tengo en mi cabeza mis 500 clientes… necesito filtrar. Hoy me voy a centrar
// en mineras… la diferencia entre 35 prospectos por día y 100»).
//
// El filtro en sí lo aplican listar_oportunidades(), contar_oportunidades_
// por_etapa() y listar_clientes() con su parámetro `p_rubro` (0152). Acá
// queda solo lo que rodea al desplegable: leer `?rubro=` de la URL, pasarlo a
// las funciones, y contar cuántos clientes tiene la cartera en cada rubro.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Lee el `?rubro=` de la URL: un id del catálogo o «sin» (cuentas sin rubro). */
export function leerFiltroRubro(valor: string | undefined): ValorRubro | null {
  if (!valor) return null;
  if (valor === "sin") return "sin";
  const n = parseInt(valor, 10);
  return Number.isInteger(n) && n > 0 && String(n) === valor ? n : null;
}

/** Lo que espera `p_rubro`: el id como texto, «sin», o null si no hay filtro. */
export function rubroParaRpc(valor: ValorRubro | null): RubroFiltro {
  return valor === null ? null : String(valor);
}

/** Misma regla que listar_oportunidades()/listar_clientes(): backoffice y
 *  central ven todo; cualquier otro perfil, solo lo suyo. Acota los conteos
 *  del desplegable a la cartera de quien mira. */
export function alcanceDe(perfil: Pick<Perfil, "id" | "rol">): string | null {
  return perfil.rol === "gerencia" || perfil.rol === "admin" || perfil.rol === "central" ? null : perfil.id;
}

/** Los rubros activos del catálogo con cuántos clientes tiene cada uno en la
 *  cartera de quien mira, más cuántos quedan sin rubro. Al 01-09 solo el 30 %
 *  de las cuentas tiene rubro: el número de «sin rubro» es a propósito, para
 *  que se vea el trabajo que falta y no parezca que «no hay mineras». */
export async function cargarOpcionesRubro(
  supabase: Supabase,
  comercialId: string | null,
): Promise<{ opciones: OpcionRubro[]; sinRubro: number }> {
  const { data, error } = await supabase.from("catalogo_rubros").select("id, nombre").eq("activo", true).order("nombre");
  if (error) console.error("catalogo_rubros:", error.message);
  const rubros = (data ?? []) as { id: number; nombre: string }[];
  // Antes: una consulta de conteo POR RUBRO (nueve idas y vueltas por carga);
  // «Mi cartera» era la pantalla más lenta del CRM por esto (Santos, 02-09,
  // «pequeños tirones»). Ahora, un solo viaje (0161).
  const { data: conteosData, error: errorConteos } = await supabase.rpc("cuentas_por_rubro", { p_comercial: comercialId });
  if (errorConteos) console.error("cuentas_por_rubro:", errorConteos.message);
  const porRubro = new Map<number | null, number>();
  for (const f of (conteosData ?? []) as { rubro_id: number | null; n: number }[]) porRubro.set(f.rubro_id, Number(f.n));
  return {
    opciones: rubros.map((r) => ({ id: r.id, nombre: r.nombre, clientes: porRubro.get(r.id) ?? 0 })),
    sinRubro: porRubro.get(null) ?? 0,
  };
}
