"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Share2, X, ZoomIn, ZoomOut } from "lucide-react";
import { descargarArchivo } from "@/lib/nativo";

/**
 * EL PDF DENTRO DE LA APP DE ANDROID.
 *
 * El WebView de Android no muestra un PDF en un `<iframe>` (sale en blanco), y
 * es lo que usaba el CRM para cotizaciones, informes, aperturas y reportes. En
 * la app el PDF se dibuja con pdf.js, página por página, sobre canvas.
 *
 * Lo que NO hace, a propósito: no es un editor ni busca texto. Es un visor para
 * leer y compartir. Para imprimir o mandar por WhatsApp está el botón de
 * compartir, que guarda el archivo y abre la hoja de Android.
 *
 * El «worker» de pdf.js es `public/vendor/pdf.worker.min.mjs` (copia de la
 * versión legacy de pdfjs-dist; una prueba avisa si deja de coincidir con la
 * instalada). Se usa la versión legacy para que corra también en WebViews
 * viejos de celulares que no se actualizan.
 */

const MAX_PAGINAS = 60;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

type Origen = Blob | string;

export function VisorPdfNativo({
  origen,
  titulo,
  onCerrar,
}: {
  /** El PDF ya descargado (Blob) o una dirección que se pide con la sesión. */
  origen: Origen;
  titulo: string;
  onCerrar: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const paginas = useRef<HTMLDivElement>(null);
  const documento = useRef<import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy | null>(null);
  const tarea = useRef<import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentLoadingTask | null>(null);
  const blob = useRef<Blob | null>(null);
  const turno = useRef(0);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1);

  // 1. Cargar el documento.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const archivo = typeof origen === "string" ? await pedir(origen) : origen;
        blob.current = archivo;
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
        const carga = pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
        tarea.current = carga;
        const doc = await carga.promise;
        if (!vivo) {
          void carga.destroy();
          return;
        }
        documento.current = doc;
        setTotal(doc.numPages);
        setEstado("listo");
      } catch (e) {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : "No se pudo abrir el documento.");
        setEstado("error");
      }
    })();
    return () => {
      vivo = false;
      void tarea.current?.destroy();
      documento.current = null;
    };
  }, [origen]);

  // 2. Dibujar las páginas (otra vez si cambia el zoom o el ancho).
  useEffect(() => {
    const doc = documento.current;
    const zona = paginas.current;
    const marco = contenedor.current;
    if (estado !== "listo" || !doc || !zona || !marco) return;
    const mio = ++turno.current;
    const dibujar = async () => {
      zona.replaceChildren();
      const ancho = Math.max(240, marco.clientWidth - 16) * zoom;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cuantas = Math.min(doc.numPages, MAX_PAGINAS);
      for (let n = 1; n <= cuantas; n++) {
        if (turno.current !== mio) return;
        const pagina = await doc.getPage(n);
        const base = pagina.getViewport({ scale: 1 });
        const vista = pagina.getViewport({ scale: (ancho / base.width) * dpr });
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.floor(vista.width);
        lienzo.height = Math.floor(vista.height);
        lienzo.style.width = `${Math.floor(ancho)}px`;
        lienzo.style.height = `${Math.floor((vista.height / vista.width) * ancho)}px`;
        lienzo.className = "mx-auto mb-3 rounded bg-white shadow";
        lienzo.setAttribute("data-pagina", String(n));
        zona.appendChild(lienzo);
        const contexto = lienzo.getContext("2d");
        if (!contexto) continue;
        await pagina.render({ canvasContext: contexto, canvas: lienzo, viewport: vista }).promise;
      }
      if (doc.numPages > cuantas && turno.current === mio) {
        const aviso = document.createElement("p");
        aviso.className = "py-2 text-center text-xs text-white/70";
        aviso.textContent = `Se muestran las primeras ${cuantas} de ${doc.numPages} páginas. Compártalo para verlo completo.`;
        zona.appendChild(aviso);
      }
    };
    dibujar().catch((e) => {
      if (turno.current !== mio) return;
      setError(e instanceof Error ? e.message : "No se pudo dibujar el documento.");
      setEstado("error");
    });
    return () => {
      // `turno` es un contador, no un nodo de React: se lee su valor de AHORA a propósito.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      turno.current++;
    };
  }, [estado, zoom, total]);

  // Cerrar con la tecla «atrás» del teclado y con Escape.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex items-center gap-1 px-3 py-2 text-white" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <span className="min-w-0 flex-1 truncate text-sm">{titulo}</span>
        {estado === "listo" && (
          <>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-white/15 disabled:opacity-40"
              aria-label="Alejar"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - 0.5) * 10) / 10))}
            >
              <ZoomOut className="size-5" />
            </button>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-white/15 disabled:opacity-40"
              aria-label="Acercar"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + 0.5) * 10) / 10))}
            >
              <ZoomIn className="size-5" />
            </button>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-white/15"
              aria-label="Compartir o guardar"
              onClick={() => blob.current && void descargarArchivo(blob.current, /\.pdf$/i.test(titulo) ? titulo : `${titulo}.pdf`)}
            >
              <Share2 className="size-5" />
            </button>
          </>
        )}
        <button type="button" className="rounded-full p-2 hover:bg-white/15" aria-label="Cerrar" onClick={onCerrar}>
          <X className="size-6" />
        </button>
      </div>

      <div ref={contenedor} className="flex-1 overflow-auto px-2 pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
        {estado === "cargando" && (
          <p className="flex items-center justify-center gap-2 pt-16 text-sm text-white/80">
            <Loader2 className="size-4 animate-spin" /> Armando el documento…
          </p>
        )}
        {estado === "error" && (
          <div className="mx-auto mt-12 max-w-md rounded-xl bg-white p-5 text-center">
            <AlertTriangle className="mx-auto size-8 text-amber-500" />
            <p className="mt-2 text-sm leading-relaxed">{error ?? "No se pudo abrir el documento."}</p>
            <button type="button" onClick={onCerrar} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold">
              Volver
            </button>
          </div>
        )}
        <div ref={paginas} className={estado === "listo" ? "" : "hidden"} />
      </div>
    </div>
  );
}

async function pedir(url: string): Promise<Blob> {
  const r = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!r.ok) {
    throw new Error(
      r.status === 401 || r.status === 403
        ? "Esta sesión no puede abrir este documento."
        : r.status === 404
          ? "No se encontró el documento."
          : `No se pudo abrir el documento (${r.status}).`,
    );
  }
  return r.blob();
}
