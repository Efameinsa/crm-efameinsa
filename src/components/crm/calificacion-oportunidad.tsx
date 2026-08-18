"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { calificarOportunidad } from "@/lib/acciones/oportunidades";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectConCriterio } from "@/components/crm/select-con-criterio";
import { INTENCION_COMPRA } from "@/lib/catalogos-ui";
import { cn } from "@/lib/utils";
import type { Oportunidad } from "@/types/database";

type Intencion = Oportunidad["intencion"];
type Segmento = "industrial" | "semi_industrial";

interface Props {
  oportunidadId: string;
  intencionInicial: Intencion;
  montoInicial: number | null;
  monedaInicial: "PEN" | "USD";
  segmentoInicial: Segmento | null;
}

export function CalificacionOportunidad({
  oportunidadId,
  intencionInicial,
  montoInicial,
  monedaInicial,
  segmentoInicial,
}: Props) {
  const [intencion, setIntencion] = useState<Intencion>(intencionInicial);
  const [monto, setMonto] = useState<string>(montoInicial != null ? String(montoInicial) : "");
  const [moneda, setMoneda] = useState<"PEN" | "USD">(monedaInicial);
  const [segmento, setSegmento] = useState<Segmento | null>(segmentoInicial);
  const [, startTransition] = useTransition();

  function guardar(cambios: Partial<{ intencion: Intencion; monto: string; moneda: "PEN" | "USD"; segmento: Segmento | null }>) {
    const nuevaIntencion = cambios.intencion ?? intencion;
    const nuevoMonto = cambios.monto ?? monto;
    const nuevaMoneda = cambios.moneda ?? moneda;
    const nuevoSegmento = "segmento" in cambios ? cambios.segmento ?? null : segmento;

    startTransition(async () => {
      const resultado = await calificarOportunidad({
        oportunidadId,
        intencion: nuevaIntencion,
        montoEstimado: nuevoMonto ? Number(nuevoMonto) : null,
        moneda: nuevaMoneda,
        segmento: nuevoSegmento,
      });
      if (resultado.error) toast.error(resultado.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="interes-compra">Interés de compra</Label>
        <SelectConCriterio
          id="interes-compra"
          opciones={INTENCION_COMPRA}
          value={intencion}
          onValueChange={(v) => {
            const nueva = v as Intencion;
            setIntencion(nueva);
            guardar({ intencion: nueva });
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="monto-estimado">Monto estimado</Label>
        <div className="flex gap-2">
          <select
            value={moneda}
            onChange={(e) => {
              const v = e.target.value as "PEN" | "USD";
              setMoneda(v);
              guardar({ moneda: v });
            }}
            className="w-20 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="USD">USD</option>
            <option value="PEN">PEN</option>
          </select>
          <Input
            id="monto-estimado"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="tabular-nums"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onBlur={() => guardar({ monto })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Segmento</Label>
        <div className="flex gap-2">
          {(["industrial", "semi_industrial"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                const nuevo = segmento === s ? null : s;
                setSegmento(nuevo);
                guardar({ segmento: nuevo });
              }}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-colors",
                segmento === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {s === "semi_industrial" ? "Semi-industrial" : "Industrial"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
