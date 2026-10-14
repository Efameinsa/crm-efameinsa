"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import Link from "@/components/enlace";

const EXPEDIENTE = /^\/comercial\/oportunidades\/([0-9a-f-]{36})\/?$/i;

/**
 * EL «COTIZAR» DE LA CABECERA, DENTRO DE UN EXPEDIENTE (Moisés, 14-10-2026:
 * «al estar en un prospecto da la opción de cotizar pero al darle click solo te
 * traslada a oportunidades»). Fuera de un expediente lleva a la lista para
 * elegir a quién cotizar, como siempre. Dentro de uno, cotiza a ESE cliente:
 * pulsa el mismo «Nueva cotización» de la tarjeta Cotizaciones, así también
 * pregunta si sigue el borrador que ya tiene (Gabriela, 29-09). Si la tarjeta
 * no tiene el botón, abre el cotizador del expediente.
 */
export function BotonCotizarCabecera({ etiqueta, hrefFuera }: { etiqueta: string; hrefFuera: string }) {
  const ruta = usePathname() ?? "";
  const expediente = ruta.match(EXPEDIENTE)?.[1] ?? null;
  const href = expediente ? `/comercial/oportunidades/${expediente}/cotizar` : hrefFuera;
  return (
    <Link
      href={href}
      title={expediente ? "Cotizar a este cliente" : "Elegir a quién cotizar"}
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
        if (!expediente) return;
        const boton = document.querySelector<HTMLElement>("[data-nueva-cotizacion]");
        if (!boton) return;
        e.preventDefault();
        boton.scrollIntoView({ behavior: "smooth", block: "center" });
        boton.click();
      }}
      className="group inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-md"
    >
      <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" />
      <span className="max-[380px]:hidden">{etiqueta}</span>
    </Link>
  );
}
