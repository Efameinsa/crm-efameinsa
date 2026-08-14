import { FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AprobarCotizacionBotones } from "@/components/crm/aprobar-cotizacion-botones";

export default async function AprobacionesPage() {
  const supabase = await createClient();
  const { data: cotizaciones } = await supabase
    .from("cotizaciones")
    .select("id, codigo, serie, total, moneda, created_at, oportunidades(cuentas(razon_social), perfiles(nombre))")
    .eq("estado_aprobacion", "pendiente_gerencia")
    .order("created_at", { ascending: true });

  return (
    <SeccionPanel
      titulo="Cotizaciones pendientes de aprobación"
      accion={
        cotizaciones && cotizaciones.length > 0 ? (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {cotizaciones.length} por revisar
          </span>
        ) : undefined
      }
    >
      {!cotizaciones || cotizaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cotizaciones por debajo de lista pendientes.</p>
      ) : (
        <div className="space-y-2">
          {cotizaciones.map((c) => {
            const oportunidad = c.oportunidades as unknown as {
              cuentas: { razon_social: string } | null;
              perfiles: { nombre: string } | null;
            } | null;
            return (
              <div key={c.id} className="rounded-lg border border-border bg-background p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {oportunidad?.cuentas?.razon_social ?? "Cuenta sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{c.codigo}</span> · Serie {c.serie} · De{" "}
                      {oportunidad?.perfiles?.nombre ?? "un comercial"} ·{" "}
                      {new Date(c.created_at).toLocaleDateString("es-PE")}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {c.moneda} {c.total.toLocaleString("es-PE")}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <a
                    href={`/api/cotizaciones/${c.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <FileDown className="size-3.5" />
                    Ver PDF
                  </a>
                  <AprobarCotizacionBotones cotizacionId={c.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SeccionPanel>
  );
}
