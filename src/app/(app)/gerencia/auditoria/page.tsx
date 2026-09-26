import { requerirRol } from "@/lib/auth";
import { PanelVerComoOtraCuenta } from "@/components/crm/panel-ver-como";

export const dynamic = "force-dynamic";

/** Auditoría de cuentas (0160). El panel es el mismo que usa operaciones (26-09). */
export default async function AuditoriaPage() {
  const yo = await requerirRol(["gerencia", "admin"]);
  return <PanelVerComoOtraCuenta yo={yo} />;
}
