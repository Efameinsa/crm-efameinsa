"use client";

import { useEffect } from "react";
import { esApp } from "@/lib/nativo";

/**
 * EL OJO QUE AVISA A GERENCIA (0373).
 *
 * Santos (02-10-2026): «queremos estar enterados si hace screenshots, o tiene
 * algún comportamiento sospechoso como copiar información y llevársela a otro
 * lado», y «no quiero que bloquees nada». Por eso este componente SOLO
 * observa: no cancela ningún evento, no cambia nada en pantalla y no dice
 * nada a quien lo hace.
 *
 * Qué ve:
 *   · copiar / cortar: CUÁNTOS caracteres, jamás cuáles.
 *   · la tecla Impr Pant (web). En la app, la captura de pantalla la avisa
 *     el código nativo con el evento `efa-captura`.
 *   · imprimir (`beforeprint` en la web; `efa-impresion` desde el puente).
 *   · un archivo armado en el equipo y bajado (Excel del navegador): en la
 *     web por el clic en `a[download]`; en la app por `efa-descarga`.
 *   · compartir un archivo bajado a otra aplicación (`efa-compartir`).
 * Los documentos que entrega el servidor (PDF, reportes) los anota el propio
 * servidor (src/proxy.ts), así no depende de este componente.
 *
 * Sin red, los eventos se guardan en el equipo (hasta 50) y salen al volver.
 * Se monta solo para quienes se vigilan (no gerencia ni admin).
 */

export type TipoEventoCliente = "captura_pantalla" | "copiar" | "descarga" | "impresion" | "compartir";
interface EventoCola {
  tipo: TipoEventoCliente;
  detalle: Record<string, unknown>;
}

export const EVENTOS_DEL_PUENTE = {
  captura: "efa-captura",
  descarga: "efa-descarga",
  compartir: "efa-compartir",
  impresion: "efa-impresion",
} as const;

/** Lo que el puente o el código nativo avisa: un evento del navegador con datos en `detail`. */
export function avisarConducta(evento: (typeof EVENTOS_DEL_PUENTE)[keyof typeof EVENTOS_DEL_PUENTE], detalle: Record<string, unknown> = {}) {
  try {
    window.dispatchEvent(new CustomEvent(evento, { detail: detalle }));
  } catch {
    /* mirar nunca rompe nada */
  }
}

const CLAVE_COLA = "efa-seg-cola";
const MAX_COLA = 50;

function leerCola(): EventoCola[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLAVE_COLA) ?? "[]");
    return Array.isArray(v) ? v.slice(0, MAX_COLA) : [];
  } catch {
    return [];
  }
}
function guardarCola(c: EventoCola[]) {
  try {
    if (c.length === 0) window.localStorage.removeItem(CLAVE_COLA);
    else window.localStorage.setItem(CLAVE_COLA, JSON.stringify(c.slice(-MAX_COLA)));
  } catch {
    /* el almacenamiento puede no existir: no pasa nada */
  }
}

/** true = el servidor ya lo tiene en cuenta (o nunca lo va a querer): no se reenvía. */
async function enviar(e: EventoCola): Promise<boolean> {
  try {
    const r = await fetch("/api/seguridad/evento", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(e),
      keepalive: true,
      credentials: "same-origin",
    });
    return r.status < 500 && r.status !== 429;
  } catch {
    return false;
  }
}

async function vaciarCola() {
  let cola = leerCola();
  while (cola.length > 0) {
    const ok = await enviar(cola[0]);
    if (!ok) return;
    cola = cola.slice(1);
    guardarCola(cola);
  }
}

async function registrar(tipo: TipoEventoCliente, detalle: Record<string, unknown> = {}) {
  const e: EventoCola = { tipo, detalle: { ruta: window.location.pathname, ...detalle } };
  if (await enviar(e)) return;
  guardarCola([...leerCola(), e]);
}

/** Cuántos caracteres se copiaron o cortaron: del campo de texto activo o de la selección de la página. */
function caracteresCopiados(): { caracteres: number; en: "campo" | "texto" } {
  const a = document.activeElement;
  if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) {
    const ini = a.selectionStart ?? 0;
    const fin = a.selectionEnd ?? 0;
    return { caracteres: Math.max(0, fin - ini), en: "campo" };
  }
  return { caracteres: (window.getSelection()?.toString() ?? "").length, en: "texto" };
}

export function VigilanteConducta() {
  useEffect(() => {
    const enApp = esApp();
    // El mismo gesto no se cuenta dos veces (p. ej. el sistema y la app avisando la misma captura).
    const ultimo = new Map<string, number>();
    const nuevo = (clave: string, ventanaMs = 2500) => {
      const ahora = Date.now();
      if (ahora - (ultimo.get(clave) ?? 0) < ventanaMs) return false;
      ultimo.set(clave, ahora);
      return true;
    };

    void vaciarCola();
    const alVolverLaRed = () => void vaciarCola();
    window.addEventListener("online", alVolverLaRed);

    const alCopiar = (e: ClipboardEvent) => {
      const { caracteres, en } = caracteresCopiados();
      if (caracteres === 0) return;
      void registrar("copiar", { caracteres, en, accion: e.type === "cut" ? "cortar" : "copiar" });
    };
    document.addEventListener("copy", alCopiar, true);
    document.addEventListener("cut", alCopiar, true);

    const alSoltarTecla = (e: KeyboardEvent) => {
      if (enApp || e.key !== "PrintScreen" || !nuevo("tecla-captura")) return;
      void registrar("captura_pantalla", { metodo: "tecla" });
    };
    window.addEventListener("keyup", alSoltarTecla, true);

    const alImprimirWeb = () => {
      if (!enApp && nuevo("imprimir")) void registrar("impresion");
    };
    window.addEventListener("beforeprint", alImprimirWeb);

    const alBajarArchivo = (e: MouseEvent) => {
      if (enApp) return; // en la app lo avisa el puente (`efa-descarga`)
      const a = (e.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (!a || !/^(blob|data):/i.test(a.href) || !nuevo(`bajar-${a.download}`)) return;
      void registrar("descarga", { nombre: a.getAttribute("download") ?? undefined });
    };
    document.addEventListener("click", alBajarArchivo, true);

    const delPuente = (nombre: string, tipo: TipoEventoCliente) => {
      const f = (e: Event) => {
        const d = ((e as CustomEvent).detail ?? {}) as Record<string, unknown>;
        if (!nuevo(`${nombre}-${String(d.metodo ?? d.nombre ?? "")}`, tipo === "captura_pantalla" ? 4000 : 1500)) return;
        void registrar(tipo, d);
      };
      window.addEventListener(nombre, f);
      return () => window.removeEventListener(nombre, f);
    };
    const quitar = [
      delPuente(EVENTOS_DEL_PUENTE.captura, "captura_pantalla"),
      delPuente(EVENTOS_DEL_PUENTE.descarga, "descarga"),
      delPuente(EVENTOS_DEL_PUENTE.compartir, "compartir"),
      delPuente(EVENTOS_DEL_PUENTE.impresion, "impresion"),
    ];

    return () => {
      window.removeEventListener("online", alVolverLaRed);
      document.removeEventListener("copy", alCopiar, true);
      document.removeEventListener("cut", alCopiar, true);
      window.removeEventListener("keyup", alSoltarTecla, true);
      window.removeEventListener("beforeprint", alImprimirWeb);
      document.removeEventListener("click", alBajarArchivo, true);
      quitar.forEach((q) => q());
    };
  }, []);

  return null;
}
