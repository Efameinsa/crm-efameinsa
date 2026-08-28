"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Loader2, PhoneOff, FileText, CalendarClock } from "lucide-react";
import { gestionRapidaRuta, type BotonRuta } from "@/lib/acciones/ruta";
import { textoMantenimiento, diasDeAtraso, type FilaRuta } from "@/lib/ruta-mantenimiento";
import { fechaCalendario, fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * Una llamada de la campaña, con su desenlace a un clic.
 *
 * Los tres botones no son un menú de opciones: son los tres finales que tiene
 * de verdad una llamada de mantenimiento. Están abajo y siempre visibles porque
 * el trabajo es marcar, escuchar y pulsar — si hubiera que abrir la ficha para
 * registrar, la campaña volvería al cuaderno.
 *
 * «Interesado» no registra y se queda: lleva al cotizador con el cliente ya
 * cargado, que es el momento en que la llamada vale plata. El correlativo es el
 * único de la casa (D7 del plan 16): postventa no numera aparte.
 */
export function FilaRutaMantenimiento({ fila, hoy }: { fila: FilaRuta; hoy: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [hecha, setHecha] = useState<string | null>(null);
  const mant = textoMantenimiento(fila, hoy);
  const atraso = diasDeAtraso(fila, hoy);

  function registrar(boton: BotonRuta, mensaje: string, luego?: () => void) {
    startTransition(async () => {
      const r = await gestionRapidaRuta({ oportunidadId: fila.id, boton });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      setHecha(mensaje);
      toast.success(mensaje);
      if (luego) luego();
      else router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        hecha ? "border-emerald-300 bg-emerald-50/60" : "border-border hover:bg-accent/40",
      )}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-[220px] flex-1">
          <Link
            href={`/comercial/oportunidades/${fila.id}`}
            className="break-words text-sm font-semibold text-foreground hover:underline"
          >
            {fila.razonSocial}
          </Link>
          <p className="text-[11px] text-muted-foreground">
            {fila.zona ?? "sin zona"}
            {/* El cliente no cambia de dueño: lo que es de ella es la
                oportunidad de mantenimiento (0080 y 0095). Decir de quién es la
                cuenta evita la llamada cruzada y la pelea por la cartera. */}
            {fila.carteraDe && ` · cartera de ${fila.carteraDe}`}
            {fila.serie && ` · serie ${fila.serie}`}
          </p>
          {fila.ultimaNota && (
            <p className="mt-1 line-clamp-2 max-w-prose text-xs leading-snug text-muted-foreground">
              «{fila.ultimaNota}»
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-x-4 text-right text-[11px] text-muted-foreground">
          <Dato titulo="Compró">{fila.compraAt ? fechaCalendario(fila.compraAt) : "—"}</Dato>
          <Dato titulo="Últ. mant." alerta={mant.alerta}>
            {mant.alerta && <AlertTriangle className="mr-0.5 inline size-3" />}
            {mant.texto}
          </Dato>
          <Dato titulo="Últ. llamada">{fila.ultimaGestionAt ? fechaLima(fila.ultimaGestionAt) : "nunca"}</Dato>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {hecha ? (
          <p className="text-xs font-medium text-emerald-800">{hecha}</p>
        ) : (
          <>
            <BotonRapido
              icono={PhoneOff}
              pendiente={pendiente}
              onClick={() => registrar("no_contesta", "Anotado: no contesta. Vuelve a la lista mañana.")}
            >
              Llamé, no contesta
            </BotonRapido>
            <BotonRapido
              icono={FileText}
              destacado
              pendiente={pendiente}
              onClick={() =>
                registrar("interesado", "Interesado. Abriendo el cotizador…", () =>
                  router.push(`/comercial/oportunidades/${fila.id}/cotizar`),
                )
              }
            >
              Interesado → cotizar
            </BotonRapido>
            <BotonRapido
              icono={CalendarClock}
              pendiente={pendiente}
              onClick={() => registrar("no_por_ahora", "Anotado. Vuelve a la lista en un mes.")}
            >
              No por ahora
            </BotonRapido>
          </>
        )}

        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {atraso != null && atraso > 0 && (
            <span className="font-medium text-amber-700">{atraso} d de atraso</span>
          )}
          {fila.proximaAccion && (
            <span className="hidden sm:inline">
              {fila.proximaAccion}
              {fila.proximaAccionAt && ` · ${fechaCalendario(fila.proximaAccionAt)}`}
            </span>
          )}
          <Link
            href={`/comercial/oportunidades/${fila.id}`}
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            Ficha <ArrowRight className="size-3" />
          </Link>
        </span>
      </div>
    </div>
  );
}

function Dato({
  titulo,
  alerta,
  children,
}: {
  titulo: string;
  alerta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[72px]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{titulo}</p>
      <p className={cn("font-medium tabular-nums", alerta ? "text-amber-800" : "text-foreground")}>{children}</p>
    </div>
  );
}

function BotonRapido({
  icono: Icono,
  destacado,
  pendiente,
  onClick,
  children,
}: {
  icono: React.ComponentType<{ className?: string }>;
  destacado?: boolean;
  pendiente: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        destacado
          ? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Icono className="size-3.5" />}
      {children}
    </button>
  );
}
