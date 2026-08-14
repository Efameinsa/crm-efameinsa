"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarEtapa } from "@/lib/acciones/oportunidades";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EtapaOportunidad } from "@/types/database";

const ETAPAS: { valor: EtapaOportunidad; etiqueta: string }[] = [
  { valor: "asignada", etiqueta: "Asignada" },
  { valor: "filtrada", etiqueta: "Filtrada (procede)" },
  { valor: "seguimiento", etiqueta: "En seguimiento" },
  { valor: "potencial", etiqueta: "Potencial" },
  { valor: "rechazada", etiqueta: "Rechazada" },
  { valor: "derivada", etiqueta: "Derivada" },
];

interface Props {
  oportunidadId: string;
  etapaActual: EtapaOportunidad;
  motivos: { id: number; nombre: string }[];
}

export function CambiarEtapa({ oportunidadId, etapaActual, motivos }: Props) {
  const [etapa, setEtapa] = useState<EtapaOportunidad>(etapaActual);
  const [motivoId, setMotivoId] = useState<string>("");
  const [enviando, startTransition] = useTransition();

  function guardar() {
    if (etapa === "rechazada" && !motivoId) {
      toast.error("Seleccione el motivo del rechazo");
      return;
    }
    startTransition(async () => {
      const resultado = await cambiarEtapa({
        oportunidadId,
        etapa,
        motivoRechazoId: etapa === "rechazada" ? Number(motivoId) : null,
      });
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Etapa actualizada");
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="etapa">Etapa</Label>
        <Select value={etapa} onValueChange={(v) => setEtapa((v as EtapaOportunidad) ?? etapaActual)}>
          <SelectTrigger id="etapa" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ETAPAS.map((e) => (
              <SelectItem key={e.valor} value={e.valor}>
                {e.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {etapa === "rechazada" && (
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo del rechazo</Label>
          <Select value={motivoId} onValueChange={(v) => setMotivoId(v ?? "")}>
            <SelectTrigger id="motivo" className="w-full">
              <SelectValue placeholder="Seleccione…" />
            </SelectTrigger>
            <SelectContent>
              {motivos.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button onClick={guardar} disabled={enviando || etapa === etapaActual}>
        {enviando ? "Guardando…" : "Actualizar etapa"}
      </Button>
    </div>
  );
}
