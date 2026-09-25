import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";

/**
 * Facturación (0306, reunión 25-09 11:44). Entra la cuenta de Facturación y,
 * para acompañarla, Finanzas y gerencia. La barrera real es la RLS: sin el
 * rol, el expediente vuelve vacío.
 */
export default async function FacturacionLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();
  const entra = ["facturacion", "finanzas", "gerencia", "admin"].includes(perfil.rol);
  if (!entra) redirect(perfil.rol === "central" ? "/central" : perfil.es_postventa ? "/postventa/macro" : "/comercial");
  return <>{children}</>;
}
