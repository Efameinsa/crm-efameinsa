"use client";

// El código del mensaje prellenado del anuncio de WhatsApp (M1-A, M1-B…),
// para cuando el canal elegido es "whatsapp" — fase 1 sin API, 14-09-2026.
// Se elige de una lista, nunca se tipea: así el chip de origen y los informes
// por campaña siempre casan con un código real. Componente aparte porque lo
// usan dos formularios (captura de Central y "Pasar contacto a Central" del
// comercial), y los dos reciben la lista de campañas activas como prop —
// ninguno de los dos hace su propia consulta a la base.

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampaniaWhatsapp } from "@/lib/acciones/whatsapp-campanas";

interface Props {
  campanias: CampaniaWhatsapp[];
  /** Solo tiene sentido mostrarlo cuando el canal elegido es "whatsapp". */
  visible: boolean;
  value: string;
  onChange: (valor: string) => void;
  idBase?: string;
}

export function CampoCampaniaWhatsapp({ campanias, visible, value, onChange, idBase = "campania-wa" }: Props) {
  if (!visible) return null;
  if (campanias.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-secondary/30 p-2 text-xs text-muted-foreground">
        No hay campañas de WhatsApp cargadas todavía. Se puede registrar igual, sin código.
      </p>
    );
  }
  return (
    <div className="campo-campania space-y-1.5">
      <Label htmlFor={idBase}>
        ¿De qué campaña de WhatsApp llegó? <span className="font-normal text-muted-foreground">(si el mensaje traía un código)</span>
      </Label>
      <input type="hidden" name="codigo_campania_wa" value={value} />
      {/* `items`: sin la lista, el Select de Base UI pinta el valor crudo
          («__ninguna») hasta que se abre (Santos lo vio el 24-09). */}
      <Select
        value={value || "__ninguna"}
        onValueChange={(v) => onChange(v === "__ninguna" ? "" : (v ?? ""))}
        items={[{ value: "__ninguna", label: "Sin código / no vino de un anuncio" }, ...campanias.map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.nombre}` }))]}
      >
        <SelectTrigger id={idBase} className="w-full">
          <SelectValue placeholder="Sin código / no vino de un anuncio" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__ninguna">Sin código / no vino de un anuncio</SelectItem>
          {campanias.map((c) => (
            <SelectItem key={c.id} value={c.codigo}>
              {c.codigo} — {c.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
