import Link from "@/components/enlace";
import { fechaLima } from "@/lib/fechas";
import type { FilaTabla } from "@/lib/pedidos-por-paso";
import { cn } from "@/lib/utils";

export interface FilaRegularizar {
  fila: FilaTabla;
  /** Cuándo se entregó o se programó el despacho: ordena de lo más reciente a lo más antiguo. */
  entrega: string | null;
  /** Alguna de sus máquinas sigue en garantía: va primero. */
  enGarantia: boolean;
}

/**
 * REGULARIZAR LOS PEDIDOS ANTIGUOS (gerencia, reunión del 20-10-2026 15:45,
 * Pepas de Oro): «estamos regularizando los pedidos… el primer paso es pedir
 * confirmación a Finanzas… tiene que ser de lo más reciente, los que están en
 * garantía… lo tiene que seguir hasta el final… no nos interesan las carpetas,
 * nos interesa verlo acá en el CRM».
 *
 * La historia del Excel ya no se esconde: es una lista de trabajo que se
 * termina. Cada fila dice lo primero que falta y a quién le toca (postventa
 * supervisa; almacén y Finanzas ejecutan), y lleva al pedido donde se hace.
 */
export function RegularizarPedidos({ filas, cerradosHoy }: { filas: FilaRegularizar[]; cerradosHoy: number }) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No quedan pedidos antiguos por regularizar. Los nuevos siguen su circuito en «Por paso».
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{filas.length} pedidos antiguos por regularizar</span>
        {cerradosHoy > 0 ? ` · ${cerradosHoy} cerrados hoy` : ""}. Primero los que siguen en garantía, de la entrega más
        reciente a la más antigua. Abra el pedido y haga el primer paso, o pídaselo al área que le toca: el aviso le llega y
        la fila dice que está esperando.
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {filas.map(({ fila, entrega, enGarantia }) => {
          const faltan = fila.pasos.filter((p) => !p.hecho && p.clave !== "cerrado");
          const primero = faltan.find((p) => !p.trabado) ?? faltan[0] ?? null;
          return (
            <li key={fila.id} className="flex flex-wrap items-start gap-3 p-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">
                  {fila.cliente}
                  {enGarantia && (
                    <span className="ml-1.5 rounded-full bg-[#1E7F4F]/10 px-1.5 py-px text-[10px] font-semibold text-[#1E7F4F]">en garantía</span>
                  )}
                </p>
                <p className="truncate text-muted-foreground">{fila.equipo.split("\n")[0]}</p>
                <p className="text-muted-foreground">{entrega ? `Entrega: ${fechaLima(entrega.length === 10 ? `${entrega}T12:00:00` : entrega)}` : "Sin fecha de entrega"}</p>
              </div>
              <div className="min-w-0 basis-full sm:basis-80">
                {primero ? (
                  <p className="text-foreground">
                    <span className="font-semibold">Primero: {primero.etiqueta}</span> · le toca a {primero.dueno}
                    {primero.trabado ? <span className="text-amber-800 dark:text-amber-300"> · {primero.trabado}</span> : null}
                  </p>
                ) : (
                  <p className="font-semibold text-[#1E7F4F]">Todo hecho: falta cerrar el pedido.</p>
                )}
                {faltan.length > 1 && (
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {faltan.slice(0, 6).map((p) => (
                      <span key={p.clave} className={cn("rounded px-1.5 py-px", p === primero ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
                        {p.etiqueta}
                      </span>
                    ))}
                    {faltan.length > 6 && <span className="text-muted-foreground">+{faltan.length - 6}</span>}
                  </p>
                )}
              </div>
              <Link href={`/postventa/pedidos/${fila.id}`} className="shrink-0 rounded-md border border-primary/30 px-2 py-1 font-semibold text-primary hover:bg-primary/5">
                Abrir el pedido
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
