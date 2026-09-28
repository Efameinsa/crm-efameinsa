"use client";

import { useState, useTransition } from "react";
import Link from "@/components/enlace";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck } from "lucide-react";
import { marcarNotificacionLeida, marcarTodasLeidas } from "@/lib/acciones/notificaciones";
import { rotuloDeAviso } from "@/components/crm/campana-notificaciones";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AvisoLista {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  url: string | null;
  leida_at: string | null;
  created_at: string;
}

const TONO: Record<string, string> = {
  error: "bg-destructive/10 text-destructive",
  warning: "bg-amber-100 text-amber-900",
  success: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  info: "bg-secondary text-foreground",
};

const dia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });

function nombreDelDia(clave: string, hoy: string, ayer: string) {
  if (clave === hoy) return "Hoy";
  if (clave === ayer) return "Ayer";
  return new Date(`${clave}T12:00:00-05:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" });
}

/** El historial de avisos, agrupado por día. Tocar uno lo marca leído y lleva a su pantalla. */
export function ListaNotificaciones({ avisos, soloSinLeer, sinLeer }: { avisos: AvisoLista[]; soloSinLeer: boolean; sinLeer: number }) {
  const router = useRouter();
  const [leidas, setLeidas] = useState<Set<string>>(new Set());
  const [pendiente, startTransition] = useTransition();
  const [ahora] = useState(() => new Date().getTime());
  const hoy = dia(new Date(ahora).toISOString());
  const ayer = dia(new Date(ahora - 86400000).toISOString());

  const grupos = new Map<string, AvisoLista[]>();
  for (const a of avisos) {
    const k = dia(a.created_at);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(a);
  }

  function abrir(a: AvisoLista) {
    startTransition(async () => {
      if (!a.leida_at && !leidas.has(a.id)) {
        setLeidas((s) => new Set(s).add(a.id));
        await marcarNotificacionLeida(a.id);
      }
      if (a.url) router.push(a.url);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="inline-flex gap-1 rounded-lg border border-border bg-card p-1 text-sm">
          <Link href="/notificaciones" className={cn("rounded-md px-3 py-1.5 font-medium", !soloSinLeer ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
            Todas
          </Link>
          <Link href="/notificaciones?ver=sin-leer" className={cn("rounded-md px-3 py-1.5 font-medium", soloSinLeer ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
            Sin leer · {sinLeer}
          </Link>
        </nav>
        {sinLeer > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                await marcarTodasLeidas();
                router.refresh();
              })
            }
          >
            <CheckCheck className="size-3.5" /> Marcar todas como leídas
          </Button>
        )}
      </div>

      {avisos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {soloSinLeer ? "No tiene avisos sin leer." : "No hay avisos en los últimos 60 días."}
        </p>
      ) : (
        [...grupos.entries()].map(([clave, lista]) => (
          <section key={clave}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground first-letter:uppercase">{nombreDelDia(clave, hoy, ayer)}</p>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {lista.map((a) => {
                const r = rotuloDeAviso(a.tipo);
                const leida = Boolean(a.leida_at) || leidas.has(a.id);
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => abrir(a)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent">
                      <span className={cn("mt-1.5 size-2 flex-none rounded-full", leida ? "bg-border" : "bg-primary")} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", TONO[r.tono])}>{r.encabezado}</span>
                          <span className="text-[11px] text-muted-foreground">{hora(a.created_at)}</span>
                        </p>
                        <p className={cn("mt-1 text-sm leading-snug", leida ? "text-muted-foreground" : "text-foreground")}>
                          <b className="font-semibold">{a.titulo}</b>
                          {a.cuerpo ? ` — ${a.cuerpo}` : ""}
                        </p>
                      </div>
                      {a.url && (
                        <span className="mt-1 inline-flex flex-none items-center gap-1 text-xs font-semibold text-primary">
                          {r.accion} <ArrowRight className="size-3.5" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
