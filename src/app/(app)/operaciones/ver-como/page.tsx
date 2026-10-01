import { requerirRol } from "@/lib/auth";
import { PanelVerComoOtraCuenta } from "@/components/crm/panel-ver-como";

export const dynamic = "force-dynamic";

/**
 * «Ver como otra cuenta» para operaciones (Santos, 26-09): Lesly supervisa a
 * Central, comerciales, almacén, postventa, Finanzas y Facturación igual que
 * gerencia, en las mismas direcciones ver1…ver9, solo lectura y con registro.
 */
export default async function VerComoOperacionesPage() {
  const yo = await requerirRol(["operaciones", "gerencia", "admin"]);
  return <PanelVerComoOtraCuenta yo={yo} />;
}
