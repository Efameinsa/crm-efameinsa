"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { marcarPendiente } from "@/lib/navegacion-pendiente";

/**
 * Buscar mientras se escribe, sin botón «Buscar».
 *
 * Santos, 11-09: en Mi cartera y en Cotizaciones la búsqueda se disparaba al
 * enviar el formulario. Con un retardo de 300 ms después de la última tecla y
 * la tabla atenuándose mientras llega el resultado, se siente como el
 * buscador de un teléfono. Mantiene el resto de los parámetros de la URL
 * (orden, rubro, página vuelve a 1) para que la búsqueda se sume a lo que ya
 * estaba filtrado, y el enlace se pueda compartir.
 *
 * Sigue siendo un campo con `name`: si vive dentro de un formulario GET (Mi
 * cartera), Enter y el botón siguen funcionando igual que antes.
 */
export function BusquedaEnVivo({
  inicial,
  placeholder,
  name = "q",
  autoFocus = false,
}: {
  inicial: string;
  placeholder: string;
  name?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [texto, setTexto] = useState(inicial);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTexto(inicial);
  }, [inicial]);

  useEffect(() => {
    if (texto.trim() === inicial.trim()) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (texto.trim()) params.set(name, texto.trim());
      else params.delete(name);
      params.delete("pagina");
      marcarPendiente();
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="relative min-w-56 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        name={name}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="pl-9 pr-9"
      />
      {pendiente && <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
    </div>
  );
}
