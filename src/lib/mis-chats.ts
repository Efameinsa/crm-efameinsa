"use client";

import { useSyncExternalStore } from "react";
import { misChats } from "@/lib/acciones/chat";
import type { ChatResumen } from "@/lib/chat";

/**
 * LOS CHATS DE QUIEN MIRA, para el menú lateral y la pantalla /chats (Santos
 * 23-10, 0599: «debería quedarse en su sidebar como chats abiertos»). Una sola
 * consulta compartida por todo lo que la muestre: se pide al montar, cada 45 s
 * con la pestaña a la vista, y al instante cuando llega un aviso del chat, se
 * envía un mensaje o se lee una conversación.
 */
type Estado = { chats: ChatResumen[]; cargado: boolean };
let estado: Estado = { chats: [], cargado: false };
const oyentes = new Set<() => void>();
let reloj: number | null = null;
let enCurso = false;
let otraVez = false;

async function pedir(): Promise<void> {
  if (enCurso) {
    otraVez = true;
    return;
  }
  enCurso = true;
  try {
    const chats = await misChats().catch(() => null);
    if (chats) {
      estado = { chats, cargado: true };
      oyentes.forEach((o) => o());
    }
  } finally {
    enCurso = false;
    if (otraVez) {
      otraVez = false;
      void pedir();
    }
  }
}

/** Pedir la lista de nuevo ya (después de escribir, leer o recibir un aviso del chat). */
export function refrescarMisChats(): void {
  if (typeof window !== "undefined") void pedir();
}

/** Lo leído se apaga al instante, sin esperar a la próxima consulta. */
function marcarLeidoLocal(tipo: string, id: string) {
  const antes = estado.chats.find((c) => c.tipo === tipo && c.id === id);
  if (!antes || antes.noLeidos === 0) return;
  estado = { ...estado, chats: estado.chats.map((c) => (c === antes ? { ...c, noLeidos: 0 } : c)) };
  oyentes.forEach((o) => o());
}

function alAviso(ev: Event) {
  const d = (ev as CustomEvent<{ tipo?: string }>).detail;
  if (d?.tipo === "chat_caso") void pedir();
}
function alLeer(ev: Event) {
  const d = (ev as CustomEvent<{ tipo: string; id: string }>).detail;
  if (d) marcarLeidoLocal(d.tipo, d.id);
}
function alVolver() {
  if (document.visibilityState === "visible") void pedir();
}

function suscribir(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  if (oyentes.size === 1) {
    void pedir();
    reloj = window.setInterval(() => {
      if (document.visibilityState === "visible") void pedir();
    }, 45_000);
    window.addEventListener("crm:aviso", alAviso);
    window.addEventListener("crm:chat-leido", alLeer);
    document.addEventListener("visibilitychange", alVolver);
  }
  return () => {
    oyentes.delete(alCambiar);
    if (oyentes.size === 0) {
      if (reloj !== null) window.clearInterval(reloj);
      reloj = null;
      window.removeEventListener("crm:aviso", alAviso);
      window.removeEventListener("crm:chat-leido", alLeer);
      document.removeEventListener("visibilitychange", alVolver);
    }
  };
}

const VACIO: Estado = { chats: [], cargado: false };

export function useMisChats(): Estado {
  return useSyncExternalStore(
    suscribir,
    () => estado,
    () => VACIO,
  );
}

/** Los que van en el menú: abiertos, primero los que tienen algo sin leer, después el más reciente. */
export function chatsParaElMenu(chats: ChatResumen[]): ChatResumen[] {
  return chats
    .filter((c) => !c.cerradoAt)
    .sort((a, b) => (b.noLeidos > 0 ? 1 : 0) - (a.noLeidos > 0 ? 1 : 0) || (b.ultimo?.at ?? "").localeCompare(a.ultimo?.at ?? ""));
}
