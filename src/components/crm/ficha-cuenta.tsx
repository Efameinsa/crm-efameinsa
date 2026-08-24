import { fechaLima } from "@/lib/fechas";
import { notFound } from "next/navigation";
import { MapPin, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ResumenCuenta } from "@/components/crm/resumen-cuenta";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { GrupoEconomico } from "@/components/crm/grupo-economico";
import { AccionNuevoInforme, ListaInformesCierre, TablaComprasAnteriores, ListaContactos } from "@/components/crm/secciones-cliente";
import { Badge } from "@/components/ui/badge";

export async function FichaCuenta({ cuentaId, comoGerencia = false }: { cuentaId: string; comoGerencia?: boolean }) {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select(
      "id, razon_social, tipo_doc, num_doc, direccion, distrito, provincia, departamento, ultima_venta_at, cartera_desde, comercial_id, notas, perfiles(nombre, codigo_comercial), contactos(id, nombre, cargo, telefono, email, es_principal)",
    )
    .eq("id", cuentaId)
    .maybeSingle();

  if (!cuenta) notFound();

  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const contactos =
    (cuenta.contactos as unknown as {
      id: string;
      nombre: string;
      cargo: string | null;
      telefono: string | null;
      email: string | null;
      es_principal: boolean;
    }[]) ?? [];

  const { eventos, ventasConDetalle } = await cargarHistorialCuenta(supabase, cuentaId);

  // Informes de cierre de este cliente. Los ve el comercial de la cartera,
  // gerencia y Central (política de la migración 0049).
  const { data: informes } = await supabase
    .from("informes_cierre")
    .select("id, codigo, serie, fecha, monto_total, moneda, emitido_at")
    .eq("cuenta_id", cuentaId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{cuenta.razon_social}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {cuenta.tipo_doc !== "SIN_DOC" && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {cuenta.tipo_doc}: {cuenta.num_doc}
                </span>
              )}
              {cuenta.direccion && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {cuenta.direccion}
                </span>
              )}
            </div>
          </div>
          {comoGerencia && (
            <Badge>Cartera de: {dueno?.nombre ?? "Sin asignar"}{dueno?.codigo_comercial ? ` (${dueno.codigo_comercial})` : ""}</Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            Cliente desde{" "}
            <span className="font-medium text-foreground">
              {fechaLima(cuenta.cartera_desde)}
            </span>
          </span>
          <span>
            Última venta{" "}
            <span className="font-medium text-foreground">
              {cuenta.ultima_venta_at ? fechaLima(cuenta.ultima_venta_at) : "Nunca"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ResumenCuenta cuentaId={cuenta.id} notasIniciales={cuenta.notas} />

          <GrupoEconomico cuentaId={cuenta.id} comoGerencia={comoGerencia} />

          {/* Informes de cierre: el documento que recibe Central para facturar,
              cobrar y despachar. Va junto a las compras porque es el paso
              siguiente de la misma historia: se cerro la venta, ahora hay que
              ejecutarla. El contenido vive en secciones-cliente.tsx, compartido
              con la ficha de oportunidad (C5 del plan 11). */}
          <SeccionPanel titulo="Informes de cierre" accion={<AccionNuevoInforme cuentaId={cuenta.id} />}>
            <ListaInformesCierre informes={informes ?? []} />
          </SeccionPanel>

          {ventasConDetalle.length > 0 && (
            <SeccionPanel titulo="Compras anteriores">
              <TablaComprasAnteriores ventas={ventasConDetalle} />
            </SeccionPanel>
          )}

          <SeccionPanel titulo="Historial del cliente">
            <HistorialCuenta eventos={eventos} />
          </SeccionPanel>
        </div>

        <SeccionPanel titulo={`Contactos (${contactos.length})`}>
          <ListaContactos contactos={contactos} />
        </SeccionPanel>
      </div>
    </div>
  );
}
