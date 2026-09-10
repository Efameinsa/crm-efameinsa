import Link from "next/link";
import { ChevronRight, FileText, PhoneCall, CalendarClock } from "lucide-react";
import { fechaLima, fechaHoraLima } from "@/lib/fechas";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import type { HistoriaDelCliente } from "@/lib/central/historia-del-cliente";

/**
 * El «triangulito» que pidió Carlos el 10-09 para la bandeja de Central.
 *
 * «En su día, mi día de Central, ahí sale Diego Armando del Grupo Xiomas. Debe
 * haber por ahí un clic, un botón donde se pueda desplegar toda la información
 * histórica de ese cliente, quién lo ha gestionado, para que pueda ser más
 * eficiente en su derivación».
 *
 * Hasta hoy la bandeja decía de quién es la ficha y cuándo se tocó por última
 * vez, y con eso Central tenía que aplicar la regla de los seis meses a ojo. La
 * regla no alcanza: una cuenta puede estar dentro de los seis meses y no tener
 * ninguna acción, o cumplir el sexto mes justo hoy y estar por cerrar mañana.
 * Acá está lo que contesta esa pregunta —qué se cotizó, quién habló, qué quedó
 * agendado— sin salir de la pantalla ni ir a buscar a mano a «Clientes».
 *
 * Es `<details>` a propósito: se pliega solo, funciona sin JavaScript, y esto
 * sigue siendo un componente de servidor. Nace CERRADO — la bandeja se recorre
 * de un vistazo y esto es para el contacto en el que uno se detiene.
 */
export function HistoriaDelClienteDesplegable({
  h,
  razonSocial,
  cuentaId,
}: {
  h: HistoriaDelCliente;
  razonSocial: string;
  cuentaId: string;
}) {
  const hayAlgo = h.cotizaciones.length > 0 || h.gestiones.length > 0 || h.pendientes.length > 0;

  return (
    <details className="group mt-2 rounded-md border border-border bg-muted/30">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">
        <ChevronRight className="size-3.5 flex-none transition-transform group-open:rotate-90" />
        Ver la historia de {razonSocial}
        <span className="font-normal text-muted-foreground">
          · {h.oportunidades} {h.oportunidades === 1 ? "oportunidad" : "oportunidades"}
          {h.cotizaciones.length > 0 && `, ${h.cotizaciones.length} cotizada${h.cotizaciones.length === 1 ? "" : "s"}`}
        </span>
      </summary>

      <div className="space-y-2.5 border-t border-border px-2.5 py-2 text-xs">
        {!hayAlgo && (
          // Un vacío dice qué no hay, por qué, y qué hacer con eso.
          <p className="text-muted-foreground">
            El cliente está en el CRM pero <b>nadie le hizo gestión ni le cotizó nada</b>. Suele ser una ficha que entró
            del archivo de los Excel y no se tocó desde entonces: si además pasaron los seis meses, no hay a quién
            respetarle la cartera.
          </p>
        )}

        {h.pendientes.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 font-semibold text-foreground">
              <CalendarClock className="size-3.5" /> Lo que quedó agendado
            </p>
            <ul className="space-y-0.5">
              {h.pendientes.map((p) => (
                <li key={p.oportunidadId} className="text-muted-foreground">
                  <Link href={`/comercial/oportunidades/${p.oportunidadId}`} className="text-primary hover:underline">
                    {p.accion}
                  </Link>
                  {p.fecha && ` · para el ${fechaLima(p.fecha)}`}
                  {p.quien && ` · ${p.quien}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {h.cotizaciones.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 font-semibold text-foreground">
              <FileText className="size-3.5" /> Lo que se le cotizó
            </p>
            <ul className="space-y-0.5">
              {h.cotizaciones.map((c, i) => (
                <li key={`${c.codigo ?? "s"}-${i}`} className="text-muted-foreground">
                  <span className="font-mono text-foreground">{c.codigo ?? "borrador"}</span>
                  {c.fecha && ` · ${fechaLima(c.fecha)}`}
                  {c.total != null && ` · ${c.moneda ?? ""} ${Number(c.total).toLocaleString("es-PE")}`}
                  {c.quien && ` · ${c.quien}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {h.gestiones.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 font-semibold text-foreground">
              <PhoneCall className="size-3.5" /> Quién habló con él
            </p>
            <ul className="space-y-0.5">
              {h.gestiones.map((g, i) => (
                <li key={`${g.fecha}-${i}`} className="text-muted-foreground">
                  <span className="text-foreground">{ETIQUETA_ACTIVIDAD[g.tipo] ?? g.tipo}</span>
                  {` · ${fechaHoraLima(g.fecha)}`}
                  {g.quien && ` · ${g.quien}`}
                  {g.nota && <span className="line-clamp-1 opacity-80">{g.nota}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href={`/comercial/cartera/${cuentaId}`} className="inline-block font-semibold text-primary hover:underline">
          Abrir la ficha completa →
        </Link>
      </div>
    </details>
  );
}
