"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleDashed, Loader2, X } from "lucide-react";
import { cerrarVisitaPlanta } from "@/lib/acciones/visitas-planta";
import { cn } from "@/lib/utils";

/**
 * EL CIRCUITO DE LA VISITA, en una línea (0256). Es el mismo dibujo que el
 * circuito de la atención: cada paso dice quién lo hace y si ya pasó. Carlos,
 * 18-09: «hay que mapearlo… va a aliviar muchas cosas». Los pasos que no se
 * pidieron (lavandería, film, TV) no aparecen.
 *
 *   Anunciada → Vigilancia avisada → Preparada → Llegó → Atendida y registrada → Re-embalada
 */
export interface VisitaCircuito {
  id: string;
  persona: string;
  empresa: string;
  registrado_at: string;
  impreso_at: string | null;
  showroom?: boolean;
  quitar_film?: boolean;
  prender_tv?: boolean;
  showroom_listo_at?: string | null;
  film_retirado_at?: string | null;
  tv_listo_at?: string | null;
  llego_at?: string | null;
  no_vino_at?: string | null;
  reembalado_at?: string | null;
  cerrada_at?: string | null;
  resultado?: string | null;
  resultado_nota?: string | null;
  cancelada_at: string | null;
}

export const ETIQUETA_RESULTADO: Record<string, string> = {
  compro: "Compró / cerró",
  pide_cotizacion: "Pide cotización",
  evaluando: "Queda evaluando",
  recogio: "Recogió repuesto o documento",
  pago: "Vino a pagar",
  solo_miro: "Solo miró",
  no_vino: "No vino",
};

const horaDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }) : "";

export function CircuitoVisita({ visita: v, compacto = false }: { visita: VisitaCircuito; compacto?: boolean }) {
  const preparacionPedida = Boolean(v.showroom || v.quitar_film || v.prender_tv);
  const preparada =
    preparacionPedida &&
    (!v.showroom || Boolean(v.showroom_listo_at)) &&
    (!v.quitar_film || Boolean(v.film_retirado_at)) &&
    (!v.prender_tv || Boolean(v.tv_listo_at));
  const reembalajePedido = Boolean(v.showroom || v.quitar_film);
  const pasos: { clave: string; texto: string; quien: string; hecho: string | null | undefined; omitido?: boolean }[] = [
    { clave: "anunciada", texto: "Anunciada", quien: "comercial / postventa", hecho: v.registrado_at },
    { clave: "vigilancia", texto: "Vigilancia avisada", quien: "Central", hecho: v.impreso_at },
    ...(preparacionPedida ? [{ clave: "preparada", texto: "Preparada", quien: "almacén", hecho: preparada ? (v.tv_listo_at ?? v.film_retirado_at ?? v.showroom_listo_at) : null }] : []),
    v.no_vino_at
      ? { clave: "llego", texto: "No vino", quien: "Central", hecho: v.no_vino_at }
      : { clave: "llego", texto: "Llegó", quien: "Central", hecho: v.llego_at },
    { clave: "cerrada", texto: v.resultado ? ETIQUETA_RESULTADO[v.resultado] ?? "Registrada" : "Atendida y registrada", quien: "quien la atendió", hecho: v.cerrada_at },
    ...(reembalajePedido ? [{ clave: "reembalada", texto: "Vuelto a embalar", quien: "almacén", hecho: v.reembalado_at }] : []),
  ];
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1 gap-y-1", compacto ? "text-[10px]" : "text-[11px]")}>
      {pasos.map((p, i) => (
        <li key={p.clave} className="flex items-center gap-1">
          <span
            title={p.hecho ? `${p.texto} · ${horaDe(p.hecho)}` : `${p.texto} · lo marca ${p.quien}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium",
              p.hecho
                ? p.clave === "llego" && v.no_vino_at
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-[#1E7F4F]/30 bg-[#1E7F4F]/10 text-[#1E7F4F]"
                : "border-dashed border-border text-muted-foreground",
            )}
          >
            {p.hecho ? p.clave === "llego" && v.no_vino_at ? <X className="size-3" /> : <Check className="size-3" /> : <CircleDashed className="size-3" />}
            {p.texto}
          </span>
          {i < pasos.length - 1 && <span className="text-border">→</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * «Registrar la visita»: cómo terminó. Es lo que la clase 2 de la inducción
 * pide al final («una visita que no se registra, para la empresa no
 * ocurrió»): el resultado escribe la gestión en la oportunidad del cliente.
 */
export function CerrarVisitaBoton({ visita: v, compacto = false }: { visita: VisitaCircuito; compacto?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<string>("pide_cotizacion");
  const [nota, setNota] = useState("");
  const [pendiente, startTransition] = useTransition();
  if (v.cerrada_at || v.cancelada_at) return null;

  function guardar() {
    startTransition(async () => {
      const r = await cerrarVisitaPlanta(v.id, resultado, nota);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(r.oportunidadId ? "Visita registrada: quedó como gestión en la oportunidad del cliente." : "Visita registrada.");
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md font-semibold text-primary-foreground hover:opacity-90",
          v.llego_at ? "bg-primary" : "bg-primary/80",
          compacto ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
        )}
      >
        Registrar la visita (resultado)
      </button>
    );
  }
  return (
    <div className="mt-1.5 w-full rounded-lg border border-primary/30 bg-primary/5 p-2.5">
      <p className="mb-1.5 text-xs font-semibold">¿Cómo terminó la visita de {v.persona}?</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(ETIQUETA_RESULTADO).map(([k, texto]) => (
          <button
            key={k}
            type="button"
            onClick={() => setResultado(k)}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", resultado === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary")}
          >
            {texto}
          </button>
        ))}
      </div>
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        maxLength={400}
        placeholder="Qué vio, qué le interesó, qué quedó pendiente (una o dos líneas)"
        className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={guardar} disabled={pendiente} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Guardar
        </button>
        <button type="button" onClick={() => setAbierto(false)} disabled={pendiente} className="text-xs text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}
