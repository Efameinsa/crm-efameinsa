import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";
import {
  ETAPAS_ATENCION,
  ETIQUETA_ETAPA,
  ETIQUETA_TIPO_ATENCION,
  ETIQUETA_CLASIFICACION,
  COLOR_CLASIFICACION,
  pasoDe,
  queLeFalta,
  relojAtencion,
  resumirAtenciones,
  type Atencion,
} from "@/lib/atenciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Las atenciones técnicas del ÁREA.
 *
 * DEL ÁREA, no «las mías». Postventa no es una cartera personal como la de un
 * comercial: es un equipo que atiende casos. Lo dejó claro la 0080 —«atender
 * una garantía no te hace el vendedor del cliente»— y lo volvió a pedir Lesly el
 * 31-08, al decidir que un asistente trabaje en paralelo «pero con la misma
 * información». Así que acá se ve todo, con la marca de quién lo tiene.
 *
 * ARRIBA LO QUE APREMIA. La primera pregunta del área no es «cuántas hay» sino
 * «a cuál tengo que ir corriendo»: por eso lo primero es la fila de las que se
 * pasaron de tiempo, y recién después el resto por etapa.
 */

const FILTROS = [
  { clave: "", etiqueta: "Abiertas" },
  { clave: "urgentes", etiqueta: "Se pasaron de tiempo" },
  { clave: "sin_programar", etiqueta: "Sin programar" },
  { clave: "cerradas", etiqueta: "Cerradas" },
] as const;

export default async function AtencionesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; etapa?: string }>;
}) {
  const sp = await searchParams;
  const filtro = sp.filtro ?? "";
  const supabase = await createClient();

  const { data } = await supabase
    .from("atenciones")
    .select(
      "id, cuenta_id, equipo_id, cliente_texto, equipo_texto, tipo, clasificacion, etapa, en_garantia, hizo_preventivo, asignado_a, tecnico, solicitado_at, registrado_at, diagnosticado_at, programada_at, atendido_at, pruebas_at, conformidad_at, cerrado_at, seguimiento_at, conformidad_nombre, informe_servicio_id, resultado, detalle, motivo_cierre, cuentas(razon_social), perfiles:asignado_a(nombre, codigo_comercial)",
    )
    .order("solicitado_at", { ascending: false })
    .limit(300);

  type Fila = Atencion & {
    cuentas: { razon_social: string } | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  };
  const todas = (data ?? []) as unknown as Fila[];
  const resumen = resumirAtenciones(todas);

  const abiertas = todas.filter((a) => !a.cerrado_at);
  let filas: Fila[] = abiertas;
  if (filtro === "urgentes") filas = abiertas.filter((a) => relojAtencion(a).estado === "rojo");
  if (filtro === "sin_programar") filas = abiertas.filter((a) => !a.programada_at);
  if (filtro === "cerradas") filas = todas.filter((a) => a.cerrado_at);
  if (sp.etapa) filas = filas.filter((a) => a.etapa === sp.etapa);

  const enRojo = abiertas.filter((a) => relojAtencion(a).estado === "rojo").length;

  return (
    <div className="space-y-4">
      {/* Los cuatro números del cierre semanal, siempre a la vista: es lo que
          el ing. Carlos pidió que el área pueda contestar sin buscar —«has
          recibido 20 problemas, cuántos atendidos, cuántos en proceso, cuántos
          cerrados»—. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tarjeta etiqueta="Recibidas" valor={resumen.recibidas} />
        <Tarjeta etiqueta="Atendidas" valor={resumen.atendidas} />
        <Tarjeta etiqueta="En proceso" valor={resumen.enProceso} alerta={enRojo > 0} />
        <Tarjeta etiqueta="Cerradas" valor={resumen.cerradas} bien />
      </div>

      <SeccionPanel
        titulo="Atenciones del área"
        accion={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/postventa/casos/nuevo"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:brightness-110"
            >
              <Plus className="size-3.5" /> Registrar atención
            </Link>
            {FILTROS.map((f) => (
              <Link
                key={f.clave || "todas"}
                href={`/postventa/atenciones${f.clave ? `?filtro=${f.clave}` : ""}`}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                  filtro === f.clave ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {f.etiqueta}
                {f.clave === "urgentes" && enRojo > 0 && ` (${enRojo})`}
              </Link>
            ))}
          </div>
        }
      >
        {/* El embudo de las nueve etapas, clicable: dice de un vistazo dónde se
            está atascando el trabajo. */}
        <div className="mb-3 flex flex-wrap gap-1">
          {ETAPAS_ATENCION.map((e) => {
            const n = abiertas.filter((a) => a.etapa === e).length;
            return (
              <Link
                key={e}
                href={`/postventa/atenciones?${new URLSearchParams({ ...(filtro ? { filtro } : {}), ...(sp.etapa === e ? {} : { etapa: e }) })}`}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  sp.etapa === e ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  n === 0 && "opacity-45",
                )}
              >
                {ETIQUETA_ETAPA[e]} <b className="tabular-nums">{n}</b>
              </Link>
            );
          })}
        </div>

        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay atenciones acá. Las que registre el área o derive Central aparecen en esta lista.
          </p>
        ) : (
          <div className="space-y-1.5">
            {filas.map((a) => {
              const falta = queLeFalta(a);
              const reloj = relojAtencion(a);
              return (
                <Link
                  key={a.id}
                  href={`/postventa/atenciones/${a.id}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5 transition-colors hover:bg-accent",
                    reloj.estado === "rojo" && !a.cerrado_at
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border",
                    a.cerrado_at && "opacity-70",
                  )}
                >
                  <span className="w-24 flex-none text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {ETIQUETA_ETAPA[a.etapa]}
                    <span className="ml-1 font-normal tabular-nums opacity-70">{pasoDe(a.etapa) + 1}/9</span>
                  </span>
                  <span className="min-w-[180px] flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {ETIQUETA_TIPO_ATENCION[a.tipo]}
                      {a.detalle ? ` · ${a.detalle}` : ""}
                    </span>
                  </span>
                  {a.clasificacion && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", COLOR_CLASIFICACION[a.clasificacion])}>
                      {ETIQUETA_CLASIFICACION[a.clasificacion]}
                    </span>
                  )}
                  {a.programada_at && !a.cerrado_at && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {fechaHoraLima(a.programada_at)}
                      {a.tecnico && ` · ${a.tecnico}`}
                    </span>
                  )}
                  {!a.cerrado_at && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        falta.urgente || reloj.estado === "rojo"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {(falta.urgente || reloj.estado === "rojo") && <AlertTriangle className="size-3" />}
                      {falta.texto}
                    </span>
                  )}
                  <span className="w-20 flex-none text-right text-[11px] text-muted-foreground">
                    {a.perfiles?.codigo_comercial ?? a.perfiles?.nombre ?? "sin tomar"}
                  </span>
                  <ChevronRight className="size-3.5 flex-none text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}

function Tarjeta({ etiqueta, valor, alerta, bien }: { etiqueta: string; valor: number; alerta?: boolean; bien?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p
        className={cn(
          "mt-0.5 text-2xl font-bold tabular-nums",
          alerta ? "text-destructive" : bien ? "text-[#1E7F4F]" : "text-foreground",
        )}
      >
        {valor}
      </p>
    </div>
  );
}
