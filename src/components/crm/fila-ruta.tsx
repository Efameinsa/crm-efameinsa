"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  Phone,
  PhoneOff,
  ShoppingCart,
  Wrench,
} from "lucide-react";
import { gestionRapidaRuta, type BotonRuta } from "@/lib/acciones/ruta";
import {
  diasDeAtraso,
  diasEntre,
  estadoCompra,
  estadoLlamada,
  estadoMantenimiento,
  haceCuantoDias,
  mesesDesde,
  type FilaRuta,
} from "@/lib/ruta-mantenimiento";
import { fechaCalendario } from "@/lib/fechas";
import { textoLegible } from "@/lib/texto";
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
 *
 * QUÉ CAMBIÓ EL 29-08. La fila decía todo lo que había que decir, pero en 10 y
 * 11 px y alineado a la derecha: «si compró o no no es tan visible, así como
 * último mantenimiento… son letras pequeñas que no se ven con facilidad», y el
 * enlace «Ficha» era un texto de 11 px al final de una línea de chips. Los tres
 * datos que deciden la llamada —compró, último mantenimiento, última llamada—
 * pasaron a ser tres cuadros con color propio: el rojo o el ámbar se ven de
 * lejos, que es como se recorre una lista de 249 filas. El nombre y el teléfono
 * crecieron a tamaño de lectura, y «Ver ficha» es un botón del mismo porte que
 * los otros tres.
 */

/** El color del borde izquierdo: el semáforo con el que se recorre la lista. */
const BARRA: Record<string, string> = {
  nunca: "bg-destructive",
  vencido: "bg-amber-500",
  al_dia: "bg-emerald-500",
  sin_dato: "bg-border",
};

export function FilaRutaMantenimiento({
  fila,
  hoy,
  cerrada = false,
}: {
  fila: FilaRuta;
  hoy: string;
  /**
   * El cierre ya ocurrió (pestañas «Cotizados» y «Cerrados»). Ahí los tres
   * botones no van: registrar «llamé, no contesta» sobre una venta ya hecha no
   * significa nada, y encima reabriría el seguimiento de algo terminado. En su
   * lugar se muestra lo que de verdad se quiere ver de un cierre: qué se vendió
   * y cuándo.
   */
  cerrada?: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [hecha, setHecha] = useState<string | null>(null);
  const mant = estadoMantenimiento(fila, hoy);
  const compra = estadoCompra(fila, hoy);
  const llamada = estadoLlamada(fila, hoy);
  const atraso = diasDeAtraso(fila, hoy);
  const mesesMant = mesesDesde(fila.ultimoMantenimiento, hoy);
  const diasLlamada = fila.ultimaGestionAt ? diasEntre(fila.ultimaGestionAt.slice(0, 10), hoy) : null;

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
        "flex gap-3 rounded-xl border bg-card p-3.5 transition-colors sm:p-4",
        hecha ? "border-emerald-300 bg-emerald-50/60" : "border-border hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      <span className={cn("w-1.5 flex-none rounded-full", cerrada ? "bg-emerald-500" : BARRA[mant])} aria-hidden />

      <div className="min-w-0 flex-1">
        {/* QUIÉN ES Y A QUÉ NÚMERO SE LE LLAMA */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0 flex-1">
            <Link
              href={`/comercial/oportunidades/${fila.id}`}
              className="break-words text-base font-bold leading-tight text-foreground hover:text-primary hover:underline"
            >
              {fila.razonSocial}
            </Link>
            {/* Una línea y no más: la descripción del equipo que viene del
                Excel a veces trae el presupuesto entero adentro, y en dos
                líneas empuja hacia abajo lo que hay que leer. Se recorta por
                líneas y no con «truncate»: eso último obliga a no cortar nunca
                y el ancho mínimo del texto termina estirando la página entera.
                Completa, en el globo del cursor y en la ficha. */}
            <p
              className="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
              title={[fila.zona, fila.serie && `serie ${fila.serie}`, fila.equipo].filter(Boolean).join(" · ")}
            >
              {fila.zona ?? "sin zona"}
              {fila.serie && ` · serie ${fila.serie}`}
              {fila.equipo && ` · ${fila.equipo}`}
            </p>
          </div>

          {/* El cliente no cambia de dueño: lo que es de ella es la oportunidad
              de mantenimiento (0080 y 0095). Decir de quién es la cuenta evita
              la llamada cruzada y la pelea por la cartera. */}
          {fila.carteraDe && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              cartera de {fila.carteraDe}
            </span>
          )}
        </div>

        {/* El teléfono, en la fila y clicable. Es una campaña de llamadas:
            tenerlo que buscar en la ficha convierte una llamada de dos minutos
            en una de cuatro. El wa.me sale del hábito de la casa —la API de
            WhatsApp es v2, el enlace ya funciona hoy—. */}
        {fila.telefono && !cerrada && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={`tel:${fila.telefono.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Phone className="size-4" />
              {fila.telefono}
            </a>
            <a
              href={`https://wa.me/51${fila.telefono.replace(/\D/g, "").slice(-9)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#128C7E]/30 bg-[#128C7E]/10 px-3 py-1.5 text-sm font-semibold text-[#0d6b5f] transition-colors hover:bg-[#128C7E]/20"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            {fila.contacto && <span className="text-sm text-muted-foreground">{fila.contacto}</span>}
          </div>
        )}

        {/* LOS TRES DATOS QUE DECIDEN LA LLAMADA. Antes eran tres cifras de
            11 px alineadas a la derecha; acá cada uno es un cuadro con su
            rótulo y su color, porque son lo que se lee primero. */}
        <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
          <Indicador
            icono={ShoppingCart}
            rotulo="Compró"
            tono={compra === "sin_dato" ? "apagado" : "neutro"}
            valor={fila.compraAt ? haceCuantoDias(diasEntre(fila.compraAt, hoy)) : "Sin registro"}
            detalle={fila.compraAt ? fechaCalendario(fila.compraAt) : "no consta la venta"}
          />
          <Indicador
            icono={mant === "al_dia" ? CheckCircle2 : mant === "sin_dato" ? Wrench : AlertTriangle}
            rotulo="Último mantenimiento"
            tono={mant === "nunca" ? "alarma" : mant === "vencido" ? "alerta" : mant === "al_dia" ? "bien" : "apagado"}
            valor={
              mant === "nunca"
                ? "NUNCA"
                : mant === "sin_dato"
                  ? "No registrado"
                  : mesesMant != null && mesesMant <= 1
                    ? "Este mes"
                    : `Hace ${mesesMant} meses`
            }
            detalle={
              mant === "nunca"
                ? "compró y no volvió"
                : mant === "sin_dato"
                  ? "el equipo no está fichado"
                  : fechaCalendario(fila.ultimoMantenimiento)
            }
          />
          <Indicador
            icono={Phone}
            rotulo="Última llamada"
            // Sobre una venta ya cerrada el «nunca» no reclama nada: el ámbar
            // ahí sería ruido. Solo pinta en la cola de llamadas.
            tono={llamada === "nunca" && !cerrada ? "alerta" : "neutro"}
            valor={llamada === "nunca" ? "Nunca" : haceCuantoDias(diasLlamada)}
            detalle={
              llamada === "nunca"
                ? "sin gestión todavía"
                : fechaCalendario(fila.ultimaGestionAt!.slice(0, 10))
            }
          />
        </div>

        {fila.ultimaNota && (
          <p className="mt-2 line-clamp-2 max-w-prose text-sm leading-snug text-muted-foreground">
            «{textoLegible(fila.ultimaNota)}»
          </p>
        )}

        {/* LO PENDIENTE Y EL DESENLACE */}
        {!cerrada && (atraso != null || fila.proximaAccion) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {atraso != null && atraso > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 font-bold text-amber-800">
                <CalendarClock className="size-3.5" />
                {atraso} {atraso === 1 ? "día" : "días"} de atraso
              </span>
            )}
            {fila.proximaAccion && (
              <span className="text-muted-foreground">
                {fila.proximaAccion}
                {fila.proximaAccionAt && ` · ${fechaCalendario(fila.proximaAccionAt)}`}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          {cerrada ? (
            <p className="text-sm font-semibold text-foreground">
              {fila.monto != null ? (
                <>
                  {fila.moneda ?? "USD"} {Number(fila.monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                </>
              ) : (
                <span className="font-normal text-muted-foreground">sin monto registrado</span>
              )}
              {fila.cerradaAt && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {fechaCalendario(fila.cerradaAt.slice(0, 10))}
                </span>
              )}
            </p>
          ) : hecha ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="size-4" /> {hecha}
            </p>
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

          <Link
            href={`/comercial/oportunidades/${fila.id}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
          >
            Ver ficha <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

const TONO: Record<string, { caja: string; valor: string; rotulo: string }> = {
  alarma: {
    caja: "border-destructive/30 bg-destructive/10",
    valor: "text-destructive",
    rotulo: "text-destructive/70",
  },
  alerta: {
    caja: "border-amber-500/40 bg-amber-500/10",
    valor: "text-amber-800",
    rotulo: "text-amber-700/80",
  },
  bien: {
    caja: "border-emerald-500/30 bg-emerald-500/10",
    valor: "text-emerald-800",
    rotulo: "text-emerald-700/80",
  },
  neutro: { caja: "border-border bg-muted/40", valor: "text-foreground", rotulo: "text-muted-foreground" },
  apagado: {
    caja: "border-dashed border-border bg-transparent",
    valor: "text-muted-foreground",
    rotulo: "text-muted-foreground/70",
  },
};

/**
 * Un dato de la llamada, del tamaño que se lee sin acercarse a la pantalla.
 *
 * El rótulo va arriba y completo («Último mantenimiento», no «Últ. mant.»):
 * quien entra por primera vez a la ruta —un comercial al que operaciones le
 * acaba de dar acceso— no tiene por qué adivinar la abreviatura.
 */
function Indicador({
  icono: Icono,
  rotulo,
  valor,
  detalle,
  tono,
}: {
  icono: React.ComponentType<{ className?: string }>;
  rotulo: string;
  valor: string;
  detalle?: string | null;
  tono: keyof typeof TONO;
}) {
  const t = TONO[tono];
  return (
    <div className={cn("rounded-lg border px-2.5 py-1.5", t.caja)}>
      <p className={cn("flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide", t.rotulo)}>
        <Icono className="size-3" />
        {rotulo}
      </p>
      <p className={cn("text-sm font-bold leading-tight", t.valor)}>{valor}</p>
      {detalle && <p className="text-[11px] leading-tight text-muted-foreground">{detalle}</p>}
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
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
        destacado
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Icono className="size-4" />}
      {children}
    </button>
  );
}
