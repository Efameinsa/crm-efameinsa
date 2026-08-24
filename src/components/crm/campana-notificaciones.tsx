"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { marcarNotificacionLeida, marcarTodasLeidas } from "@/lib/acciones/notificaciones";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fechaLima } from "@/lib/fechas";

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  url: string | null;
  leida_at: string | null;
  created_at: string;
}

function tiempoRelativo(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return fechaLima(iso);
}

export function CampanaNotificaciones({ userId }: { userId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const noLeidas = notificaciones.filter((n) => !n.leida_at).length;

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("notificaciones")
      .select("id, tipo, titulo, cuerpo, url, leida_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (data) setNotificaciones(data);
      });

    const canal = supabase
      .channel("notificaciones-propias")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones", filter: `user_id=eq.${userId}` },
        (payload) => {
          const nueva = payload.new as Notificacion;
          setNotificaciones((prev) => [nueva, ...prev].slice(0, 15));
          toast(nueva.titulo, { description: nueva.cuerpo ?? undefined });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId]);

  useEffect(() => {
    function alClickearFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClickearFuera);
    return () => document.removeEventListener("mousedown", alClickearFuera);
  }, []);

  async function alClickearNotificacion(n: Notificacion) {
    if (!n.leida_at) {
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida_at: new Date().toISOString() } : x)));
      await marcarNotificacionLeida(n.id);
    }
    setAbierto(false);
    if (n.url) router.push(n.url);
  }

  async function alMarcarTodas() {
    setNotificaciones((prev) => prev.map((x) => ({ ...x, leida_at: x.leida_at ?? new Date().toISOString() })));
    await marcarTodasLeidas();
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="relative flex items-center justify-center rounded-md border border-border p-2 text-foreground transition-colors hover:bg-accent"
        aria-label={`Notificaciones${noLeidas > 0 ? `, ${noLeidas} sin leer` : ""}`}
      >
        <Bell className="size-4" />
        {noLeidas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notificaciones</span>
            {noLeidas > 0 && (
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary" onClick={alMarcarTodas}>
                Marcar todas como leídas
              </Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin notificaciones todavía.</p>
            ) : (
              notificaciones.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => alClickearNotificacion(n)}
                  className="flex w-full gap-2.5 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-accent"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 flex-none rounded-full",
                      n.leida_at ? "bg-border" : "bg-primary",
                    )}
                  />
                  <div className="min-w-0">
                    <p className={cn("text-xs leading-snug", !n.leida_at && "text-foreground", n.leida_at && "text-muted-foreground")}>
                      <span className="font-semibold text-foreground">{n.titulo}</span>
                      {n.cuerpo ? ` ${n.cuerpo}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{tiempoRelativo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
