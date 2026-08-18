"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Barra de filtros + paginación de la lista de clientes. Todo vive en la URL
// (q, comercial, con_venta, sin_doc, orden, pagina) para que se pueda
// compartir el enlace y el botón "atrás" funcione. La búsqueda aplica al
// dejar de escribir (350 ms), sin botón "Buscar".

interface OpcionComercial {
  id: string;
  nombre: string;
}

export function FiltrosClientes({
  q,
  comercialId,
  conVenta,
  sinDoc,
  orden,
  comerciales,
}: {
  q: string;
  comercialId: string | null;
  conVenta: boolean;
  sinDoc: boolean;
  orden: string;
  comerciales?: OpcionComercial[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [texto, setTexto] = useState(q);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTexto(q);
  }, [q]);

  function navegar(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    if (!("pagina" in cambios)) params.delete("pagina");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // Búsqueda con retardo: no dispara una navegación por cada tecla.
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => navegar({ q: texto.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="relative rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
            placeholder="Buscar por nombre, RUC/DNI o teléfono…"
            className="pl-9"
          />
        </div>

        {comerciales && (
          <select
            value={comercialId ?? ""}
            onChange={(e) => navegar({ comercial: e.target.value || null })}
            className="h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground"
            aria-label="Comercial"
          >
            <option value="">Todos los comerciales</option>
            {comerciales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}

        <Chip activo={conVenta} onClick={() => navegar({ con_venta: conVenta ? null : "1" })}>
          Solo con compras
        </Chip>
        <Chip activo={sinDoc} onClick={() => navegar({ sin_doc: sinDoc ? null : "1" })}>
          Sin RUC/DNI
        </Chip>

        <select
          value={orden}
          onChange={(e) => navegar({ orden: e.target.value === "recientes" ? null : e.target.value })}
          className="h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground"
          aria-label="Ordenar por"
        >
          <option value="recientes">Más recientes primero</option>
          <option value="nombre">Nombre A–Z</option>
          <option value="ultima_venta">Última venta</option>
          <option value="valor">Mayor valor comprado</option>
        </select>
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

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 cursor-pointer rounded-full border px-3 text-xs transition-colors",
        activo ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Paginacion({ pagina, totalPaginas, total, desde, hasta }: { pagina: number; totalPaginas: number; total: number; desde: number; hasta: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  function ir(p: number) {
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete("pagina");
    else params.set("pagina", String(p));
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: true }));
  }

  if (totalPaginas <= 1) {
    return (
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString("es-PE")} cliente{total === 1 ? "" : "s"}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <p>
        Mostrando <b className="text-foreground">{desde.toLocaleString("es-PE")}–{hasta.toLocaleString("es-PE")}</b> de{" "}
        <b className="text-foreground">{total.toLocaleString("es-PE")}</b>
        {pendiente && <Loader2 className="ml-2 inline size-3.5 animate-spin" />}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => ir(pagina - 1)}
          disabled={pagina <= 1}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" /> Anterior
        </button>
        <span className="px-2 tabular-nums">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          onClick={() => ir(pagina + 1)}
          disabled={pagina >= totalPaginas}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
