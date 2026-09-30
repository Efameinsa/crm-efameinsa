import { Archive } from "lucide-react";
import type { AsiSeQuedo } from "@/lib/asi-se-quedo";
import { fechaCalendario, fechaLimaCorta } from "@/lib/fechas";
import { textoLegible } from "@/lib/texto";

/**
 * «Así se quedó»: la última conversación archivada del cliente, arriba del
 * expediente nuevo (30-09, Katerine con PYRAMID METALS). Gris y sin alarmas a
 * propósito: es memoria, no un pendiente. «Quedó en» nunca se pinta como
 * vencido aunque la fecha haya pasado hace meses.
 */
export function AsiSeQuedoRecuadro({ resumen, hrefHistoria }: { resumen: AsiSeQuedo; hrefHistoria: string }) {
  const nota = resumen.nota ? textoLegible(resumen.nota) : null;
  const mismoDia = fechaLimaCorta(resumen.desde) === fechaLimaCorta(resumen.hasta);
  return (
    <div className="mt-2 max-w-3xl rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Archive className="size-3.5 shrink-0" />
        <b className="font-semibold text-foreground">Así se quedó</b>
        <span>(antes de este expediente)</span>
        <span>·</span>
        <b className="font-semibold text-foreground tabular-nums">{fechaLimaCorta(resumen.fecha)}</b>
        {resumen.quien && <span>· registró {resumen.quien}</span>}
        {resumen.estadoExcel && (
          <span className="rounded bg-secondary px-1.5 py-px font-mono text-[10px] text-foreground/70">{resumen.estadoExcel}</span>
        )}
      </p>
      {nota && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-snug text-foreground/80">«{nota}»</p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {resumen.quedoEn && (
          <>
            <span>
              Quedó en: <i>{resumen.quedoEn.accion.toLowerCase()}</i>
              {resumen.quedoEn.fecha ? ` el ${fechaCalendario(resumen.quedoEn.fecha)}` : ""}
            </span>
            <span>·</span>
          </>
        )}
        <span>
          {resumen.gestiones} {resumen.gestiones === 1 ? "gestión" : "gestiones"}
          {mismoDia ? ` el ${fechaLimaCorta(resumen.hasta)}` : ` del ${fechaLimaCorta(resumen.desde)} al ${fechaLimaCorta(resumen.hasta)}`}
        </span>
        <span>·</span>
        <a href={hrefHistoria} className="font-semibold text-primary hover:underline">
          Ver la historia →
        </a>
      </p>
    </div>
  );
}
