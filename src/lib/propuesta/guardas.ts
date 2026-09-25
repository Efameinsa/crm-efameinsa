import { redirect } from "next/navigation";
import type { Perfil } from "@/types/database";

/**
 * Quién abre las fichas nuevas (auditoría 25-09). Va en el layout Y al inicio
 * de la página: en Next el layout no frena la página, que se arma en paralelo
 * (ver la nota «el guardián del layout no frena la página»).
 */
export function guardaFichaPedido(perfil: Perfil) {
  if (!perfil.es_postventa && !perfil.es_soporte && !perfil.es_almacen && perfil.rol !== "gerencia" && perfil.rol !== "admin") redirect("/nuevo");
  if (perfil.solo_preventivo && perfil.rol !== "gerencia" && perfil.rol !== "admin" && !perfil.es_soporte) redirect("/comercial/ruta");
}

export function guardaFichaCliente(perfil: Perfil) {
  if (!["comercial", "gerencia", "admin", "operaciones"].includes(perfil.rol)) redirect(perfil.rol === "central" ? "/central/clientes" : "/nuevo");
}
