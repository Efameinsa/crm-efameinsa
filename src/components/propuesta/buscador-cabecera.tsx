"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

/**
 * EL BUSCADOR DE ARRIBA BUSCA EN LA PANTALLA EN QUE ESTÁ (Almacén, 20-10:
 * «se selecciona Aperturas de postventa y al colocar el nombre de la empresa
 * no sale ninguna opción, asimismo se pasa a la opción de Pedidos»). Cada
 * perfil busca en un solo lugar (BUSCAR_EN); las pantallas de esta lista
 * tienen su propio buscador y Enter se queda en ellas.
 */
const BUSCAN_AQUI: { prefijo: string; ayuda: string }[] = [
  { prefijo: "/almacen/aperturas-postventa", ayuda: "Cliente, equipo o N.º de pedido de la apertura" },
];

export function BuscadorCabecera({ href, ayuda }: { href: string; ayuda: string }) {
  const pathname = usePathname() ?? "";
  const aqui = BUSCAN_AQUI.find((b) => pathname.startsWith(b.prefijo));
  return (
    <form
      key={aqui?.prefijo ?? href}
      action={aqui?.prefijo ?? href}
      method="get"
      className="order-last flex min-w-0 basis-full items-center gap-2 sm:order-none sm:min-w-64 sm:max-w-xl sm:flex-1 sm:basis-auto rounded-lg border border-border bg-secondary/60 px-3 py-1.5 transition-all duration-200 focus-within:border-[var(--c-marca)] focus-within:bg-card focus-within:ring-4 focus-within:ring-[var(--c-marca)]/15"
    >
      <Search className="size-4 text-muted-foreground" />
      <input
        id="buscar-global"
        name="q"
        placeholder={`Buscar: ${aqui?.ayuda ?? ayuda}`}
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        autoComplete="off"
      />
    </form>
  );
}
