"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, CircleCheckBig, Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  duplicarCotizacion,
  eliminarCotizacion,
  enviarCotizacion,
  registrarVenta,
} from "@/lib/acciones/cotizaciones";
import { fechaHoraLima } from "@/lib/fechas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CotizacionResumen {
  id: string;
  codigo: string | null;
  serie: string;
  estado: string;
  estado_aprobacion: string;
  total: number;
  moneda: string;
  nota_gerencia: string | null;
  created_at: string;
  enviada_at: string | null;
}

const ESTADO_APROBACION: Record<string, { etiqueta: string; clases: string }> = {
  auto_aprobada: { etiqueta: "Aprobada", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  pendiente_gerencia: { etiqueta: "Pendiente de gerencia", clases: "bg-amber-500/10 text-amber-700" },
  aprobada_gerencia: { etiqueta: "Aprobada por gerencia", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada_gerencia: { etiqueta: "Rechazada por gerencia", clases: "bg-destructive/10 text-destructive" },
};

const ESTADO_ENVIO: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  perdida: "Perdida",
  vencida: "Vencida",
};

export function ListaCotizaciones({ cotizaciones }: { cotizaciones: CotizacionResumen[] }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  function onEnviar(id: string) {
    startTransition(async () => {
      const r = await enviarCotizacion(id);
      if (r.error) toast.error(r.error);
      else {
        // El número se asigna recién ahora (migración 0064): vale la pena
        // decirlo, es el que el cliente va a ver en el PDF.
        toast.success(r.codigo ? `Enviada como ${r.codigo}` : "Cotización enviada");
        router.refresh();
      }
    });
  }

  function onRegistrarVenta(id: string) {
    if (!confirm("¿Confirmar la venta con esta cotización?")) return;
    startTransition(async () => {
      const r = await registrarVenta(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Venta registrada");
        router.refresh();
      }
    });
  }

  function onBorrar(c: CotizacionResumen) {
    // La base tampoco lo permite (migración 0065), pero conviene no ofrecer un
    // botón que va a fallar.
    if (c.estado !== "borrador" || c.codigo) return;
    if (!confirm(`¿Borrar este borrador del ${fechaHoraLima(c.created_at)}? No tiene número asignado, así que no deja hueco en la serie.`)) return;
    startTransition(async () => {
      const r = await eliminarCotizacion(c.id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Borrador eliminado");
        router.refresh();
      }
    });
  }

  function onDuplicar(id: string) {
    startTransition(async () => {
      const r = await duplicarCotizacion(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success(
          `Copia de ${r.codigoViejo ?? "la cotización"} creada como borrador — recibe su número al enviarla`,
        );
        router.refresh();
      }
    });
  }

  if (cotizaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones.</p>;
  }

  return (
    <div className="space-y-2">
      {cotizaciones.map((c, i) => {
        const puedeEnviar = c.estado === "borrador" && (c.estado_aprobacion === "auto_aprobada" || c.estado_aprobacion === "aprobada_gerencia");
        const puedeVender = c.estado === "enviada" && (c.estado_aprobacion === "auto_aprobada" || c.estado_aprobacion === "aprobada_gerencia");
        const aprobacion = ESTADO_APROBACION[c.estado_aprobacion];
        // La lista viene ordenada de más nueva a más vieja. Katerine (C5) tenía
        // varios borradores del mismo cliente y no sabía cuál era el último,
        // así que el primero lleva el cartel y todos muestran su hora.
        const esUltima = i === 0;
        const esBorradorSinNumero = c.estado === "borrador" && !c.codigo;

        return (
          <div
            key={c.id}
            className={cn(
              "rounded-lg border p-3.5",
              puedeVender ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5" : "border-border bg-background",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {/* Un borrador todavía no gastó número: el correlativo se
                    asigna al enviarlo (migración 0064). */}
                <span
                  className={cn(
                    "font-mono text-xs font-semibold",
                    c.codigo ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {/* "Sin número" a secas se leía como que algo falló, y ese
                      mismo día Katerine rehizo la misma cotización creyendo que
                      no se había guardado. Ahora dice qué falta, no qué no hay. */}
                  {c.codigo ?? "Recibe número al enviar"}
                </span>
                <span className="text-xs text-muted-foreground">{c.serie}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {c.moneda} {c.total.toLocaleString("es-PE")}
                </span>
                {esUltima && cotizaciones.length > 1 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    La más reciente
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* "Aprobada · Borrador" se leía como una contradicción. Son dos
                    ejes distintos: la aprobación de precio y el envío. Cuando
                    la cotización entra en lista se auto-aprueba y esa etiqueta
                    no dice nada, así que manda el estado de envío. El sello de
                    aprobación se muestra solo cuando SÍ informa: pendiente,
                    rechazada, o aprobada a mano por gerencia. */}
                {c.estado_aprobacion !== "auto_aprobada" && (
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", aprobacion.clases)}>
                    {aprobacion.etiqueta}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                    c.estado === "borrador" ? "bg-secondary text-muted-foreground" : aprobacion.clases,
                  )}
                >
                  {ESTADO_ENVIO[c.estado] ?? c.estado}
                </span>
              </div>
            </div>

            {/* Cuándo se armó. Con varios borradores del mismo cliente era
                imposible saber cuál era el último (C5, 24-08). */}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Creada el {fechaHoraLima(c.created_at)}
              {c.enviada_at ? ` · enviada el ${fechaHoraLima(c.enviada_at)}` : ""}
            </p>

            {c.nota_gerencia && (
              <p className="mt-2 rounded-md bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground">
                &ldquo;{c.nota_gerencia}&rdquo;
              </p>
            )}

            {puedeVender && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#1E7F4F]">
                <CircleCheckBig className="size-3.5" />
                Enviada y aprobada — ya se puede cerrar la venta.
              </p>
            )}

            <div className="mt-2.5 flex items-center gap-3">
              <a
                href={`/api/cotizaciones/${c.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <FileDown className="size-3.5" />
                Ver PDF
              </a>
              {/* Solo mientras es borrador: en cuanto se envía queda cerrada
                  y hay que duplicarla, que es la regla de gerencia de siempre
                  (migración 0062). */}
              {c.estado === "borrador" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={enviando}
                  onClick={() => router.push(`?editar=${c.id}#cotizador`)}
                >
                  <Pencil className="size-3.5" />
                  Corregir
                </Button>
              )}
              {puedeEnviar && (
                <Button size="sm" variant="outline" disabled={enviando} onClick={() => onEnviar(c.id)}>
                  Enviar
                </Button>
              )}
              {puedeVender && (
                <Button
                  size="sm"
                  disabled={enviando}
                  onClick={() => onRegistrarVenta(c.id)}
                  className="bg-[#1E7F4F] hover:bg-[#1E7F4F]/90"
                >
                  <CircleCheckBig className="size-3.5" />
                  Registrar venta
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={enviando} onClick={() => onDuplicar(c.id)}>
                <Copy className="size-3.5" />
                Duplicar
              </Button>
              {/* Al final y separado, para que no se apriete por error. Solo un
                  borrador SIN número: uno que ya tiene número comprometió su
                  correlativo con contabilidad, y una enviada la tiene el
                  cliente. La base lo impide igual (migración 0065). */}
              {esBorradorSinNumero && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={enviando}
                  onClick={() => onBorrar(c)}
                  className="ml-auto text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Borrar
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
