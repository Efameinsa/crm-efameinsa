"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { conCantidad, detalleKitSiCambio, partirCantidad } from "@/lib/kit";

/**
 * LAS CANTIDADES DEL KIT EN ESTA COTIZACIÓN (gerencia, reunión 06-10 11:01).
 * «Yo me voy a tu lavandería y ya no necesitas 3 metros de ducto, necesitas
 * 10»: se cambia la cantidad de la pieza en ESTE renglón. La ficha del
 * catálogo no cambia ni nace otra; el precio del kit lo ajusta quien cotiza y
 * la cotización pasa por gerencia (0405).
 */
export function CantidadesDelKit({
  piezasFicha,
  detalle,
  onCambio,
}: {
  piezasFicha: string[];
  /** Lo guardado en el renglón; null = las cantidades de la ficha. */
  detalle: string[] | null;
  onCambio: (detalle: string[] | null) => void;
}) {
  // Lo que se está tecleando: dejar el casillero vacío para escribir «10» no debe borrar la pieza.
  const [tecleando, setTecleando] = useState<Record<number, string>>({});
  const actuales = detalle && detalle.length === piezasFicha.length ? detalle : piezasFicha;
  const cambiado = detalle !== null;

  const cambiar = (i: number, numero: string) => {
    const nuevas = actuales.map((linea, j) => {
      if (j !== i) return linea;
      const p = partirCantidad(linea);
      return p ? conCantidad(p, numero) : linea;
    });
    onCambio(detalleKitSiCambio(piezasFicha, nuevas));
  };

  return (
    <div className="mt-2 rounded-md border border-border p-2">
      <p className="text-[11px] font-semibold text-foreground">
        Piezas del kit <span className="font-normal text-muted-foreground">— cambie la cantidad que necesita este cliente</span>
      </p>
      <ul className="mt-1 space-y-1">
        {actuales.map((linea, i) => {
          const p = partirCantidad(linea);
          const base = partirCantidad(piezasFicha[i]);
          if (!p) return null;
          const distinto = base !== null && Number(base.numero.replace(",", ".")) !== Number(p.numero.replace(",", "."));
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate" title={p.texto}>{p.texto}</span>
              <Input
                inputMode="decimal"
                value={tecleando[i] ?? p.numero}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.,]/g, "");
                  setTecleando((t) => ({ ...t, [i]: v }));
                  if (/\d/.test(v)) cambiar(i, v);
                }}
                onBlur={() => setTecleando((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== String(i))))}
                className={`h-7 w-16 text-right text-xs tabular-nums ${distinto ? "border-amber-500 font-semibold" : ""}`}
                aria-label={`Cantidad de ${p.texto}`}
              />
              <span className="w-14 text-[11px] text-muted-foreground">{p.unidad}</span>
            </li>
          );
        })}
      </ul>
      {cambiado && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-amber-800">
            Cantidades cambiadas: ajuste el precio del kit. La cotización pasa por gerencia para aprobarlo.
          </p>
          <button
            type="button"
            onClick={() => onCambio(null)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <RotateCcw className="size-3" /> Volver a las cantidades de la ficha
          </button>
        </div>
      )}
    </div>
  );
}
