import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { NombreAFicha } from "@/components/crm/nombre-a-ficha";
import { puedeVerPrecios } from "@/lib/postventa";
import { cargarFilasPorPaso, DIAS_HISTORIA } from "@/lib/pedidos-por-paso";
import { FILTROS_SIN_PASO, loQueFaltaPorPaso, type TonoDetalle } from "@/lib/lo-que-falta-por-paso";
import { cn } from "@/lib/utils";

/**
 * LA AGENDA DE POSTVENTA: LO QUE FALTA, PASO POR PASO, SOLO LO ABIERTO.
 *
 * Reunión del 13-10 (Carlos, Rubí, Ariana, Lesly y Santos). Un cliente esperó
 * del 03-10 al 13-10 su cotización porque nadie tenía mapeado qué faltaba:
 * «esto no debería votar mismo en la agenda y no estar buscando paso por
 * paso… que la agenda mismo lo ponga, lo detalle a todos los clientes». Y:
 * «que viene a ser todo el resultado de por paso, pero que solamente sea lo
 * abierto, lo que está en curso».
 *
 * Es el resultado de la tabla «Por paso» del control de pedidos, con la misma
 * regla (lib/pedidos-por-paso), puesto como lista de trabajo: cada paso con
 * sus clientes y el enlace directo a cada pedido. Primero lo que le toca
 * ahora; después lo que todavía espera un paso anterior.
 */

const TONO: Record<TonoDetalle, string> = {
  trabado: "text-destructive",
  pendiente: "text-amber-800",
  espera: "text-muted-foreground",
  listo: "text-[#1E7F4F]",
  stock: "text-orange-800",
};

/** También va arriba de la agenda clásica (Santos, 13-10: los 81 abiertos «deben aparecer en su agenda»). */
export async function LoQueFaltaPorPaso() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { abiertos, historia, secciones } = loQueFaltaPorPaso(await cargarFilasPorPaso(supabase, puedeVerPrecios(perfil)));

  return (
    <SeccionPanel
      titulo="Lo que falta, paso por paso"
      accion={
        <Link href="/postventa/control?vista=paso" className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent">
          Ver la tabla por paso
        </Link>
      }
    >
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Solo los pedidos abiertos ({abiertos}). Cada paso con sus clientes: toque uno para abrir su pedido y marcar el paso. Arriba de cada lista va lo que le
        toca ahora; abajo, lo que todavía espera un paso anterior.
        {historia > 0 && ` No suman ${historia} pedidos del Excel de antes del CRM que ya salieron hace más de ${DIAS_HISTORIA} días o que nadie movió.`}
      </p>

      {secciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos abiertos con pasos pendientes.</p>
      ) : (
        <>
          {/* El resumen de un vistazo: cuántos por paso, cada uno salta a su lista. */}
          <nav className="mb-4 flex flex-wrap gap-1.5">
            {secciones.map((s) => (
              <a
                key={s.clave}
                href={`#paso-${s.clave}`}
                className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-500/20"
              >
                {s.titulo} ({s.filas.length})
              </a>
            ))}
          </nav>

          <div className="space-y-3">
            {secciones.map((s) => (
              <details key={s.clave} id={`paso-${s.clave}`} open={s.filas.length <= 12} className="scroll-mt-20 rounded-lg border border-border bg-card">
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2">
                  <span className="text-sm font-semibold text-foreground">{s.titulo}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">{s.filas.length}</span>
                  {!FILTROS_SIN_PASO.has(s.clave) && s.ahoraN < s.filas.length && (
                    <span className="text-[11px] text-muted-foreground">
                      {s.ahoraN} le toca ahora · {s.filas.length - s.ahoraN} esperan un paso anterior
                    </span>
                  )}
                  <span className="w-full text-[11px] text-muted-foreground">{s.ayuda}</span>
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {s.filas.map(({ f, detalle, ahora }) => (
                    <li key={f.id} className={cn("flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2", !ahora && "opacity-70")}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          <NombreAFicha cuentaId={f.cuentaId}>{f.cliente}</NombreAFicha>
                        </span>
                        <span className="line-clamp-1 text-[11px] text-muted-foreground" title={f.equipo}>
                          {f.equipo.split("\n")[0]}
                        </span>
                        {detalle && <span className={cn("block text-[11px]", TONO[detalle.tono])}>{detalle.texto}</span>}
                      </span>
                      <Link href={`/postventa/pedidos/${f.id}`} className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent">
                        Abrir el pedido
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-border px-3 py-1.5 text-[11px]">
                    <Link href={`/postventa/control?vista=paso&falta=${s.clave}`} className="text-primary hover:underline">
                      Ver estos pedidos en la tabla por paso
                    </Link>
                </p>
              </details>
            ))}
          </div>
        </>
      )}
    </SeccionPanel>
  );
}
