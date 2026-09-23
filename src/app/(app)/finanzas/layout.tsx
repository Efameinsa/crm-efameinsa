import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";

/**
 * Finanzas (0279). Entra la cuenta de Finanzas, y para acompañarla gerencia,
 * admin y operaciones. La barrera real es la RLS: sin el rol, las consultas
 * de pagos vuelven vacías.
 */
export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();
  const entra = perfil.rol === "finanzas" || perfil.rol === "gerencia" || perfil.rol === "admin" || perfil.es_operaciones;
  if (!entra) redirect(perfil.rol === "central" ? "/central" : perfil.es_postventa ? "/postventa/macro" : "/comercial");
  return <>{children}</>;
}
