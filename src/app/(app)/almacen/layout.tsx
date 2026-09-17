import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";

/**
 * El módulo de almacén (0246). Entra la cuenta con la llave `es_almacen`,
 * operaciones (Lesly), gerencia y la cuenta de soporte. Como con postventa,
 * la puerta la decide la marca del perfil, no el rol; y la barrera real es la
 * RLS: sin la llave, las consultas vuelven vacías.
 */
export default async function AlmacenLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();
  const entra = perfil.es_almacen || perfil.es_operaciones || perfil.es_soporte || perfil.rol === "gerencia" || perfil.rol === "admin";
  if (!entra) redirect(perfil.rol === "central" ? "/central" : perfil.es_postventa ? "/postventa/macro" : "/comercial");
  return <>{children}</>;
}
