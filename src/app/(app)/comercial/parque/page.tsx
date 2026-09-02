import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Wrench } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { cargarParque, type ClienteParque } from "@/lib/parque";
import { ETIQUETA_MANTENIMIENTO, type EstadoMantenimiento } from "@/lib/ruta-mantenimiento";
import { veTodoPostventa } from "@/lib/postventa";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { OfrecerMantenimientoBoton } from "@/components/crm/ofrecer-mantenimiento-boton";
import { fechaCalendario, fechaLimaCorta } from "@/lib/fechas";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * «Mi parque»: los clientes con máquinas, y a cuáles toca venderles el
 * mantenimiento.
 *
 * Santos, 02-09: «el negocio pide que el comercial también esté verificando
 * de sus ventas a quién se le está venciendo el producto para poder venderle
 * el mantenimiento». Regla decidida: lo venden AMBOS, comercial y postventa,
 * y uno ve la gestión del otro. Por eso cada fila dice quién habló último con
 * el cliente y si ya hay una oportunidad de mantenimiento abierta y de quién:
 * si la hay, no se abre otra, se entra a esa.
 *
 * El comercial ve su cartera. Quien ve todo postventa (el área, gerencia, o
 * el comercial con la llave) ve el parque entero, con la cartera de cada uno.
 */

const COLOR: Record<EstadoMantenimiento, string> = {
  nunca: "bg-destructive/10 text-destructive",
  vencido: "bg-amber-500/15 text-amber-800",
  al_dia: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  sin_dato: "bg-secondary text-muted-foreground",
};

export default async function ParquePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; todos?: string }>;
}) {
  const [perfil, sp] = await Promise.all([requerirPerfil(), searchParams]);
  // Solo para quien vende mantenimiento (Santos, 02-09: «solo prepárala para
  // Ariana, quítale al resto; mantener a postventa»): la llave hace_postventa,
  // el área, gerencia. Un comercial sin la llave vuelve a su día.
  const puedeVerTodo = veTodoPostventa(perfil);
  if (!puedeVerTodo) redirect("/comercial");
  const supabase = await createClient();
  const hoy = hoyLima();
  const verTodo = puedeVerTodo && sp.todos === "1";
  const estado = (["nunca", "vencido", "al_dia", "sin_dato"] as EstadoMantenimiento[]).includes(sp.estado as EstadoMantenimiento)
    ? (sp.estado as EstadoMantenimiento)
    : null;
  const q = (sp.q ?? "").trim().toLowerCase();

  const todos = await cargarParque(supabase, { comercialId: verTodo ? null : perfil.id, hoy });
  const filas = todos.filter((c) => (!estado || c.estado === estado) && (!q || c.razonSocial.toLowerCase().includes(q) || (c.numDoc ?? "").includes(q)));
  const cuenta = (e: EstadoMantenimiento) => todos.filter((c) => c.estado === e).length;
  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const actual: Record<string, string | null> = { q: q || null, estado, todos: verTodo ? "1" : null, ...cambios };
    for (const [k, v] of Object.entries(actual)) if (v) p.set(k, v);
    const s = p.toString();
    return `/comercial/parque${s ? `?${s}` : ""}`;
  };

  return (
    <SeccionPanel
      titulo={verTodo ? "Parque instalado de la empresa" : "Mi parque"}
      accion={
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-foreground">
            {todos.length} cliente{todos.length === 1 ? "" : "s"} · {todos.reduce((a, c) => a + c.equipos, 0)} máquinas
          </span>
          {puedeVerTodo && (
            <span className="inline-flex overflow-hidden rounded-md border border-border font-medium">
              <Link href={enlace({ todos: null })} className={cn("px-2.5 py-1", !verTodo ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
                Mi cartera
              </Link>
              <Link href={enlace({ todos: "1" })} className={cn("px-2.5 py-1", verTodo ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
                Toda la empresa
              </Link>
            </span>
          )}
        </span>
      }
    >
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Sus clientes con máquinas, y a cuáles toca venderles el mantenimiento. El semáforo es el del preventivo:
        <b className="text-destructive"> nunca</b>, <b className="text-amber-800">vencido</b> (más de 6 meses) o{" "}
        <b className="text-[#1E7F4F]">al día</b>. La última gestión es de quien sea, comercial o postventa: los dos
        venden mantenimiento y los dos ven lo que hizo el otro. Si ya hay una oportunidad abierta, se entra a esa.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form action="/comercial/parque" className="relative min-w-56 flex-1">
          {verTodo && <input type="hidden" name="todos" value="1" />}
          {estado && <input type="hidden" name="estado" value={estado} />}
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Buscar por cliente o RUC…" className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Link href={enlace({ estado: null })} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", !estado ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>
            Todos ({todos.length})
          </Link>
          {(["nunca", "vencido", "al_dia", "sin_dato"] as EstadoMantenimiento[]).map((e) => (
            <Link
              key={e}
              href={enlace({ estado: e })}
              className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", estado === e ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}
            >
              {ETIQUETA_MANTENIMIENTO[e]} ({cuenta(e)})
            </Link>
          ))}
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {todos.length === 0 ? "Todavía no hay máquinas fichadas en su cartera. Se fichan al cerrar una venta con serie, o desde Equipos instalados en postventa." : "Nada con ese filtro."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Máquinas</th>
                <th className="px-2 py-2 font-medium">Último mantenimiento</th>
                <th className="px-2 py-2 font-medium">Última gestión (de quien sea)</th>
                <th className="px-2 py-2 font-medium">Mantenimiento</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <FilaParque key={c.cuentaId} c={c} verTodo={verTodo} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SeccionPanel>
  );
}

function FilaParque({ c, verTodo }: { c: ClienteParque; verTodo: boolean }) {
  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-accent/40">
      <td className="px-2 py-2">
        <Link href={`/comercial/cartera/${c.cuentaId}`} className="block font-semibold text-foreground hover:underline">
          {c.razonSocial}
        </Link>
        <span className="block text-[11px] text-muted-foreground">
          {[c.numDoc, c.zona, verTodo && c.carteraDe ? `cartera ${c.carteraDe}` : null].filter(Boolean).join(" · ") || "—"}
        </span>
      </td>
      <td className="px-2 py-2">
        <span className="font-semibold tabular-nums text-foreground">{c.equipos}</span>
        <span className="block max-w-56 truncate text-[11px] text-muted-foreground" title={c.modelos.join(" · ")}>
          {c.modelos.join(" · ") || "sin modelo"}
        </span>
        {c.ultimaCompraAt && <span className="block text-[11px] text-muted-foreground">compró {fechaCalendario(c.ultimaCompraAt)}</span>}
      </td>
      <td className="px-2 py-2">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", COLOR[c.estado])}>{ETIQUETA_MANTENIMIENTO[c.estado]}</span>
        <span className="block text-[11px] text-muted-foreground">
          {c.ultimoMantenimiento ? `${fechaCalendario(c.ultimoMantenimiento)} · hace ${c.mesesSinMantenimiento} meses` : c.ultimaCompraAt ? `ninguno desde la compra (${c.mesesSinMantenimiento} meses)` : "sin registro"}
        </span>
        {c.garantiaHasta && <span className="block text-[11px] text-muted-foreground">garantía hasta {fechaCalendario(c.garantiaHasta)}</span>}
      </td>
      <td className="px-2 py-2">
        {c.ultimaGestion ? (
          <>
            <span className="text-foreground">{ETIQUETA_ACTIVIDAD[c.ultimaGestion.tipo] ?? c.ultimaGestion.tipo}</span>
            <span className="block text-[11px] text-muted-foreground">
              {fechaLimaCorta(c.ultimaGestion.at)} · {c.ultimaGestion.quien}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">nadie lo ha llamado</span>
        )}
      </td>
      <td className="px-2 py-2">
        {c.enGestion ? (
          <Link href={`/comercial/oportunidades/${c.enGestion.oportunidadId}`} className="block rounded-md border border-border px-2 py-1 hover:bg-accent">
            <span className="block font-semibold text-foreground">En gestión por {c.enGestion.quien}</span>
            <span className="block text-[11px] text-muted-foreground">
              desde {fechaCalendario(c.enGestion.desde)}
              {c.enGestion.proximaAccion ? ` · ${c.enGestion.proximaAccion}` : ""}
            </span>
          </Link>
        ) : (
          <OfrecerMantenimientoBoton cuentaId={c.cuentaId} compacto />
        )}
      </td>
    </tr>
  );
}

export { Wrench as _IconoParque };
