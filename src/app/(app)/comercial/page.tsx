import Link from "next/link";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { CalloutActivarNotificaciones } from "@/components/crm/callout-activar-notificaciones";
import { cn } from "@/lib/utils";

interface FilaMiDia {
  id: string;
  etapa: string;
  intencion: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  razon_social: string;
}

function Fila({ op, urgencia }: { op: FilaMiDia; urgencia: "vencida" | "hoy" | "nueva" }) {
  return (
    <Link
      href={`/comercial/oportunidades/${op.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
        "border-l-4",
        urgencia === "vencida" && "border-l-destructive",
        urgencia === "hoy" && "border-l-primary",
        urgencia === "nueva" && "border-l-amber-500",
      )}
    >
      <PuntoInteres intencion={op.intencion} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{op.razon_social}</p>
        <p className="truncate text-xs text-muted-foreground">
          {op.proxima_accion ?? (urgencia === "nueva" ? "Primer contacto pendiente" : "Sin acción definida")}
        </p>
      </div>
      {urgencia === "vencida" && (
        <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
          Vencida
        </span>
      )}
      {urgencia === "nueva" && (
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Nuevo
        </span>
      )}
    </Link>
  );
}

function Grupo({ titulo, filas, urgencia }: { titulo: string; filas: FilaMiDia[]; urgencia: "vencida" | "hoy" | "nueva" }) {
  if (filas.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">{filas.length}</span>
      </h4>
      <div className="space-y-2">
        {filas.map((op) => (
          <Fila key={op.id} op={op} urgencia={urgencia} />
        ))}
      </div>
    </div>
  );
}

export default async function ComercialPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("oportunidades")
    .select("id, etapa, intencion, proxima_accion, proxima_accion_at, cuentas(razon_social)")
    .eq("comercial_id", perfil.id)
    .not("etapa", "in", "(venta,rechazada,derivada)")
    .or(`etapa.eq.asignada,proxima_accion_at.lte.${hoy}`)
    .order("proxima_accion_at", { ascending: true, nullsFirst: true });

  const oportunidades: FilaMiDia[] = (data ?? []).map((op) => ({
    id: op.id,
    etapa: op.etapa,
    intencion: op.intencion,
    proxima_accion: op.proxima_accion,
    proxima_accion_at: op.proxima_accion_at,
    razon_social: (op.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cuenta sin nombre",
  }));

  const vencidas = oportunidades.filter((o) => o.proxima_accion_at && o.proxima_accion_at < hoy);
  const nuevas = oportunidades.filter((o) => o.etapa === "asignada" && !o.proxima_accion_at);
  const paraHoy = oportunidades.filter((o) => !vencidas.includes(o) && !nuevas.includes(o));

  return (
    <div className="space-y-5">
      <CalloutActivarNotificaciones />

      <Card>
        <CardHeader>
          <CardTitle>Mi día</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {oportunidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tiene acciones pendientes para hoy.</p>
          ) : (
            <>
              <Grupo titulo="Vencidas" filas={vencidas} urgencia="vencida" />
              <Grupo titulo="Para hoy" filas={paraHoy} urgencia="hoy" />
              <Grupo titulo="Recién asignadas" filas={nuevas} urgencia="nueva" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
