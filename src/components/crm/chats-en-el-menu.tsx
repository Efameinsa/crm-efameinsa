"use client";

import { usePathname } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import Link from "@/components/enlace";
import { abrirChat } from "@/components/crm/chat-flotante";
import { chatsParaElMenu, useMisChats } from "@/lib/mis-chats";
import { cn } from "@/lib/utils";

const MAXIMO_EN_EL_MENU = 6;

/**
 * «CHATS» EN EL MENÚ LATERAL (Santos 23-10, 0599): «abrí un chat pero nadie me
 * contesta… debería quedarse en su sidebar como chats abiertos». Una entrada
 * «Chats» con el número de conversaciones que tienen algo sin leer, y debajo
 * los chats abiertos de quien mira —primero los que esperan respuesta—. Tocar
 * uno abre la ventana del chat encima de la pantalla, sin sacarlo de lo que
 * hacía. Lo que no entra, y los cerrados, están en /chats.
 *
 * `estilo`: «carbon» para la barra nueva (oscura), «sidebar» para la de siempre.
 */
export function ChatsEnElMenu({
  estilo,
  plegada = false,
  movil = false,
  alNavegar,
}: {
  estilo: "carbon" | "sidebar";
  plegada?: boolean;
  movil?: boolean;
  alNavegar?: () => void;
}) {
  const ruta = usePathname();
  const { chats } = useMisChats();
  const abiertos = chatsParaElMenu(chats);
  const conPendientes = abiertos.filter((c) => c.noLeidos > 0).length;
  const enPantalla = abiertos.slice(0, MAXIMO_EN_EL_MENU);
  const activo = ruta === "/chats";
  const carbon = estilo === "carbon";

  return (
    <div className={cn("flex flex-col gap-0.5", carbon ? "mt-3" : "mt-4")}>
      <Link
        href="/chats"
        onClick={alNavegar}
        aria-current={activo ? "page" : undefined}
        title={plegada ? `Chats${conPendientes ? ` (${conPendientes} sin leer)` : ""}` : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-lg text-[13.5px]",
          carbon ? cn("nav-item px-3", movil ? "py-3" : "py-2") : cn("gap-2.5 rounded-md py-2 text-sm transition-colors", plegada ? "justify-center px-0" : "px-3"),
          !carbon && (activo ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"),
        )}
      >
        <MessagesSquare className={carbon ? "size-[18px] shrink-0" : "size-4 shrink-0"} strokeWidth={activo ? 2.3 : 1.9} />
        {!plegada && <span className="flex-1">Chats</span>}
        {conPendientes > 0 && (
          <span
            className={cn(
              "rounded-full bg-red-600 px-1.5 py-px text-[10px] font-bold tabular-nums text-white",
              plegada && "absolute -top-0.5 right-1",
            )}
          >
            {conPendientes > 99 ? "99+" : conPendientes}
          </span>
        )}
      </Link>
      {!plegada && enPantalla.length > 0 && (
        <ul className={cn("ml-5 flex flex-col gap-px border-l pl-2", carbon ? "border-white/15" : "border-sidebar-accent/60")} aria-label="Chats abiertos">
          {enPantalla.map((c) => (
            <li key={`${c.tipo}:${c.id}`}>
              <button
                type="button"
                onClick={() => {
                  abrirChat(c.tipo, c.id);
                  alNavegar?.();
                }}
                title={`${c.titulo}${c.ultimo ? `\n${c.ultimo.mio ? "Usted" : c.ultimo.autor}: ${c.ultimo.texto}` : ""}`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 text-left text-[12px]",
                  movil ? "py-2" : "py-1",
                  carbon ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  c.noLeidos > 0 && (carbon ? "font-semibold text-white" : "font-semibold text-sidebar-foreground"),
                )}
              >
                <span className="min-w-0 flex-1 truncate">{c.cliente}</span>
                {c.noLeidos > 0 && (
                  <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold tabular-nums text-white">{c.noLeidos > 99 ? "99+" : c.noLeidos}</span>
                )}
              </button>
            </li>
          ))}
          {abiertos.length > MAXIMO_EN_EL_MENU && (
            <li>
              <Link
                href="/chats"
                onClick={alNavegar}
                className={cn("block rounded-md px-2 py-1 text-[11px]", carbon ? "text-white/50 hover:text-white" : "text-sidebar-foreground/50 hover:text-sidebar-foreground")}
              >
                Ver los {abiertos.length} chats abiertos ›
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
