"use client";

// LOS DATOS DE LA HOJA DE PROTOCOLO, COMPLETADOS DESDE EL INFORME (0417;
// Ariana, 07-10: el informe como el modelo). Equipo y capacidad, modelo de
// placa, serie, técnico a cargo, quién elaboró y las fechas. Solo en
// pantalla: no sale al imprimir.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { datosDelProtocolo, tecnicoYFechaDeLaPrueba } from "@/lib/acciones/almacen";
import { datosDelProtocoloDeStock } from "@/lib/acciones/protocolo-stock";
import { ElegirTecnico } from "@/components/crm/lista-tecnicos";
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
  repuesto = false,
  kit = false,
  stockId,
  tecnicoGuardado = "",
  tecnicoPropuesto = false,
  otrasHojas = [],
}: {
  itemId: string;
  servicioId: string;
  maquina: Maquina;
  /** Lo que sale hoy en la hoja (guardado o propuesto). */
  valores: DatosHoja;
  faltan: string[];
  /** Pedido de repuestos (0441): la hoja lleva el nombre del repuesto y su código, sin modelo de placa. */
  repuesto?: boolean;
  /** Kit de repuestos (0517): una hoja para todas las piezas, con su nombre y sin código. */
  kit?: boolean;
  /** Protocolo de un equipo en stock (0474): se guarda ahí, no en un pedido. */
  stockId?: string;
  /** El técnico guardado en ESTA hoja (el de `valores` puede venir de otra hoja). */
  tecnicoGuardado?: string;
  /** Esta hoja no tiene técnico propio: muestra el de las otras hojas (Diana, 24-10). */
  tecnicoPropuesto?: boolean;
  /** Las demás hojas del informe que se pueden editar, con su técnico guardado. */
  otrasHojas?: { itemId: string; maquina: Maquina; tecnico: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosHoja>(valores);
  const [pendiente, startTransition] = useTransition();
  // AL CAMBIAR EL TÉCNICO, LAS OTRAS HOJAS LO TOMAN (Diana, 24-10): las que no tienen técnico o
  // tenían el mismo que esta. Una hoja con otro técnico puesto a propósito no se toca.
  const tecnicoNuevo = (datos.tecnico ?? "").trim();
  const alcanzadas = otrasHojas.filter((o) => !o.tecnico || o.tecnico === tecnicoGuardado);
  const ofrecerATodas = !stockId && tecnicoNuevo !== "" && tecnicoNuevo !== tecnicoGuardado && alcanzadas.some((o) => o.tecnico !== tecnicoNuevo);
  const [aTodas, setATodas] = useState(true);
  const campos = kit
    ? CAMPOS.filter((c) => c.clave !== "modelo" && c.clave !== "serie").map((c) =>
        c.clave === "equipo" ? { ...c, etiqueta: "Nombre del kit (sale en el título)", ayuda: "KIT DE INSTALACIÓN A GAS SECADORA GIANT C MAX" } : c,
      )
    : repuesto
    ? CAMPOS.filter((c) => c.clave !== "modelo").map((c) =>
        c.clave === "equipo"
          ? { ...c, etiqueta: "Nombre del repuesto (sale en el título)", ayuda: "VALVULA SOLENOIDE 24V" }
          : c.clave === "serie"
            ? { ...c, etiqueta: "Código del repuesto" }
            : c,
      )
    : CAMPOS;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  if (!abierto)
    return (
      <div className="no-imprimir mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <button type="button" className="font-medium text-[#8B1510] hover:underline" onClick={() => setAbierto(true)}>
          ✎ Completar o corregir los datos de esta hoja
        </button>
        {faltan.length > 0 && <span className="text-amber-700">Falta: {faltan.join(", ")}</span>}
        {tecnicoPropuesto && valores.tecnico && (
          <span className="text-neutral-600">
            Técnico: <b>{valores.tecnico}</b>, como en las otras hojas
          </span>
        )}
      </div>
    );

  return (
    <div className="no-imprimir mt-2 rounded border border-neutral-300 bg-neutral-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        {campos.map((c) => (
          <label key={c.clave} className="text-[11px] font-semibold text-neutral-700">
            {c.etiqueta}
            {c.clave === "tecnico" ? (
              <ElegirTecnico
                value={datos.tecnico ?? ""}
                onChange={(nombre) => setDatos((d) => ({ ...d, tecnico: nombre }))}
                className="mt-0.5"
                claseCampo="h-8 rounded border-neutral-400 bg-white text-[12px] font-normal"
              />
            ) : (
              <input
                type={c.tipo ?? "text"}
                max={c.tipo === "date" ? hoy : undefined}
                placeholder={c.ayuda}
                value={datos[c.clave] ?? ""}
                onChange={(x) => setDatos((d) => ({ ...d, [c.clave]: x.target.value }))}
                className="mt-0.5 block h-8 w-full rounded border border-neutral-400 bg-white px-2 text-[12px] font-normal"
              />
            )}
          </label>
        ))}
      </div>
      {tecnicoPropuesto && (
        <p className="mt-1.5 text-[11px] text-neutral-600">El técnico viene de las otras hojas de este informe; si en esta máquina fue otro, cámbielo.</p>
      )}
      {ofrecerATodas && (
        <label className="mt-2 flex items-center gap-1.5 text-[12px] text-neutral-800">
          <input type="checkbox" checked={aTodas} onChange={(x) => setATodas(x.target.checked)} />
          Poner a <b>{tecnicoNuevo}</b> también en {alcanzadas.length === 1 ? "la otra hoja" : `las otras ${alcanzadas.length} hojas`}
          {alcanzadas.length < otrasHojas.length ? " (las que tienen otro técnico no se tocan)" : ""}
        </label>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pendiente}
          className="rounded bg-[#8B1510] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              const r = stockId
                ? await datosDelProtocoloDeStock(stockId, datos as Record<string, string>)
                : await datosDelProtocolo(itemId, servicioId, maquina, datos as Record<string, string>);
              if (r.error) {
                toast.error(r.error, { duration: 9000 });
                return;
              }
              if (ofrecerATodas && aTodas && alcanzadas.length > 0) {
                const t = await tecnicoYFechaDeLaPrueba(servicioId, alcanzadas.map((o) => ({ id: o.itemId, maquina: o.maquina })), { tecnico: tecnicoNuevo, fecha: "" });
                if (t.error) {
                  toast.error(`Se guardó esta hoja, pero no las otras: ${t.error}`, { duration: 9000 });
                  router.refresh();
                  return;
                }
                toast.success(`Datos guardados; ${tecnicoNuevo} quedó también en ${alcanzadas.length === 1 ? "la otra hoja" : `las otras ${alcanzadas.length} hojas`}`);
                setAbierto(false);
                router.refresh();
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
