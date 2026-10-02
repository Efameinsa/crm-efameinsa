"use client";

import { useSyncExternalStore } from "react";

/**
 * Cuántos chats de WhatsApp le escribieron y esperan, para el numerito verde
 * del menú (02-10). Lo sabe la campana —que ya recibe los avisos en vivo—, así
 * que no se abre otra consulta: la campana lo anuncia y el menú lo escucha.
 * Queda guardado en `window` para el menú que se dibuja después del anuncio.
 */
const EVENTO = "crm:whatsapp-pendientes";

declare global {
  interface Window {
    __crmWhatsappPendientes?: number;
  }
}

export function anunciarPendientesWhatsapp(n: number): void {
  if (typeof window === "undefined") return;
  if (window.__crmWhatsappPendientes === n) return;
  window.__crmWhatsappPendientes = n;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: n }));
}

function suscribir(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO, alCambiar);
  return () => window.removeEventListener(EVENTO, alCambiar);
}

export function usePendientesWhatsapp(): number {
  return useSyncExternalStore(
    suscribir,
    () => window.__crmWhatsappPendientes ?? 0,
    () => 0,
  );
}
