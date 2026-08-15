import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TablaCartera } from "@/components/crm/tabla-cartera";

export default async function CarteraPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data: cuentas } = await supabase
    .from("cuentas")
    .select("id, razon_social, tipo_doc, num_doc, distrito, ultima_venta_at, contactos(id), oportunidades(etapa)")
    .eq("comercial_id", perfil.id)
    .order("razon_social");

  return (
    <SeccionPanel
      titulo="Mi cartera"
      accion={
        cuentas && cuentas.length > 0 ? (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {cuentas.length} cliente{cuentas.length === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
    >
      {!cuentas || cuentas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no tiene clientes en su cartera.</p>
      ) : (
        <TablaCartera
          filas={cuentas.map((c) => {
            const contactos = (c.contactos as unknown as { id: string }[]) ?? [];
            const oportunidades = (c.oportunidades as unknown as { etapa: string }[]) ?? [];
            const activas = oportunidades.filter((o) => !["venta", "rechazada", "derivada"].includes(o.etapa)).length;
            return {
              id: c.id,
              razonSocial: c.razon_social,
              documento: c.tipo_doc !== "SIN_DOC" ? `${c.tipo_doc}: ${c.num_doc}` : "—",
              distrito: c.distrito,
              contactos: contactos.length,
              oportunidadesTotal: oportunidades.length,
              oportunidadesActivas: activas,
              ultimaVentaAt: c.ultima_venta_at,
            };
          })}
        />
      )}
    </SeccionPanel>
  );
}
