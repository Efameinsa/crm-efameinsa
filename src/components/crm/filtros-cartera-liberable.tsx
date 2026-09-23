"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { marcarPendiente } from "@/lib/navegacion-pendiente";
import { cn } from "@/lib/utils";

/**
 * Filtros de «Cartera liberable»: búsqueda, dueño actual y «solo los que
 * compraron». Todo vive en la URL, como en la lista de clientes, para que el
 * enlace se pueda compartir y «atrás» funcione. La búsqueda sale sola al
 * dejar de escribir.
 */
export function FiltrosCarteraLiberable({
  q,
  comercialId,
  soloConVenta,
  comerciales,
}: {
  q: string;
  comercialId: string | null;
  soloConVenta: boolean;
  comerciales: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navegar(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("pagina");
    marcarPendiente();
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function alEscribir(texto: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      if (texto.trim() !== q) navegar({ q: texto.trim() || null });
    }, 350);
  }

  return (
    <div className="relative rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            defaultValue={q}
            onChange={(e) => alEscribir(e.target.value)}
            placeholder="Buscar por nombre o RUC/DNI…"
            className="pl-9"
          />
        </div>

        <select
          value={comercialId ?? ""}
          onChange={(e) => navegar({ comercial: e.target.value || null })}
          className="h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground"
          aria-label="Cartera de"
        >
          <option value="">De todos los comerciales</option>
          {comerciales.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => navegar({ con_venta: soloConVenta ? null : "1" })}
          title="La mayoría de los liberables son fichas del archivo que nunca compraron"
          className={cn(
            "h-9 cursor-pointer rounded-full border px-3 text-xs transition-colors",
            soloConVenta
              ? "border-primary bg-primary/10 font-semibold text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          Solo los que alguna vez compraron
        </button>
      </div>

      {pendiente && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-xl bg-card/60 pr-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3.5 animate-spin" /> Buscando…
          </span>
        </div>
      )}
    </div>
  );
}
