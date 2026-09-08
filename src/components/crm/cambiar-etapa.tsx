"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cambiarEtapa } from "@/lib/acciones/oportunidades";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectConCriterio } from "@/components/crm/select-con-criterio";
import { ETAPAS_DEL_COMBO } from "@/lib/catalogos-ui";
import type { EtapaOportunidad } from "@/types/database";

interface Props {
  oportunidadId: string;
  etapaActual: EtapaOportunidad;
  motivos: { id: number; nombre: string }[];
}

export function CambiarEtapa({ oportunidadId, etapaActual, motivos }: Props) {
  // 24-08: sin este refresh el cambio SÍ se guardaba, pero la pantalla seguía
  // mostrando la etapa vieja —el badge de la cabecera, el tablero, Mi día— hasta
  // recargar a mano. En la capacitación se leyó como «no me quiere actualizar la
  // etapa». revalidatePath invalida la caché del servidor; el cliente necesita
  // que se le diga que vuelva a pedir la página.
  const router = useRouter();
  const [etapa, setEtapa] = useState<EtapaOportunidad>(etapaActual);
  const [motivoId, setMotivoId] = useState<string>("");
  const [enviando, startTransition] = useTransition();

  const esVenta = etapa === "venta";

  function guardar() {
    if (esVenta) return; // no se guarda desde acá: se registra en la cotización
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
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="etapa">Etapa</Label>
        <SelectConCriterio
          id="etapa"
          opciones={ETAPAS_DEL_COMBO}
          value={etapa}
          onValueChange={(v) => setEtapa((v as EtapaOportunidad) ?? etapaActual)}
        />
      </div>

      {/* El camino de verdad, en el mismo lugar donde lo buscó. */}
      {esVenta && (
        <div className="space-y-2 rounded-md border border-[#1E7F4F]/40 bg-[#1E7F4F]/5 p-3">
          <p className="text-sm font-semibold text-foreground">La venta se registra desde su cotización</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Marcar la etapa acá no registraría la venta: no quedaría el monto, ni la cotización aceptada, ni contaría
            en su cierre de la semana. Se hace en <b className="text-foreground">Cotizaciones</b>, con el botón{" "}
            <b className="text-foreground">Registrar venta</b> de la cotización que el cliente aceptó — y la
            oportunidad pasa sola a «Venta».
          </p>
          <a
            href="#cotizador"
            className="inline-flex items-center gap-1 rounded-md bg-[#1E7F4F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
          >
            Ir a las cotizaciones
          </a>
        </div>
      )}

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

      {!esVenta && (
        <Button onClick={guardar} disabled={enviando || etapa === etapaActual}>
          {enviando ? "Guardando…" : "Actualizar etapa"}
        </Button>
      )}
    </div>
  );
}
