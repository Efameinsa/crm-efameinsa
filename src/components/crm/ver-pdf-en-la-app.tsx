"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { abrirDocumento, esApp } from "@/lib/nativo";

/**
 * Un PDF del CRM abierto DENTRO del CRM.
 *
 * POR QUÉ (gerencia, 10-09): «El gerente desde la parte de auditoría quiere ver
 * una cotización que se encuentra en Alvarado Saldaña Bernardo y le ha abierto
 * una pestaña nueva en el navegador y como no tiene acceso genera un problema.
 * La cotización debe generar en esa misma aplicación».
 *
 * Es el mismo problema que ya se había corregido el 09-09 con los archivos del
 * cliente, por otro camino. Una pestaña nueva se lleva al gerente fuera de la
 * pantalla donde estaba y, cuando el documento no le toca a la sesión con la
 * que está mirando —en auditoría la sesión es la de OTRA persona—, lo que
 * aparece es un JSON crudo del servidor en una pestaña en blanco. Nadie puede
 * saber qué pasó ni volver.
 *
 * Acá el PDF se pide primero y se mira el resultado: si vino el documento se
 * muestra encima de la pantalla, y si no, se explica en palabras qué pasó y con
 * qué sesión se estaba mirando, que es lo que hacía falta para entenderlo. La
 * descarga y el «abrir aparte» siguen estando, pero como decisión y no como
 * único camino.
 */
export function VerPdfEnLaApp({
  url,
  titulo,
  className,
  children,
  title,
  "aria-label": ariaLabel,
  antesDeAbrir,
}: {
  /**
   * Lo que hay que terminar antes de pedir el PDF —el autoguardado del
   * cotizador—. Con esto el documento se pide de nuevo CADA vez: el de un
   * borrador cambia entre una mirada y otra (Gabriela, 05-10: «cambio el
   * precio de 1250 a 1000 y en el PDF del borrador no aparece»).
   */
  antesDeAbrir?: () => Promise<unknown>;
  /** El endpoint que devuelve el PDF. Relativo, para que siga la sesión de esta dirección. */
  url: string;
  /** Cómo se llama el documento en la barra del visor y en la descarga. */
  titulo: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ultimo = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (ultimo.current) URL.revokeObjectURL(ultimo.current);
    };
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const cerrarConEsc = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", cerrarConEsc);
    return () => window.removeEventListener("keydown", cerrarConEsc);
  }, [abierto]);

  // «ATRÁS» CIERRA EL VISOR (Gabriela, 05-10: «cuando ya está en el PDF y
  // aprieta para atrás, sale a otra parte y es donde se pierde»). El visor
  // ocupa toda la pantalla y se siente como una página: al abrirlo se suma un
  // paso al historial con el mismo estado de Next, y el botón de atrás del
  // navegador (o del mouse) lo saca a él, no a la pantalla de abajo.
  const pasoPropio = useRef(false);
  useEffect(() => {
    if (!abierto) return;
    const alVolver = () => {
      pasoPropio.current = false;
      setAbierto(false);
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [abierto]);
  function cerrar() {
    if (pasoPropio.current) {
      pasoPropio.current = false;
      window.history.back();
    }
    setAbierto(false);
  }

  async function abrir() {
    // En la app de Android el iframe no muestra PDF: el puente lo abre con su
    // propio visor (pdf.js) y con los mismos mensajes de error.
    if (esApp()) {
      if (antesDeAbrir) await antesDeAbrir();
      void abrirDocumento(url, titulo);
      return;
    }
    if (!abierto && !pasoPropio.current) {
      window.history.pushState({ ...(window.history.state ?? {}), visorPdf: true }, "");
      pasoPropio.current = true;
    }
    setAbierto(true);
    if (cargando) return;
    if (blobUrl && !antesDeAbrir) return;
    setCargando(true);
    setError(null);
    try {
      if (antesDeAbrir) await antesDeAbrir();
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        // El servidor contesta en JSON cuando no puede dar el documento. Se
        // dice con sus palabras, no con un código.
        let detalle = "";
        try {
          const j = await r.json();
          detalle = String(j.detalle ?? j.error ?? "");
        } catch {
          /* no era JSON */
        }
        setError(
          r.status === 404
            ? `No se encontró el documento${detalle ? ` (${detalle})` : ""}. Si está mirando el CRM como otra persona, puede que no le toque verlo a ella: ábralo con su propia sesión.`
            : r.status === 401 || r.status === 403
              ? "Esta sesión no puede abrir este documento. Si entró como otra persona desde auditoría, salga de la auditoría y ábralo con su propia sesión."
              : detalle || `No se pudo abrir el documento (${r.status}).`,
        );
        return;
      }
      const blob = await r.blob();
      if (ultimo.current) URL.revokeObjectURL(ultimo.current);
      const u = URL.createObjectURL(blob);
      ultimo.current = u;
      setBlobUrl(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el documento.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={abrir} className={className} title={title} aria-label={ariaLabel}>
        {children}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          onClick={cerrar}
        >
          <div className="flex items-center gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="min-w-0 flex-1 truncate text-sm">{titulo}</span>
            {blobUrl && (
              <>
                <a
                  href={blobUrl}
                  download={`${titulo}.pdf`}
                  className="rounded-full p-1.5 hover:bg-white/15"
                  aria-label="Descargar"
                  title="Descargar"
                >
                  <Download className="size-5" />
                </a>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full p-1.5 hover:bg-white/15"
                  aria-label="Abrir en una pestaña aparte"
                  title="Abrir en una pestaña aparte"
                >
                  <ExternalLink className="size-5" />
                </a>
              </>
            )}
            <button
              type="button"
              onClick={cerrar}
              className="rounded-full p-1.5 hover:bg-white/15"
              aria-label="Cerrar"
            >
              <X className="size-6" />
            </button>
          </div>

          <div
            className={cn("flex flex-1 items-center justify-center overflow-hidden p-2")}
            onClick={(e) => e.stopPropagation()}
          >
            {cargando && (
              <p className="flex items-center gap-2 text-sm text-white/80">
                <Loader2 className="size-4 animate-spin" /> Armando el documento…
              </p>
            )}
            {!cargando && error && (
              <div className="max-w-md rounded-xl bg-white p-5 text-center">
                <AlertTriangle className="mx-auto size-8 text-amber-500" />
                <p className="mt-2 text-sm leading-relaxed text-foreground">{error}</p>
                <button
                  type="button"
                  onClick={cerrar}
                  className="mt-3 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-accent"
                >
                  Volver
                </button>
              </div>
            )}
            {!cargando && !error && blobUrl && (
              <iframe title={titulo} src={blobUrl} className="size-full rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
