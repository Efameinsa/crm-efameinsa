"use client";

// Quién recibe los WhatsApp de los anuncios cada día de la semana (0261).
// Un select por día; se guarda al elegir. «Nadie» deja ese día en la
// bandeja de Central, como era antes.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { guardarTurnoWhatsapp, type TurnoWhatsapp } from "@/lib/acciones/whatsapp-turnos";
import { DIAS_SEMANA } from "@/lib/whatsapp-turnos-constantes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NADIE = "__nadie__";

export function WhatsappTurnosTabla({
  turnos,
  comerciales,
}: {
  turnos: TurnoWhatsapp[];
  comerciales: { id: string; nombre: string; codigo: string | null }[];
}) {
  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })).getDay();
  const items = [
    { value: NADIE, label: "Nadie (queda en Central)" },
    ...comerciales.map((c) => ({ value: c.id, label: `${c.codigo ? `${c.codigo} · ` : ""}${c.nombre}` })),
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {turnos.map((t) => (
        <FilaTurno key={t.dia_semana} turno={t} items={items} esHoy={t.dia_semana === hoy} />
      ))}
    </div>
  );
}

function FilaTurno({
  turno,
  items,
  esHoy,
}: {
  turno: TurnoWhatsapp;
  items: { value: string; label: string }[];
  esHoy: boolean;
}) {
  const [valor, setValor] = useState(turno.comercial_id ?? NADIE);
  const [guardando, startTransition] = useTransition();

  function cambiar(nuevo: string | null) {
    if (!nuevo || nuevo === valor) return;
    const anterior = valor;
    setValor(nuevo);
    startTransition(async () => {
      const r = await guardarTurnoWhatsapp(turno.dia_semana, nuevo === NADIE ? null : nuevo);
      if (r.error) {
        toast.error(r.error);
        setValor(anterior);
        return;
      }
      toast.success(`${DIAS_SEMANA[turno.dia_semana]}: guardado`);
    });
  }

  return (
    <label className={cn("flex items-center gap-2 rounded-md border border-border px-3 py-2", esHoy && "border-primary/50 bg-primary/5")}>
      <span className="w-20 shrink-0 text-xs font-medium">
        {DIAS_SEMANA[turno.dia_semana]}
        {esHoy && <span className="block text-[10px] font-normal text-primary">hoy</span>}
      </span>
      <Select value={valor} onValueChange={cambiar} items={items} disabled={guardando}>
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {guardando && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
    </label>
  );
}
