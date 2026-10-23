"use client";

import { useEffect, useState } from "react";
import { Check, Map as MapaIcono, Maximize2, MessageCircle } from "lucide-react";
import { abrirChat } from "@/components/crm/chat-flotante";
import { MapaLienzo } from "@/components/crm/mapa-lienzo";
import { resumenDeRuta, type RutaMapa } from "@/lib/mapa-recorrido";
import type { ApurosMapa } from "@/lib/mapa-recorrido-datos";

/**
 * LA SECCIÓN «MAPA» (Santos, 23-10). En la pantalla queda una línea por
 * recorrido: dónde está atascado, a qué área le toca y desde cuándo. Un clic
 * abre el mapa en pantalla completa, con un carril por área como
 * mapa.efameinsa.com (`MapaLienzo`), y ahí está «Apurar a <área>».
 */
export function MapaRecorrido({
  rutas,
  apuros,
  ruta,
  abierto = false,
  noLeidos = {},
}: {
  rutas: RutaMapa[];
  apuros: ApurosMapa;
  ruta: string;
  abierto?: boolean;
  /** Mensajes sin leer del chat de cada ruta («tipo:id»). */
  noLeidos?: Record<string, number>;
}) {
  const [ver, setVer] = useState<number | null>(abierto ? 0 : null);
  // Llegar desde un aviso de «Apurar» («#mapa=tipo:id») abre el mapa en ese recorrido.
  useEffect(() => {
    const abrirDesdeEnlace = () => {
      const m = /^#mapa(?:=(\w+):([\w-]+))?/.exec(window.location.hash);
      if (!m) return;
      const i = m[1] ? rutas.findIndex((r) => r.tipo === m[1] && r.id === m[2]) : 0;
      setVer(Math.max(0, i));
      history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    abrirDesdeEnlace();
    window.addEventListener("hashchange", abrirDesdeEnlace);
    return () => window.removeEventListener("hashchange", abrirDesdeEnlace);
  }, [rutas]);
  if (rutas.length === 0) return null;
  return (
    <div id="mapa" className="scroll-mt-4 rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
        <button type="button" onClick={() => setVer(0)} className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground hover:text-primary">
          <MapaIcono className="size-4 text-primary" />
          Mapa
        </button>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {rutas.map((r, i) => (
            <button key={`${r.tipo}:${r.id}`} type="button" onClick={() => setVer(i)} className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline">
              {r.actual >= 0 ? (
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-red-600" />
                </span>
              ) : (
                <Check className="size-3.5 shrink-0 text-emerald-600" />
              )}
              <span className="truncate">
                <span className="font-semibold text-foreground">{r.titulo.length > 34 ? `${r.titulo.slice(0, 32).trimEnd()}…` : r.titulo}:</span>{" "}
                <span className={r.actual >= 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}>{resumenDeRuta(r)}</span>
              </span>
            </button>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVer(0)}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <Maximize2 className="size-3.5" /> Abrir el mapa
          </button>
          {/* EL CHAT DEL CASO (0592): un canal por caso o pedido con las áreas involucradas. */}
          {rutas
            .filter((r) => r.tipo !== "recepcion")
            .map((r) => {
              const n = noLeidos[`${r.tipo}:${r.id}`] ?? 0;
              return (
                <button
                  key={`chat-${r.tipo}:${r.id}`}
                  type="button"
                  onClick={() => abrirChat(r.tipo as "caso" | "pedido", r.id)}
                  className="relative inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  <MessageCircle className="size-3.5 text-primary" />
                  {r.tipo === "caso" ? "Chat del caso" : rutas.length > 1 ? "Chat de la apertura" : "Chat del pedido"}
                  {n > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{n}</span>}
                </button>
              );
            })}
        </span>
      </div>
      {/* Se monta al abrir: cada vez arranca en el recorrido que se tocó. */}
      {ver !== null && <MapaLienzo key={ver} rutas={rutas} apuros={apuros} ruta={ruta} abierto alCambiar={(v) => !v && setVer(null)} inicial={ver} />}
    </div>
  );
}
