"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { cn } from "@/lib/utils";
import type { EtapaOportunidad } from "@/types/database";

// Filtros de "Mis oportunidades" (docs/10-plan-ajustes-reunion-21-08.md,
// Bloque A). Todo vive en la URL — mismo patrón que FiltrosClientes /
// FiltroPeriodo — para que la vista sea compartible y el botón "atrás"
// funcione. La vista Tabla trae sus propios filtros (etapa, empresa/persona,
// "para retomar", orden); la vista Kanban no los usa: es un tablero de
// trabajo diario acotado a lo nacido en el CRM (ver comentario en page.tsx).

// Las etapas del trabajo. «historico» NO está acá: es el archivo de los Excel
// (0130) y va aparte, al final de la fila, para que se lea como lo que es —un
// cajón donde buscar— y no como una etapa más del embudo.
const ETAPAS: EtapaOportunidad[] = [
  "asignada",
  "filtrada",
  "cotizada",
  "seguimiento",
  "potencial",
  "venta",
  "rechazada",
  "derivada",
];

export function FiltrosOportunidades({
  vista,
  q,
  etapa,
  tipoCliente,
  desde,
  hasta,
  soloCrm,
  orden,
  conteos,
  totalGeneral,
  enHistorico = 0,
}: {
  vista: "tabla" | "kanban";
  q: string;
  etapa: string | null;
  tipoCliente: "empresa" | "persona" | null;
  desde: string | null;
  hasta: string | null;
  soloCrm: boolean;
  orden: string;
  conteos: Record<string, number>;
  totalGeneral: number;
  /** Cuántas hay archivadas (0130); 0 esconde la pestaña. */
  enHistorico?: number;
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
    <div className="relative space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por cliente…"
            className="pl-9"
          />
        </div>

        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["tabla", "kanban"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => navegar({ vista: v === "tabla" ? null : v })}
              className={cn(
                "px-3.5 py-1.5 text-xs capitalize transition-colors",
                vista === v ? "bg-foreground text-background font-semibold" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {vista === "tabla" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip activo={etapa === null} onClick={() => navegar({ etapa: null })}>
              Todas ({totalGeneral.toLocaleString("es-PE")})
            </Chip>
            {ETAPAS.filter((e) => conteos[e]).map((e) => (
              <Chip key={e} activo={etapa === e} onClick={() => navegar({ etapa: e })}>
                <EtapaBadge etapa={e} /> <span className="ml-1 tabular-nums">({conteos[e].toLocaleString("es-PE")})</span>
              </Chip>
            ))}
            {enHistorico > 0 && (
              <>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <Chip
                  activo={etapa === "historico"}
                  onClick={() => navegar({ etapa: etapa === "historico" ? null : "historico" })}
                  titulo="Lo que vino de los Excel y nadie retomó en el CRM. No cuenta como pendiente, pero sigue siendo suyo: acá se busca y desde acá se retoma."
                >
                  <Archive className="mr-1.5 size-3.5" />
                  Histórico <span className="ml-1 tabular-nums">({enHistorico.toLocaleString("es-PE")})</span>
                </Chip>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip activo={tipoCliente === null} onClick={() => navegar({ tipo: null })}>
              Empresas y personas
            </Chip>
            <Chip activo={tipoCliente === "empresa"} onClick={() => navegar({ tipo: "empresa" })}>
              Solo empresas
            </Chip>
            <Chip activo={tipoCliente === "persona"} onClick={() => navegar({ tipo: "persona" })}>
              Solo personas
            </Chip>

            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Para retomar:
              <SelectorFecha
                valor={desde}
                onCambiar={(f) => navegar({ desde: f })}
                max={hasta ?? undefined}
                compacto
                etiquetaVacia="Desde"
              />
              <span>a</span>
              <SelectorFecha
                valor={hasta}
                onCambiar={(f) => navegar({ hasta: f })}
                min={desde ?? undefined}
                compacto
                etiquetaVacia="Hasta"
              />
            </span>

            <label
              className="flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-accent"
              title="Las oportunidades anteriores al CRM se importaron de los Excel de cada comercial. Actívelo para ver solo lo registrado en el sistema."
            >
              <input
                type="checkbox"
                checked={soloCrm}
                onChange={(e) => navegar({ solo_crm: e.target.checked ? "1" : null })}
                className="size-3.5 cursor-pointer accent-primary"
              />
              Solo CRM
            </label>

            <select
              value={orden}
              onChange={(e) => navegar({ orden: e.target.value === "reciente" ? null : e.target.value })}
              className="ml-auto h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground"
              aria-label="Ordenar por"
            >
              <option value="reciente">Más reciente</option>
              <option value="monto">Mayor monto</option>
              <option value="proxima_accion">Próxima acción</option>
              <option value="cuenta">Cliente A–Z</option>
            </select>
          </div>
        </>
      )}

      {pendiente && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-xl bg-card/60 pr-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3.5 animate-spin" /> Actualizando…
          </span>
        </div>
      )}
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
  titulo,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center rounded-full border px-2.5 text-xs transition-colors",
        activo ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
