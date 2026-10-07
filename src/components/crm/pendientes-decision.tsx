"use client";

import { useState, useTransition } from "react";
import { Hourglass } from "lucide-react";
import { decidirPendiente, type PendienteDecision } from "@/lib/acciones/pendientes-decision";

// Recuadro «Esperan tu decisión» de /observaciones (0411). Vacío no se muestra:
// sin pendientes no hay nada que decidir.
export function PendientesDecision({ pendientes, esAdmin }: { pendientes: PendienteDecision[]; esAdmin: boolean }) {
  if (pendientes.length === 0) return null;
  return (
    <section className="rounded-xl border border-[#B7791F]/50 bg-[#B7791F]/[0.06] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Hourglass className="size-4 text-[#B7791F]" />
        Esperan tu decisión <span className="tabular-nums text-muted-foreground">({pendientes.length})</span>
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Lo demás del buzón se resolvió solo y ya se le respondió a cada persona. Esto necesita que alguien decida.
      </p>
      <ul className="mt-3 space-y-2">
        {pendientes.map((p) => (
          <Fila key={p.id} p={p} esAdmin={esAdmin} />
        ))}
      </ul>
    </section>
  );
}

function Fila({ p, esAdmin }: { p: PendienteDecision; esAdmin: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{p.titulo}</p>
          {p.detalle && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{p.detalle}</p>}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Desde el {new Date(p.created_at).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
            {p.sugerencia_id && (
              <>
                {" · "}
                <a className="underline" href={`/observaciones?ver=${p.sugerencia_id}`}>
                  ver la observación
                </a>
              </>
            )}
          </p>
        </div>
        {esAdmin && !abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
            Ya lo decidí
          </button>
        )}
      </div>
      {abierto && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Qué se decidió (opcional)"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await decidirPendiente({ id: p.id, resolucion: nota });
                setError(r.error);
              })
            }
            className="rounded-md bg-[#8B1510] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="text-xs text-muted-foreground">
            Cancelar
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}
