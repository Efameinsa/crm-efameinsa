"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { cambiarTipoAtencion } from "@/lib/acciones/atenciones";
import {
  AYUDA_TIPO_ATENCION,
  CIRCUITO_POR_TIPO,
  ETIQUETA_ETAPA,
  ETIQUETA_TIPO_ATENCION,
  type TipoAtencion,
} from "@/lib/atenciones";

/**
 * «ESTO ES UNA PUESTA EN MARCHA» (Ariana, 14-09; 0231).
 *
 * Central registra la llamada como problema técnico cuando el cliente en
 * realidad avisa que el equipo llegó y pide su puesta en marcha (BUNGARENA,
 * SIERRA TRAVEL). Con el tipo equivocado el caso entra al circuito que no es.
 *
 * DESDE CUALQUIER TIPO (Carlos, 15-09; 0238): «vamos a suponer que se entrega
 * justo mantenimiento, pero el cliente me dice no, quiero mi puesta en
 * marcha. Lo cambio y me apertura esa secuencia».
 *
 * Y AHORA EL CIRCUITO CAMBIA DE VERDAD (reunión 28-09, 0324): «solo cambia el
 * nombre» fue la queja al reclasificar, porque los cinco tipos recorrían los
 * mismos pasos. Cada tipo tiene su circuito (CIRCUITO_POR_TIPO) y la base
 * acomoda el caso al cambiar; por eso ya no hace falta limitarlo a antes de
 * planificar. Soporte técnico entra como un tipo más.
 */
// Reunión de postventa 13-10 (0456): revisión por garantía, refuerzo de capacitación y «Otro».
const TIPOS: TipoAtencion[] = [
  "problema_tecnico",
  "soporte_tecnico",
  "puesta_en_marcha",
  "revision_garantia",
  "capacitacion",
  "solicitud_mantenimiento",
  "solicitud_repuesto",
  "otro",
];

/** Lo que cambia en el circuito, en una frase, para el aviso. */
function resumenDelCircuito(tipo: TipoAtencion): string {
  const c = CIRCUITO_POR_TIPO[tipo];
  const opcionales = (["diagnostico", "atencion"] as const).filter((e) => c[e] === "opcional").map((e) => ETIQUETA_ETAPA[e].toLowerCase());
  const noVan = (["pruebas", "conformidad"] as const).filter((e) => c[e] === "no_corresponde").map((e) => ETIQUETA_ETAPA[e].toLowerCase());
  const partes = [
    opcionales.length ? `${opcionales.join(" y ")} opcional${opcionales.length > 1 ? "es" : ""}` : null,
    noVan.length ? `sin ${noVan.join(" ni ")}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "circuito completo";
}

export function CambiarTipoAtencion({
  atencionId,
  tipo,
  detalle = null,
  cerrada = false,
  rotulo = "En realidad es otra cosa…",
}: {
  atencionId: string;
  tipo: string;
  /** El texto actual de «Otro». */
  detalle?: string | null;
  /** Una atención cerrada ya no cambia de tipo. */
  cerrada?: boolean;
  rotulo?: string;
}) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  // «Otro» pide el texto antes de cambiar: es el título del caso.
  const [escribiendoOtro, setEscribiendoOtro] = useState(false);
  const [textoOtro, setTextoOtro] = useState(detalle ?? "");
  // Lo que el servidor no dejó cambiar queda escrito al lado (16-10).
  const [problema, setProblema] = useState<string | null>(null);
  if (cerrada) return null;

  const aviso = problema && (
    <span role="alert" className="basis-full rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">
      {problema}
    </span>
  );

  function cambiar(otro: TipoAtencion) {
    if (otro === "otro" && !textoOtro.trim()) {
      setEscribiendoOtro(true);
      return;
    }
    setProblema(null);
    startTransition(async () => {
      const r = await cambiarTipoAtencion({ atencionId, tipo: otro, detalle: otro === "otro" ? textoOtro : null });
      if (r.error) {
        setProblema(r.error);
        return;
      }
      toast.success(`Queda como ${ETIQUETA_TIPO_ATENCION[otro].toLowerCase()}: ${resumenDelCircuito(otro)}.`, { duration: 7000 });
      setAbierto(false);
      setEscribiendoOtro(false);
      router.refresh();
    });
  }

  if (abierto && escribiendoOtro) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <input
          autoFocus
          value={textoOtro}
          onChange={(e) => setTextoOtro(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (textoOtro.trim()) cambiar("otro");
            }
          }}
          maxLength={120}
          placeholder="¿Qué es? (el título del caso)"
          className="h-6 w-56 rounded-md border border-border bg-background px-2 text-[11px] outline-none"
        />
        <button
          type="button"
          disabled={enviando || !textoOtro.trim()}
          onClick={() => cambiar("otro")}
          className="rounded-full border border-primary px-2 py-0.5 text-[11px] font-medium text-primary disabled:opacity-50"
        >
          {enviando ? "Cambiando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setEscribiendoOtro(false)} className="text-[11px] text-muted-foreground hover:underline">
          Volver
        </button>
        {!textoOtro.trim() && (
          <span className="basis-full text-[11px] leading-snug text-muted-foreground">Escriba qué es: será el título del caso.</span>
        )}
        {aviso}
      </span>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        disabled={enviando}
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        title="Central lo registró con este tipo; si el cliente pidió otra cosa, corríjalo acá y el circuito cambia con él"
      >
        <ArrowLeftRight className="size-3" />
        {rotulo}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {TIPOS.filter((t) => t !== tipo || t === "otro").map((valor) => (
        <button
          key={valor}
          type="button"
          disabled={enviando}
          onClick={() => cambiar(valor)}
          title={`${AYUDA_TIPO_ATENCION[valor]} · ${resumenDelCircuito(valor)}`}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {enviando ? "Cambiando…" : valor === "otro" && tipo === "otro" ? "Corregir el texto de «Otro»" : ETIQUETA_TIPO_ATENCION[valor]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setAbierto(false);
          setProblema(null);
        }}
        className="text-[11px] text-muted-foreground hover:underline"
      >
        Cancelar
      </button>
      {aviso}
    </span>
  );
}
