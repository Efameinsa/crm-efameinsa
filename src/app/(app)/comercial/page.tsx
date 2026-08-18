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

interface FilaInactiva {
  id: string;
  etapa: string;
  intencion: string;
  motivo_inactividad: string;
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

// Distinto de "Vencidas": esto no viene de una próxima_accion_at que se
// pasó, sino de que Efameinsa lleva desde 2020 tratando "N meses sin
// respuesta" como candidato a Rechazado (docs/08). Nunca cambia el estado
// solo — el botón exige el motivo, igual que un rechazo manual.
function FilaCorrespondeCerrar({ op }: { op: FilaInactiva }) {
  return (
    <Link
      href={`/comercial/oportunidades/${op.id}`}
      className="flex items-center gap-3 rounded-lg border border-l-4 border-border border-l-muted-foreground/40 bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
    >
      <PuntoInteres intencion={op.intencion} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{op.razon_social}</p>
        <p className="truncate text-xs text-muted-foreground">{op.motivo_inactividad}</p>
      </div>
    </Link>
  );
}

function GrupoCorrespondeCerrar({ filas }: { filas: FilaInactiva[] }) {
  if (filas.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Corresponde cerrar
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">{filas.length}</span>
      </h4>
      <div className="space-y-2">
        {filas.map((op) => (
          <FilaCorrespondeCerrar key={op.id} op={op} />
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

  // Distinta de "Vencidas": no depende de proxima_accion_at, sino de los
  // umbrales del manual de Efameinsa (1 mes prospecto / 3 meses cotización,
  // ver migración 0018). Puede haber candidatos acá aunque "Mi día" esté
  // vacío arriba, así que se consulta y se muestra aparte.
  const { data: inactivasData } = await supabase
    .from("v_oportunidades_inactivas")
    .select("id, etapa, intencion, motivo_inactividad, cuentas(razon_social)")
    .eq("comercial_id", perfil.id);

  const inactivas: FilaInactiva[] = (inactivasData ?? []).map((op) => ({
    id: op.id,
    etapa: op.etapa,
    intencion: op.intencion,
    motivo_inactividad: op.motivo_inactividad,
    razon_social: (op.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cuenta sin nombre",
  }));

  return (
    <div className="space-y-5">
      <CalloutActivarNotificaciones />

      <Card>
        <CardHeader>
          <CardTitle>Mi día</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {oportunidades.length === 0 && inactivas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tiene acciones pendientes para hoy.</p>
          ) : (
            <>
              <Grupo titulo="Vencidas" filas={vencidas} urgencia="vencida" />
              <Grupo titulo="Para hoy" filas={paraHoy} urgencia="hoy" />
              <Grupo titulo="Recién asignadas" filas={nuevas} urgencia="nueva" />
              <GrupoCorrespondeCerrar filas={inactivas} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
