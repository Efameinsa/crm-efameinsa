import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";
import { puedeVerPrecios } from "@/lib/postventa";
import { CasosAnteriores } from "@/components/crm/casos-anteriores";
import { ColaDespachos } from "@/components/crm/cola-despachos";
import { HistoricoPostventa } from "@/components/crm/historico-postventa";
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
 * Atenciones: la puerta única al trabajo técnico y a sus dos colas vecinas.
 *
 * Plan 23 (31-08): «Casos», la «Lista» del calendario y el historial de
 * informes eran cuatro puertas al mismo tipo de trabajo con nombres
 * distintos. Acá se juntan como pestañas de UNA pantalla — sin migrar una
 * sola fila (la pista de nueve etapas es `atenciones`, los casos viejos
 * siguen siendo `oportunidades`, los despachos siguen siendo
 * `servicios_postventa`): es la puerta la que se unifica, no el dato.
 */

const PESTANAS = [
  { clave: "", etiqueta: "Abiertas" },
  { clave: "casos", etiqueta: "Casos anteriores" },
  { clave: "despachos", etiqueta: "Despachos" },
  { clave: "cerradas", etiqueta: "Cerradas" },
  { clave: "historico", etiqueta: "Histórico" },
] as const;

type Pestana = (typeof PESTANAS)[number]["clave"];

const FILTROS = [
  { clave: "", etiqueta: "Todas" },
  { clave: "urgentes", etiqueta: "Se pasaron de tiempo" },
  { clave: "sin_programar", etiqueta: "Sin programar" },
] as const;

export default async function AtencionesPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; filtro?: string; etapa?: string; q?: string; estado?: string }>;
}) {
  const sp = await searchParams;
  const pestana: Pestana = (PESTANAS.find((p) => p.clave === (sp.ver ?? "")) ?? PESTANAS[0]).clave;
  const filtro = sp.filtro ?? "";
  const perfil = await requerirPerfil();
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
            <Pestanas pestana={pestana} enRojo={enRojo} />
          </div>
        }
      >
        {(pestana === "" || pestana === "cerradas") && (
          <VistaAtenciones
            todas={pestana === "cerradas" ? todas.filter((a) => a.cerrado_at) : abiertas}
            cerradas={pestana === "cerradas"}
            filtro={filtro}
            etapaSeleccionada={sp.etapa}
          />
        )}
        {pestana === "casos" && <CasosAnteriores perfil={perfil} />}
        {pestana === "despachos" && (
          <ColaDespachos
            pestana="lista"
            verValue="despachos"
            busqueda={(sp.q ?? "").trim()}
            estado={sp.estado ?? ""}
            verPrecios={puedeVerPrecios(perfil)}
            hrefBase="/postventa/atenciones"
          />
        )}
        {pestana === "historico" && (
          <div className="space-y-6">
            <HistoricoPostventa />
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Despachos del Excel
              </h3>
              <ColaDespachos
                pestana="historico"
                verValue="historico"
                busqueda={(sp.q ?? "").trim()}
                estado={sp.estado ?? ""}
                verPrecios={puedeVerPrecios(perfil)}
                hrefBase="/postventa/atenciones"
              />
            </section>
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Despachos completados
              </h3>
              <ColaDespachos
                pestana="completados"
                verValue="historico"
                busqueda={(sp.q ?? "").trim()}
                estado={sp.estado ?? ""}
                verPrecios={puedeVerPrecios(perfil)}
                hrefBase="/postventa/atenciones"
              />
            </section>
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}

function Pestanas({ pestana, enRojo }: { pestana: Pestana; enRojo: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave || "abiertas"}
          href={`/postventa/atenciones${p.clave ? `?ver=${p.clave}` : ""}`}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
            pestana === p.clave ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          {p.etiqueta}
          {p.clave === "" && enRojo > 0 && ` (${enRojo})`}
        </Link>
      ))}
    </div>
  );
}

/**
 * La pista de nueve etapas, tal como estaba (embudo + lista), ahora
 * reutilizada tanto para «Abiertas» como para «Cerradas».
 */
function VistaAtenciones({
  todas,
  cerradas,
  filtro,
  etapaSeleccionada,
}: {
  todas: (Atencion & {
    cuentas: { razon_social: string } | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  })[];
  cerradas: boolean;
  filtro: string;
  etapaSeleccionada?: string;
}) {
  let filas = todas;
  if (!cerradas) {
    if (filtro === "urgentes") filas = filas.filter((a) => relojAtencion(a).estado === "rojo");
    if (filtro === "sin_programar") filas = filas.filter((a) => !a.programada_at);
  }
  if (etapaSeleccionada) filas = filas.filter((a) => a.etapa === etapaSeleccionada);

  return (
    <div>
      {!cerradas && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
            </Link>
          ))}
        </div>
      )}

      {/* El embudo de las nueve etapas, clicable: dice de un vistazo dónde se
          está atascando el trabajo. Solo tiene sentido en Abiertas. */}
      {!cerradas && (
        <div className="mb-3 flex flex-wrap gap-1">
          {ETAPAS_ATENCION.map((e) => {
            const n = todas.filter((a) => a.etapa === e).length;
            return (
              <Link
                key={e}
                href={`/postventa/atenciones?${new URLSearchParams({ ...(filtro ? { filtro } : {}), ...(etapaSeleccionada === e ? {} : { etapa: e }) })}`}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  etapaSeleccionada === e ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  n === 0 && "opacity-45",
                )}
              >
                {ETIQUETA_ETAPA[e]} <b className="tabular-nums">{n}</b>
              </Link>
            );
          })}
        </div>
      )}

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {cerradas
            ? "Todavía no hay atenciones cerradas."
            : "No hay atenciones acá. Las que registre el área o derive Central aparecen en esta lista."}
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
                  reloj.estado === "rojo" && !a.cerrado_at ? "border-destructive/40 bg-destructive/5" : "border-border",
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
                      falta.urgente || reloj.estado === "rojo" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground",
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
