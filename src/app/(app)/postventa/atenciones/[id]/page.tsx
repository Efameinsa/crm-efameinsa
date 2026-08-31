import Link from "next/link";
import { ArrowLeft, Building2, Clock, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { LineaAtencion } from "@/components/crm/linea-atencion";
import { fechaHoraLima } from "@/lib/fechas";
import {
  ETIQUETA_TIPO_ATENCION,
  PISTA_DE_TIPO,
  relojAtencion,
  type Atencion,
} from "@/lib/atenciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La ficha de una atención técnica.
 *
 * Contesta, en este orden: de quién es y qué máquina, en qué anda, y qué hay
 * que hacer ahora. Nada más — el historial de la máquina ya vive en su ficha de
 * equipo instalado y repetirlo acá solo alarga el scroll.
 */
export default async function AtencionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("atenciones")
    .select(
      "id, cuenta_id, equipo_id, cliente_texto, equipo_texto, tipo, clasificacion, etapa, en_garantia, hizo_preventivo, asignado_a, tecnico, solicitado_at, registrado_at, diagnosticado_at, programada_at, atendido_at, pruebas_at, conformidad_at, cerrado_at, seguimiento_at, conformidad_nombre, informe_servicio_id, resultado, detalle, motivo_cierre, oportunidad_id, cuentas(razon_social, num_doc), perfiles:asignado_a(nombre, codigo_comercial)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return <RegistroNoDisponible volverHref="/postventa/atenciones" volverTexto="Volver a las atenciones" />;
  }

  const a = data as unknown as Atencion & {
    oportunidad_id: string | null;
    cuentas: { razon_social: string; num_doc: string | null } | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  };

  // Lo que el parque instalado ya sabe del equipo: es lo que contesta los dos
  // condicionales del circuito sin preguntarle nada a nadie.
  const { data: g } = a.equipo_id
    ? await supabase.rpc("garantia_del_equipo", { p_equipo: a.equipo_id })
    : { data: null };
  const garantia = (g as {
    en_garantia: boolean;
    garantia_hasta: string | null;
    hizo_preventivo: boolean;
    ultimo_mantenimiento: string | null;
    serie: string | null;
  } | null) ?? null;

  const reloj = relojAtencion(a);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/postventa/atenciones"
              className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Atenciones del área
            </Link>
            <h1 className="text-lg font-bold leading-snug text-foreground">
              {a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Wrench className="size-3.5" />
                {ETIQUETA_TIPO_ATENCION[a.tipo]}
                <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold">
                  pista {PISTA_DE_TIPO[a.tipo]}
                </span>
              </span>
              {a.cuentas?.num_doc && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="size-3.5" /> RUC {a.cuentas.num_doc}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> Entró el {fechaHoraLima(a.solicitado_at)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold",
                reloj.estado === "rojo"
                  ? "bg-destructive/10 text-destructive"
                  : reloj.estado === "ambar"
                    ? "bg-amber-500/10 text-amber-700"
                    : "bg-[#1E7F4F]/10 text-[#1E7F4F]",
              )}
            >
              {a.cerrado_at
                ? "Cerrada"
                : `${Math.floor(reloj.horas)} h de ${reloj.limite} h`}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {a.perfiles ? `La tiene ${a.perfiles.nombre}` : "Todavía no la tomó nadie"}
            </span>
          </div>
        </div>
      </div>

      <SeccionPanel titulo="El circuito">
        <LineaAtencion
          atencion={a}
          garantia={garantia}
          cliente={a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente"}
        />
      </SeccionPanel>

      {a.detalle && (
        <SeccionPanel titulo="Lo que reportó el cliente">
          <p className="whitespace-pre-line text-sm text-foreground">{a.detalle}</p>
        </SeccionPanel>
      )}

      {a.oportunidad_id && (
        <SeccionPanel titulo="La pista comercial">
          <Link
            href={`/comercial/oportunidades/${a.oportunidad_id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver la oportunidad de esta atención
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            Ahí se registran las gestiones y se cotiza lo que haya para vender. La atención técnica y la venta
            corren en paralelo: son dos pistas, no una.
          </p>
        </SeccionPanel>
      )}
    </div>
  );
}
