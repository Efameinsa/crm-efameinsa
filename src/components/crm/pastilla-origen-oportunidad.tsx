import { Globe, Headset, MessageCircle } from "lucide-react";
import type { OrigenOportunidad } from "@/lib/reportes";
import { cn } from "@/lib/utils";

/**
 * ¿ME LA DERIVÓ CENTRAL O ENTRÓ SOLA? (Desiré, C9, 01-10, aprobado por Carlos)
 *
 * «Tengo que entrar uno por uno… quisiera que se vea: viene de WhatsApp, o
 * viene por derivación de Central». Una pastilla chica al lado del cliente,
 * en la Tabla y en la tarjeta del Kanban, con lo que dice la 0362:
 *
 *   · Central     → la registró y asignó Central (llamada, WhatsApp, correo);
 *   · Campaña WA  → chat que abrió un anuncio (meta_ads);
 *   · WhatsApp    → escribió directo al WhatsApp, sin anuncio;
 *   · Web         → formulario de la web o de Google Ads;
 *   · nada        → propia: la abrió el comercial o vino del Excel.
 *
 * El title lleva el canal y la fuente crudos, para quien quiera el detalle
 * sin entrar a la ficha.
 */
export type TipoPastillaOrigen = "central" | "campana_wa" | "whatsapp" | "web";

/** Qué pastilla le toca a una fila; null para las propias (no llevan). */
export function tipoPastillaOrigen(
  origen: OrigenOportunidad | null | undefined,
  via: string | null | undefined,
): TipoPastillaOrigen | null {
  if (origen === "central") return "central";
  if (origen !== "campana") return null;
  const v = (via ?? "").toLowerCase();
  if (v.startsWith("whatsapp")) {
    return v.includes("meta_ads") || v.includes("google_ads") ? "campana_wa" : "whatsapp";
  }
  return "web";
}

const ESTILO: Record<TipoPastillaOrigen, { etiqueta: string; Icono: typeof Globe; color: string }> = {
  central: { etiqueta: "Central", Icono: Headset, color: "border-primary/40 bg-primary/10 text-primary" },
  campana_wa: { etiqueta: "Campaña WA", Icono: MessageCircle, color: "border-violet-300 bg-violet-50 text-violet-900" },
  whatsapp: { etiqueta: "WhatsApp", Icono: MessageCircle, color: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  web: { etiqueta: "Web", Icono: Globe, color: "border-sky-300 bg-sky-50 text-sky-900" },
};

export function PastillaOrigenOportunidad({
  origen,
  via,
  className,
}: {
  origen: OrigenOportunidad | null | undefined;
  via: string | null | undefined;
  className?: string;
}) {
  const tipo = tipoPastillaOrigen(origen, via);
  if (!tipo) return null;
  const { etiqueta, Icono, color } = ESTILO[tipo];
  const titulo = tipo === "central" ? `Derivada por Central${via ? ` · ${via}` : ""}` : `Entró sola${via ? ` · ${via}` : ""}`;

  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold",
        color,
        className,
      )}
      title={titulo}
    >
      <Icono className="size-3" />
      {etiqueta}
    </span>
  );
}
