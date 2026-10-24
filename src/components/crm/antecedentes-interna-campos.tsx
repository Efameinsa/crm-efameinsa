"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ETIQUETA_GARANTIA_INTERNA,
  ETIQUETA_MANTENIMIENTO_INTERNO,
  ETIQUETA_SERVICIO_EN_PLANTA,
  ETIQUETA_SI_NO_VERIFICAR,
  type AntecedentesInterna,
  type GarantiaInterna,
  type MantenimientoInterno,
  type ServicioEnPlanta,
  type SiNoVerificar,
} from "@/lib/apertura-interna";

/** Los antecedentes del servicio interno (0566): lo que el técnico necesita saber antes de abrir el equipo. */
export function AntecedentesInternaCampos({ valor, cambiar }: { valor: AntecedentesInterna; cambiar: (c: Partial<AntecedentesInterna>) => void }) {
  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const siNo = (
    clave: "problemas" | "vendido_repuesto" | "repuesto_cambiado",
    detalle: "problemas_detalle" | "vendido_repuesto_detalle" | "repuesto_cambiado_detalle",
    titulo: string,
  ) => (
    <div className="grid gap-1 sm:col-span-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-2">
      <Label className="text-xs">{titulo}</Label>
      <div className="flex gap-2">
        <select className={`${select} w-36 shrink-0`} value={valor[clave]} onChange={(e) => cambiar({ [clave]: e.target.value as SiNoVerificar })}>
          {(Object.keys(ETIQUETA_SI_NO_VERIFICAR) as SiNoVerificar[]).map((k) => (
            <option key={k} value={k}>
              {ETIQUETA_SI_NO_VERIFICAR[k]}
            </option>
          ))}
        </select>
        <Input value={valor[detalle] ?? ""} onChange={(e) => cambiar({ [detalle]: e.target.value })} placeholder="Cuál y cuándo" disabled={valor[clave] === "no"} />
      </div>
    </div>
  );
  return (
    <div className="grid gap-2.5 rounded-md border border-primary/30 bg-primary/5 p-3 sm:col-span-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="text-xs font-semibold text-foreground">Antecedentes del equipo (servicio interno)</p>
        <p className="text-[11px] text-muted-foreground">
          Sale en la hoja de la apertura y queda en «Antecedentes del equipo» de la máquina. Lo que ya se sabía viene propuesto: revíselo.
        </p>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label className="text-xs">
          Servicio que se le hace en planta <span className="text-destructive">*</span>
        </Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(ETIQUETA_SERVICIO_EN_PLANTA) as Exclude<ServicioEnPlanta, "">[]).map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs ${valor.servicio === k ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent"}`}
            >
              <input type="radio" name="servicio-en-planta" className="accent-primary" checked={valor.servicio === k} onChange={() => cambiar({ servicio: k })} />
              <span className="font-medium">{ETIQUETA_SERVICIO_EN_PLANTA[k]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label className="text-xs">
          Problema: por qué viene a planta y qué se necesita que se ejecute <span className="text-destructive">*</span>
        </Label>
        <Textarea
          rows={2}
          value={valor.que_ejecutar}
          onChange={(e) => cambiar({ que_ejecutar: e.target.value })}
          placeholder="Ej.: la secadora no calienta: revisar quemador y válvula de gas, probar con carga"
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha de compra</Label>
        <Input type="date" value={valor.fecha_compra ?? ""} onChange={(e) => cambiar({ fecha_compra: e.target.value || null })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha de puesta en marcha</Label>
        <Input type="date" value={valor.fecha_puesta_marcha ?? ""} onChange={(e) => cambiar({ fecha_puesta_marcha: e.target.value || null })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha del primer mantenimiento</Label>
        <Input type="date" value={valor.fecha_primer_mantenimiento ?? ""} onChange={(e) => cambiar({ fecha_primer_mantenimiento: e.target.value || null })} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fecha del último mantenimiento correctivo</Label>
        <Input
          type="date"
          value={valor.fecha_mantenimiento_correctivo ?? ""}
          onChange={(e) => cambiar({ fecha_mantenimiento_correctivo: e.target.value || null })}
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">N.º de guía</Label>
        <Input value={valor.guia_remision ?? ""} onChange={(e) => cambiar({ guia_remision: e.target.value })} placeholder="Ej.: EG07-921" />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label className="text-xs">¿Está en garantía?</Label>
        <select className={select} value={valor.garantia} onChange={(e) => cambiar({ garantia: e.target.value as GarantiaInterna })}>
          {(Object.keys(ETIQUETA_GARANTIA_INTERNA) as GarantiaInterna[]).map((k) => (
            <option key={k} value={k}>
              {ETIQUETA_GARANTIA_INTERNA[k]}
            </option>
          ))}
        </select>
      </div>
      {siNo("problemas", "problemas_detalle", "¿Tuvo algún problema antes?")}
      {siNo("vendido_repuesto", "vendido_repuesto_detalle", "¿Se le vendió repuesto?")}
      <div className="grid gap-1 sm:col-span-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-2">
        <Label className="text-xs">¿Se le vendió mantenimiento?</Label>
        <div className="flex gap-2">
          <select className={`${select} w-44 shrink-0`} value={valor.mantenimiento} onChange={(e) => cambiar({ mantenimiento: e.target.value as MantenimientoInterno })}>
            {(Object.keys(ETIQUETA_MANTENIMIENTO_INTERNO) as MantenimientoInterno[]).map((k) => (
              <option key={k} value={k}>
                {ETIQUETA_MANTENIMIENTO_INTERNO[k]}
              </option>
            ))}
          </select>
          <Input
            value={valor.mantenimiento_detalle ?? ""}
            onChange={(e) => cambiar({ mantenimiento_detalle: e.target.value })}
            placeholder="Cuándo y qué se hizo"
            disabled={valor.mantenimiento === "ninguno"}
          />
        </div>
      </div>
      {siNo("repuesto_cambiado", "repuesto_cambiado_detalle", "¿Se cambió algún repuesto?")}
    </div>
  );
}
