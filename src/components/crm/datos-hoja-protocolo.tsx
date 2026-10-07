"use client";

// LOS DATOS DE LA HOJA DE PROTOCOLO, COMPLETADOS DESDE EL INFORME (0417;
// Ariana, 07-10: el informe como el modelo). Equipo y capacidad, modelo de
// placa, serie, técnico a cargo, quién elaboró y las fechas. Solo en
// pantalla: no sale al imprimir.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { datosDelProtocolo } from "@/lib/acciones/almacen";
import type { DatosHoja, Maquina } from "@/lib/protocolo-hoja";

const CAMPOS: { clave: keyof DatosHoja; etiqueta: string; tipo?: "date"; ayuda?: string }[] = [
  { clave: "equipo", etiqueta: "Equipo y capacidad", ayuda: "LAVADORA 13 KG" },
  { clave: "modelo", etiqueta: "Modelo (de la placa)", ayuda: "CWG27MDCRS" },
  { clave: "serie", etiqueta: "Serie" },
  { clave: "fecha_ejecucion", etiqueta: "Fecha de ejecución", tipo: "date" },
  { clave: "fecha_informe", etiqueta: "Fecha de informe", tipo: "date" },
  { clave: "tecnico", etiqueta: "Técnico a cargo" },
  { clave: "elaborado", etiqueta: "Elaboración de informe" },
];

export function DatosHojaProtocolo({
  itemId,
  servicioId,
  maquina,
  valores,
  faltan,
}: {
  itemId: string;
  servicioId: string;
  maquina: Maquina;
  /** Lo que sale hoy en la hoja (guardado o propuesto). */
  valores: DatosHoja;
  faltan: string[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosHoja>(valores);
  const [pendiente, startTransition] = useTransition();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  if (!abierto)
    return (
      <div className="no-imprimir mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <button type="button" className="font-medium text-[#8B1510] hover:underline" onClick={() => setAbierto(true)}>
          ✎ Completar o corregir los datos de esta hoja
        </button>
        {faltan.length > 0 && <span className="text-amber-700">Falta: {faltan.join(", ")}</span>}
      </div>
    );

  return (
    <div className="no-imprimir mt-2 rounded border border-neutral-300 bg-neutral-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        {CAMPOS.map((c) => (
          <label key={c.clave} className="text-[11px] font-semibold text-neutral-700">
            {c.etiqueta}
            <input
              type={c.tipo ?? "text"}
              max={c.tipo === "date" ? hoy : undefined}
              placeholder={c.ayuda}
              value={datos[c.clave] ?? ""}
              onChange={(x) => setDatos((d) => ({ ...d, [c.clave]: x.target.value }))}
              className="mt-0.5 block h-8 w-full rounded border border-neutral-400 bg-white px-2 text-[12px] font-normal"
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pendiente}
          className="rounded bg-[#8B1510] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              const r = await datosDelProtocolo(itemId, servicioId, maquina, datos as Record<string, string>);
              if (r.error) {
                toast.error(r.error, { duration: 9000 });
                return;
              }
              toast.success("Datos de la hoja guardados");
              setAbierto(false);
              router.refresh();
            })
          }
        >
          {pendiente ? <Loader2 className="inline size-3 animate-spin" /> : "Guardar"}
        </button>
        <button type="button" className="text-[12px] text-neutral-600 hover:underline" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
