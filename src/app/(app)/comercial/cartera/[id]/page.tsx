import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone, Mail, MapPin, FileText, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { PuntoInteres } from "@/components/crm/punto-interes";

export default async function CuentaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select("id, razon_social, tipo_doc, num_doc, direccion, distrito, provincia, departamento, ultima_venta_at, cartera_desde, contactos(id, nombre, cargo, telefono, email, es_principal)")
    .eq("id", id)
    .maybeSingle();

  if (!cuenta) notFound();

  const { data: oportunidades } = await supabase
    .from("oportunidades")
    .select("id, etapa, intencion, monto_estimado, moneda, created_at")
    .eq("cuenta_id", id)
    .order("created_at", { ascending: false });

  const contactos = (cuenta.contactos as unknown as {
    id: string;
    nombre: string;
    cargo: string | null;
    telefono: string | null;
    email: string | null;
    es_principal: boolean;
  }[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
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
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            Cliente desde{" "}
            <span className="font-medium text-foreground">
              {cuenta.cartera_desde ? new Date(cuenta.cartera_desde).toLocaleDateString("es-PE") : "—"}
            </span>
          </span>
          <span>
            Última venta{" "}
            <span className="font-medium text-foreground">
              {cuenta.ultima_venta_at ? new Date(cuenta.ultima_venta_at).toLocaleDateString("es-PE") : "Nunca"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SeccionPanel titulo="Historial de oportunidades">
            {!oportunidades || oportunidades.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin oportunidades registradas para este cliente.</p>
            ) : (
              <div className="space-y-2">
                {oportunidades.map((op) => (
                  <Link
                    key={op.id}
                    href={`/comercial/oportunidades/${op.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <PuntoInteres intencion={op.intencion} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(op.created_at).toLocaleDateString("es-PE")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {op.monto_estimado && (
                        <span className="text-sm font-medium tabular-nums text-foreground">
                          {op.moneda} {op.monto_estimado.toLocaleString("es-PE")}
                        </span>
                      )}
                      <EtapaBadge etapa={op.etapa} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SeccionPanel>
        </div>

        <SeccionPanel titulo={`Contactos (${contactos.length})`}>
          {contactos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin contactos registrados.</p>
          ) : (
            <div className="space-y-3">
              {contactos.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <User className="size-3.5 text-muted-foreground" />
                    {c.nombre}
                    {c.es_principal && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Principal
                      </span>
                    )}
                  </p>
                  {c.cargo && <p className="text-xs text-muted-foreground">{c.cargo}</p>}
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {c.telefono && (
                      <p className="flex items-center gap-1">
                        <Phone className="size-3.5" />
                        {c.telefono}
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-1">
                        <Mail className="size-3.5" />
                        {c.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SeccionPanel>
      </div>
    </div>
  );
}
