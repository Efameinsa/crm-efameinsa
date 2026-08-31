import { ArrowRight, FileText, Inbox, ShieldCheck } from "lucide-react";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { textoLegible } from "@/lib/texto";
import type { Compendio } from "@/lib/compendio-cierre";
import { cn } from "@/lib/utils";

/**
 * Cómo se hizo esta venta, para quien recibe el expediente.
 *
 * «El expediente completo, que es tu cierre, cotización, orden de compra,
 * voucher… y CRM, que es un compendio solamente de esta operación: cómo se hizo
 * la gestión» (Carlos, 28-08).
 *
 * Es lo único que la pantalla de Central no tenía y el sobre impreso sí:
 * el camino. Sin esto, mirar el CRM le mostraba menos que abrir el sobre, y por
 * eso el sobre seguía existiendo.
 *
 * SEIS LÍNEAS, NO CUARENTA. Se muestran la primera gestión, las visitas y
 * reuniones —las que costaron plata y tiempo— y las tres últimas antes del
 * cierre. Una lista de cuarenta llamadas no la lee nadie; seis líneas cuentan
 * la misma historia y se leen en diez segundos.
 *
 * DESDE EL 31-08 TAMBIÉN SE USA ANTES DE LA VENTA, en las aprobaciones de
 * precio. Por eso el título es un parámetro y el paso «Cerrado» solo aparece
 * si de verdad cerró: ahí la gestión está viva, y poner «Cerrado —» era
 * mentirle a quien está por decidir.
 */
export function CompendioGestion({
  compendio,
  compacto = false,
  titulo = "Cómo se hizo la venta",
}: {
  compendio: Compendio;
  compacto?: boolean;
  titulo?: string;
}) {
  const c = compendio;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h4>
        <p className="text-[11px] text-muted-foreground">
          {c.comercial}
          {c.codigoComercial && ` · ${c.codigoComercial}`}
        </p>
      </div>

      {/* La línea de tiempo, en una sola fila: entró → se derivó → primer
          contacto → se cerró. Es la que gerencia mira para medir.
          Las flechas se arman uniendo los pasos que EXISTEN, no colgándole una
          a cada uno: en una gestión todavía abierta no hay «Cerrado», y la
          flecha suelta al final quedaba apuntando a la nada. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {[
          c.recibidoAt ? (
            <Paso
              key="entro"
              icono={<Inbox className="size-3" />}
              titulo="Entró"
              detalle={`${fechaCalendario(c.recibidoAt.slice(0, 10))}${c.origenCanal ? ` por ${c.origenCanal}` : ""}`}
            />
          ) : null,
          c.primeraGestionAt ? (
            <Paso key="contacto" titulo="Primer contacto" detalle={fechaCalendario(c.primeraGestionAt.slice(0, 10))} />
          ) : null,
          c.cotizaciones.length > 0 ? (
            <Paso
              key="cotizado"
              icono={<FileText className="size-3" />}
              titulo={c.cotizaciones.length === 1 ? "Cotizado" : `${c.cotizaciones.length} cotizaciones`}
              detalle={c.cotizaciones.map((q) => q.codigo).join(", ")}
            />
          ) : null,
          c.cerradaAt ? (
            <Paso key="cerrado" titulo="Cerrado" detalle={fechaCalendario(c.cerradaAt.slice(0, 10))} fuerte />
          ) : null,
        ]
          .filter((p): p is React.ReactElement => p !== null)
          .flatMap((paso, i) =>
            i === 0 ? [paso] : [<ArrowRight key={`f${i}`} className="size-3 text-muted-foreground" />, paso],
          )}
        {c.diasDeCiclo != null && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
            {c.diasDeCiclo} {c.diasDeCiclo === 1 ? "día" : "días"} en total
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          {c.gestiones} {c.gestiones === 1 ? "gestión" : "gestiones"}
        </span>
        {c.cotizaciones.some((q) => q.aprobadaPorGerencia) && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            <ShieldCheck className="size-3" /> precio aprobado por gerencia
          </span>
        )}
      </div>

      {!compacto && c.hitos.length > 0 && (
        <ol className="mt-2.5 space-y-1 border-t border-border pt-2">
          {c.hitos.map((h, i) => (
            <li key={i} className="flex flex-wrap gap-x-2 text-xs">
              <span className="w-[118px] flex-none font-mono tabular-nums text-muted-foreground">
                {fechaHoraLima(h.fecha)}
              </span>
              <span className="font-medium text-foreground">{h.tipo}</span>
              {h.quien && <span className="text-muted-foreground">· {h.quien}</span>}
              {h.detalle && (
                <span className="line-clamp-2 min-w-[160px] flex-1 text-muted-foreground">
                  {textoLegible(h.detalle)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Paso({
  icono,
  titulo,
  detalle,
  fuerte,
}: {
  icono?: React.ReactNode;
  titulo: string;
  detalle: string;
  fuerte?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {icono}
      <span className={cn("font-medium", fuerte ? "text-foreground" : "text-foreground/80")}>{titulo}</span>
      <span className="text-muted-foreground">{detalle}</span>
    </span>
  );
}
