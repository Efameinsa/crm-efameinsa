"use client";

import { useState } from "react";
import { CheckCheck, Lock, MessageCircle } from "lucide-react";
import { abrirChat } from "@/components/crm/chat-flotante";
import { useMisChats } from "@/lib/mis-chats";
import type { ChatResumen } from "@/lib/chat";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" });
const cuando = (iso: string) => (fechaLima(iso) === fechaLima(new Date().toISOString()) ? hora(iso) : `${fechaLima(iso)} ${hora(iso)}`);

/** La lista de /chats: abiertos y cerrados, con el último mensaje y su visto con nombre (0599). */
export function ListaDeChats({ inicial }: { inicial: ChatResumen[] }) {
  const vivo = useMisChats();
  const chats = vivo.cargado ? vivo.chats : inicial;
  const [ver, setVer] = useState<"abiertos" | "cerrados">("abiertos");
  const abiertos = chats.filter((c) => !c.cerradoAt);
  const cerrados = chats.filter((c) => c.cerradoAt);
  const lista = ver === "abiertos" ? abiertos : cerrados;

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
        {(
          [
            ["abiertos", `Abiertos (${abiertos.length})`],
            ["cerrados", `Cerrados (${cerrados.length})`],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setVer(k)}
            className={cn("rounded-md px-3 py-1.5 font-medium", ver === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {ver === "abiertos"
            ? "No tiene chats abiertos. Un chat empieza con «Chat del caso» o «Chat del pedido» en la sección Mapa de un caso o un pedido."
            : "Todavía no se cerró ningún caso o pedido con conversación."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {lista.map((c) => (
            <li key={`${c.tipo}:${c.id}`}>
              <button type="button" onClick={() => abrirChat(c.tipo, c.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50">
                <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", c.cerradoAt ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                  {c.cerradoAt ? <Lock className="size-4" /> : <MessageCircle className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate text-sm", c.noLeidos > 0 ? "font-bold text-foreground" : "font-semibold text-foreground/90")}>
                      {c.cliente}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {c.tipo === "caso" ? "Caso" : "Pedido"} {c.codigo ?? ""} · {c.participantes} en el canal
                      </span>
                    </span>
                    {c.ultimo && <span className="shrink-0 text-[11px] text-muted-foreground">{cuando(c.ultimo.at)}</span>}
                  </span>
                  {c.ultimo && (
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", c.noLeidos > 0 ? "text-foreground" : "text-muted-foreground")}>
                        <b className="font-semibold">{c.ultimo.mio ? "Usted" : c.ultimo.autor}:</b> {c.ultimo.clase === "apuro" ? `📳 apuró ${c.ultimo.texto}` : c.ultimo.texto}
                      </span>
                      {c.noLeidos > 0 && <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{c.noLeidos}</span>}
                    </span>
                  )}
                  {c.ultimo && c.ultimo.clase !== "sistema" && (c.vistos.length > 0 || c.sinVer.length > 0) && (
                    <span className="mt-1 block text-[11px]">
                      {c.vistos.length > 0 && (
                        <span className="text-sky-700 dark:text-sky-300">
                          <CheckCheck className="mr-0.5 inline size-3" />
                          Visto por {c.vistos.join(", ")}
                        </span>
                      )}
                      {c.vistos.length > 0 && c.sinVer.length > 0 && <span className="text-muted-foreground"> · </span>}
                      {c.sinVer.length > 0 && <span className="text-amber-700 dark:text-amber-300">Sin ver: {c.sinVer.join(", ")}</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
