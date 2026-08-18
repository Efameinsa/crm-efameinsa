"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarEtapa } from "@/lib/acciones/oportunidades";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectConCriterio } from "@/components/crm/select-con-criterio";
import { ETAPA_OPORTUNIDAD, type OpcionConCriterio } from "@/lib/catalogos-ui";
import type { EtapaOportunidad } from "@/types/database";

// "cotizada" y "venta" quedan fuera a propósito: nacen del cotizador y del
// botón Registrar venta, nunca de un cambio manual (ver B3/B9 en la
// memoria del proyecto — evita que alguien "arrastre" una venta sin pasar
// por el flujo que alimenta ultima_venta_at).
const ETAPAS_VALIDAS = new Set<EtapaOportunidad>([
  "asignada", "filtrada", "seguimiento", "potencial", "rechazada", "derivada",
]);
const ETAPAS: OpcionConCriterio[] = ETAPA_OPORTUNIDAD.filter((e) => ETAPAS_VALIDAS.has(e.valor as EtapaOportunidad));

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
        <SelectConCriterio
          id="etapa"
          opciones={ETAPAS}
          value={etapa}
          onValueChange={(v) => setEtapa((v as EtapaOportunidad) ?? etapaActual)}
        />
      </div>

      {etapa === "rechazada" && (
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo del rechazo</Label>
          <SelectConCriterio
            id="motivo"
            opciones={motivos.map((m) => ({ valor: String(m.id), etiqueta: m.nombre, criterio: "" }))}
            value={motivoId}
            onValueChange={setMotivoId}
            placeholder="Seleccione…"
          />
        </div>
      )}

      <Button onClick={guardar} disabled={enviando || etapa === etapaActual}>
        {enviando ? "Guardando…" : "Actualizar etapa"}
      </Button>
    </div>
  );
}
