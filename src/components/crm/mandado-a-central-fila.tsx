"use client";

import { useState } from "react";
import Link from "@/components/enlace";
import { ArrowRight, Check, Clock, Send, X } from "lucide-react";
import { AdjuntosLead } from "@/components/crm/adjuntos-lead";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fechaHoraLima } from "@/lib/fechas";
import type { EstadoMandado, Mandado } from "@/lib/mandado-a-central";
import { cn } from "@/lib/utils";

/**
 * Una fila de «Lo que mandé a Central», y lo que se abre al tocarla.
 *
 * ANTES SOLO SE ABRÍA LO DEVUELTO. La fila enlazaba al expediente cuando
 * Central se lo devolvía a quien lo mandó; en cualquier otro caso no era nada
 * —ni enlace ni botón— y el clic se perdía en silencio. Brenda (C1), 17-09:
 * «puedo ver el historial de cosas que envié a Central, pero al hacerle clic
 * no puedo ver el detalle de lo que envié». Con DUO LAVANDERIA escribiéndole
 * cuatro veces en dos días, lo que necesita antes de contestar es leer qué
 * dijo la vez anterior.
 *
 * AHORA TODA FILA SE ABRE, en una ventana encima de la pantalla, y muestra lo
 * que se mandó tal cual se registró: contacto, teléfono, el texto completo con
 * sus saltos de línea, la sugerencia, las fotos y documentos, y qué hizo
 * Central con eso. Ventana y no pantalla porque se consulta en medio de otra
 * cosa —el cliente al teléfono— y se vuelve a lo que se estaba haciendo con
 * un clic. Cuando además hay expediente propio, el botón «Abrir el expediente»
 * está adentro; el enlace directo no se pierde, solo pasa a la ventana.
 */

const ICONO: Record<EstadoMandado, typeof Send> = {
  esperando: Clock,
  en_camino: Send,
  devuelto: ArrowRight,
  derivado: ArrowRight,
  cerrado: X,
};

/** Verde solo para lo que volvió a sus manos: es lo único que ya puede trabajar. */
const COLOR: Record<EstadoMandado, string> = {
  esperando: "bg-secondary text-muted-foreground",
  en_camino: "bg-secondary text-muted-foreground",
  devuelto: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  derivado: "bg-secondary text-muted-foreground",
  cerrado: "bg-secondary text-muted-foreground",
};

/** Qué se puede hacer desde la ventana, dicho antes de que lo busquen. */
const QUE_SIGUE: Record<EstadoMandado, string> = {
  esperando: "Sigue en la cola de Central; cuando lo deriven, acá dirá a quién.",
  en_camino: "Está en el área, a la espera de que alguien lo tome.",
  devuelto: "Central se lo devolvió: ya puede trabajarlo.",
  derivado: "Lo trabaja quien lo recibió; lo que avance queda en su expediente, no acá.",
  cerrado: "Central lo cerró; no hay nada más que hacer con esto.",
};

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function FilaMandado({ fila }: { fila: Mandado }) {
  const [abierto, setAbierto] = useState(false);
  const d = fila.detalle;
  const Icono = ICONO[fila.estado];
  // El contacto se muestra aparte solo cuando no es el mismo nombre que ya va
  // en el título (en lo de postventa suelen coincidir).
  const contactoAparte = d.contacto && d.contacto !== d.razonSocial ? d.contacto : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5 text-left transition-colors hover:bg-accent",
          fila.demorado ? "border-amber-400/60 bg-amber-500/10" : "border-border",
        )}
        title="Ver lo que se mandó"
      >
        <span className={cn("flex size-7 flex-none items-center justify-center rounded-full", COLOR[fila.estado])}>
          {fila.estado === "cerrado" ? <Check className="size-3.5" /> : <Icono className="size-3.5" />}
        </span>
        <span className="min-w-[200px] flex-1">
          <span className="block text-sm font-medium text-foreground">{fila.cliente}</span>
          <span className="block text-xs text-muted-foreground">{fila.frase}</span>
        </span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">{fila.codigo}</span>
        <ArrowRight className="size-3.5 flex-none text-muted-foreground" />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-6">
              <span className="mr-2 font-mono text-xs font-semibold text-muted-foreground">{fila.codigo}</span>
              {fila.cliente}
            </DialogTitle>
            <DialogDescription>{fila.frase}</DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato etiqueta="Lo registró">
              {fechaHoraLima(d.registradoAt)} · {d.canal}
            </Dato>
            {d.sugerencia && <Dato etiqueta="Sugirió">{d.sugerencia}</Dato>}
            {contactoAparte && <Dato etiqueta="Contacto">{contactoAparte}</Dato>}
            {d.ruc && <Dato etiqueta="RUC / DNI">{d.ruc}</Dato>}
            {d.telefono && <Dato etiqueta="Teléfono">{d.telefono}</Dato>}
            {d.email && <Dato etiqueta="Correo">{d.email}</Dato>}
            {d.derivadoA && (
              <Dato etiqueta="Central lo derivó">
                a {d.derivadoA}
                {d.derivadoAt && <span className="text-muted-foreground"> · {fechaHoraLima(d.derivadoAt)}</span>}
              </Dato>
            )}
          </dl>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lo que escribió</p>
            {d.mensaje ? (
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
                {d.mensaje}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Se mandó sin texto.</p>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Adjuntos{d.adjuntos.length > 0 && ` (${d.adjuntos.length})`}
            </p>
            {d.adjuntos.length > 0 ? (
              <AdjuntosLead adjuntos={d.adjuntos} />
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No se adjuntó ningún archivo.</p>
            )}
          </div>

          {/* Si el caso lo trabaja otra área no hay expediente que abrir para
              quien lo mandó, y se dice, en vez de dejar un botón que no lleva
              a ningún lado. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">{QUE_SIGUE[fila.estado]}</p>
            {fila.href && (
              <Button size="sm" nativeButton={false} render={<Link href={fila.href} />}>
                Abrir el expediente <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
