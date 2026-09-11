import { Megaphone, Globe, FileText, Sprout } from "lucide-react";
import type { Origen } from "@/lib/campana";
import { cn } from "@/lib/utils";

/**
 * EL CHIP DE ORIGEN: formulario de Google Ads, landing de campaña, web que
 * vino de campaña, o web orgánica (Santos, 11-09: «el circuito tiene que
 * estar bien marcado»). Mismo chip en la bandeja, en los derivados y en la
 * ficha del derivado, para que se lea igual en todas partes.
 *
 * Los colores dicen la plataforma —azul Google, violeta Meta— y el verde
 * dice orgánico: llegó solo, sin costar un clic.
 */
export function ChipOrigen({ origen, className }: { origen: Origen | null; className?: string }) {
  if (!origen) return null;
  const Icono =
    origen.clave === "ads_form" ? FileText : origen.clave === "web_organico" ? Sprout : origen.clave === "landing" ? Megaphone : Globe;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold",
        origen.plataforma === "google" && "border-sky-300 bg-sky-50 text-sky-900",
        origen.plataforma === "meta" && "border-violet-300 bg-violet-50 text-violet-900",
        origen.plataforma === "otra" && "border-amber-300 bg-amber-50 text-amber-900",
        origen.plataforma === null && "border-emerald-300 bg-emerald-50 text-emerald-900",
        className,
      )}
      title={origen.urgente ? "Vino de publicidad pagada: gestionar a la brevedad" : "Se registró en efameinsa.com sin venir de un anuncio"}
    >
      <Icono className="size-3" />
      {origen.etiqueta}
    </span>
  );
}
