"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronDown, CircleDashed, OctagonAlert } from "lucide-react";
import { AprobarPedidoBoton } from "@/components/crm/aprobar-pedido-boton";
import { cn } from "@/lib/utils";

/**
 * El tablero de control de pedidos, interactivo.
 *
 * LA EXPERIENCIA DEL ARRASTRE la diseñó Santos (01-09): «cuando muevo la
 * tarjeta a despacho debería salir la sombrita, la animación de la intención
 * de moverlo, pero que salga una alertita que diga que aún faltan partes».
 * O sea: el gesto se PERMITE —con la sombra nativa del navegador— y el
 * soltar ENSEÑA: la alerta dice paso por paso qué falta para entrar a esa
 * fase. La fase nunca se cambia a mano porque es un hecho con evidencia
 * (protocolo, guía, quién autorizó): cuando los pasos se completan, la
 * tarjeta salta sola.
 *
 * EL CHECKLIST de la tarjeta muestra SOLO la fase en la que está el pedido
 * (Santos: «sale despacho incluido, no se entiende — debería salir solo la
 * parte que le corresponde a preparación»); el circuito completo vive en la
 * ficha. Al pie, adónde pasa cuando complete.
 */

export interface PasoTarjeta {
  etiqueta: string;
  hecho: boolean;
  trabado: string | null;
  dueno: string;
}

export interface TarjetaControl {
  id: string;
  fase: 1 | 2 | 3;
  cliente: string;
  equipo: string;
  hechos: number;
  total: number;
  pct: number;
  frena: { texto: string; dueno: string; grave: boolean } | null;
  fechaDespacho: string | null;
  puedeAprobar: boolean;
  /** Los pasos de SU fase actual — lo único que la tarjeta detalla. */
  pasosFase: PasoTarjeta[];
  /** Lo pendiente ANTES de cada fase futura: el guion de la alertita. */
  faltantesHasta: Record<number, string[]>;
}

const FASES = [
  { numero: 1 as const, titulo: "① Preparación", corto: "Preparación" },
  { numero: 2 as const, titulo: "② Despacho", corto: "Despacho" },
  { numero: 3 as const, titulo: "③ Puesta en marcha y cierre", corto: "Puesta en marcha y cierre" },
];

export function TableroControl({ pedidos }: { pedidos: TarjetaControl[] }) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [columnaActiva, setColumnaActiva] = useState<number | null>(null);

  function soltar(faseDestino: 1 | 2 | 3) {
    setColumnaActiva(null);
    const pedido = pedidos.find((p) => p.id === arrastrando);
    setArrastrando(null);
    if (!pedido || faseDestino === pedido.fase) return;

    if (faseDestino < pedido.fase) {
      toast.info("Ese pedido ya completó esa fase", {
        description: "No se retrocede: lo hecho queda registrado con su fecha y su autor.",
      });
      return;
    }

    const faltan = pedido.faltantesHasta[faseDestino] ?? [];
    const destino = FASES.find((f) => f.numero === faseDestino)?.corto ?? "esa fase";
    toast.warning(`Todavía no puede pasar a ${destino}`, {
      // La alertita que pidió Santos: no un «no se puede», sino QUÉ falta.
      // La tarjeta saltará sola en cuanto estos pasos se marquen en la ficha.
      description:
        faltan.length > 0
          ? `Falta: ${faltan.join(" · ")}. Márquelos en la ficha del pedido y la tarjeta pasa sola.`
          : "Complete los pasos de su fase actual y la tarjeta pasa sola.",
      duration: 9000,
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {FASES.map((fase) => {
        const lista = pedidos.filter((p) => p.fase === fase.numero);
        return (
          <div
            key={fase.numero}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setColumnaActiva(fase.numero);
            }}
            onDragLeave={() => setColumnaActiva((c) => (c === fase.numero ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              soltar(fase.numero);
            }}
            className={cn(
              "rounded-xl border bg-secondary/30 p-3 transition-colors",
              columnaActiva === fase.numero && arrastrando
                ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20"
                : "border-border",
            )}
          >
            <div className="mb-2.5 flex items-center justify-between px-1">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-foreground">{fase.titulo}</h3>
              <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {lista.length}
              </span>
            </div>

            {lista.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">Nada en esta fase</p>
            ) : (
              <div className="space-y-2">
                {lista.map((p) => (
                  <Tarjeta
                    key={p.id}
                    pedido={p}
                    arrastrando={arrastrando === p.id}
                    onDragStart={() => setArrastrando(p.id)}
                    onDragEnd={() => {
                      setArrastrando(null);
                      setColumnaActiva(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Tarjeta({
  pedido: p,
  arrastrando,
  onDragStart,
  onDragEnd,
}: {
  pedido: TarjetaControl;
  arrastrando: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const siguiente = FASES.find((f) => f.numero === p.fase + 1);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:bg-accent/40 active:cursor-grabbing",
        p.frena?.grave ? "border-amber-400/60" : "border-border",
        arrastrando && "opacity-50 ring-2 ring-primary/40",
      )}
    >
      <Link href={`/postventa/pedidos/${p.id}`} className="absolute inset-0 rounded-lg" aria-label={`Abrir el pedido de ${p.cliente}`} />

      <p className="line-clamp-1 text-sm font-semibold text-foreground">{p.cliente}</p>
      <p className="line-clamp-1 text-xs text-muted-foreground">{p.equipo}</p>

      {/* El avance se abre como checklist DE SU FASE (Santos: «debería salir
          solo la parte que le corresponde») — el circuito entero es de la
          ficha. <details> nativo: accesible y sin estado que perder. */}
      <details className="group relative z-10 mt-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <span
              className={cn("block h-full", p.pct === 100 ? "bg-[#1E7F4F]" : "bg-primary")}
              style={{ width: `${p.pct}%` }}
            />
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {p.hechos}/{p.total}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 rounded-md border border-border bg-secondary/40 p-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Lo que falta en esta fase
          </p>
          <ul className="space-y-1">
            {p.pasosFase.map((paso) => (
              <li key={paso.etiqueta} className="flex items-start gap-1.5 text-[11px] leading-snug">
                {paso.hecho ? (
                  <Check className="mt-px size-3 flex-none text-[#1E7F4F]" />
                ) : paso.trabado ? (
                  <OctagonAlert className="mt-px size-3 flex-none text-amber-600" />
                ) : (
                  <CircleDashed className="mt-px size-3 flex-none text-muted-foreground/60" />
                )}
                <span className={paso.hecho ? "text-muted-foreground" : "text-foreground"}>
                  {paso.etiqueta}
                  {!paso.hecho && <span className="text-muted-foreground"> · {paso.trabado ?? paso.dueno}</span>}
                </span>
              </li>
            ))}
          </ul>
          {siguiente && (
            <p className="mt-2 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
              Al completarlos, la tarjeta pasa sola a {siguiente.titulo}.
            </p>
          )}
        </div>
      </details>

      {p.frena ? (
        <p
          className={cn(
            "mt-2 flex items-start gap-1.5 text-xs",
            p.frena.grave ? "font-semibold text-amber-800" : "text-muted-foreground",
          )}
        >
          {p.frena.grave ? (
            <OctagonAlert className="mt-0.5 size-3.5 flex-none" />
          ) : (
            <CircleDashed className="mt-0.5 size-3.5 flex-none" />
          )}
          <span>
            {p.frena.texto} · <b>{p.frena.dueno}</b>
          </span>
        </p>
      ) : (
        <p className="mt-2 text-xs font-semibold text-[#1E7F4F]">Listo para cerrar</p>
      )}

      {p.fechaDespacho && <p className="mt-1.5 text-[11px] text-muted-foreground">Despacho: {p.fechaDespacho}</p>}

      {p.puedeAprobar && (
        <div className="relative z-10 mt-2">
          <AprobarPedidoBoton servicioId={p.id} />
        </div>
      )}
    </div>
  );
}
