"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Image as ImagenIcono,
  FileText,
  Folder,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Home,
} from "lucide-react";

/**
 * Visor de los archivos del cliente, DENTRO del CRM.
 *
 * POR QUÉ (Santos / gerencia, 09-09). Antes «Abrir carpeta» abría una pestaña
 * nueva a otro dominio; desde la app instalada (PWA) el gerente no veía nada.
 * Ahora las fotos y los informes se abren acá mismo, en una galería, sin salir
 * de la aplicación. El listado y los enlaces firmados los da /api/archivos, que
 * ya verificó permisos con la sesión del usuario.
 */

type Elemento =
  | { nombre: string; tipo: "carpeta"; sub: string }
  | { nombre: string; tipo: "archivo"; ext: string; peso: number | null; modificado: string | null; url: string | null };

const IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const esImagen = (e: Elemento) => e.tipo === "archivo" && IMG.has(e.ext);
const esPdf = (e: Elemento) => e.tipo === "archivo" && e.ext === ".pdf";

function pesoTexto(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export function VisorArchivos({
  cuentaId,
  clase,
  titulo,
  etiquetaBoton,
}: {
  cuentaId: string;
  clase: "fotos" | "informes" | "videos" | "fichas";
  titulo: string;
  etiquetaBoton: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [sub, setSub] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [visor, setVisor] = useState<{ url: string; nombre: string; tipo: "img" | "pdf" } | null>(null);

  const cargar = useCallback(
    async (s: string) => {
      setCargando(true);
      setError(null);
      try {
        const r = await fetch(`/api/archivos?cuentaId=${cuentaId}&clase=${clase}&sub=${encodeURIComponent(s)}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "No se pudo abrir.");
        setElementos(j.elementos ?? []);
        setTruncado(Boolean(j.truncado));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo abrir.");
        setElementos([]);
      } finally {
        setCargando(false);
      }
    },
    [cuentaId, clase],
  );

  useEffect(() => {
    if (abierto) cargar(sub);
  }, [abierto, sub, cargar]);

  // Cerrar con Escape; si hay visor de foto abierto, primero cierra ese.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (visor) setVisor(null);
        else setAbierto(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, visor]);

  const migas = sub ? sub.split("/") : [];
  const imagenes = elementos.filter(esImagen) as Extract<Elemento, { tipo: "archivo" }>[];

  const abrir = () => {
    setSub("");
    setAbierto(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {clase === "fotos" ? <ImagenIcono className="size-4" /> : <FileText className="size-4" />}
        {etiquetaBoton}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col bg-background shadow-2xl sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-2xl">
            {/* Cabecera */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{titulo}</p>
                <p className="text-[11px] text-muted-foreground">Archivo del cliente, desde el servidor de la empresa</p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Migas de pan */}
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-2 text-xs">
              <button
                type="button"
                onClick={() => setSub("")}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
              >
                <Home className="size-3.5" /> Inicio
              </button>
              {migas.map((m, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setSub(migas.slice(0, i + 1).join("/"))}
                    className="max-w-[12rem] truncate rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
                  >
                    {m}
                  </button>
                </span>
              ))}
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto p-4">
              {cargando ? (
                <div className="flex h-40 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 size-5 animate-spin" /> Cargando…
                </div>
              ) : error ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                  <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
                  <button
                    type="button"
                    onClick={() => cargar(sub)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    <RefreshCw className="size-4" /> Reintentar
                  </button>
                </div>
              ) : elementos.length === 0 ? (
                <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Esta carpeta está vacía.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {elementos.map((e, i) => {
                    if (e.tipo === "carpeta") {
                      return (
                        <button
                          key={"c" + i}
                          type="button"
                          onClick={() => setSub(e.sub)}
                          className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition hover:border-primary/50 hover:bg-accent"
                        >
                          <Folder className="size-9 text-primary" />
                          <span className="line-clamp-2 text-xs font-medium text-foreground">{e.nombre}</span>
                        </button>
                      );
                    }
                    if (esImagen(e) && e.url) {
                      return (
                        <button
                          key={"i" + i}
                          type="button"
                          onClick={() => setVisor({ url: e.url!, nombre: e.nombre, tipo: "img" })}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={e.url}
                            alt={e.nombre}
                            loading="lazy"
                            className="size-full object-cover transition group-hover:scale-105"
                          />
                        </button>
                      );
                    }
                    // Documento (pdf / word / excel)
                    return (
                      <button
                        key={"d" + i}
                        type="button"
                        onClick={() => {
                          if (esPdf(e) && e.url) setVisor({ url: e.url, nombre: e.nombre, tipo: "pdf" });
                          else if (e.url) window.open(e.url, "_blank");
                        }}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition hover:border-primary/50 hover:bg-accent"
                        title={e.nombre}
                      >
                        <FileText className="size-9 text-muted-foreground" />
                        <span className="line-clamp-2 text-xs font-medium text-foreground">{e.nombre}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {e.ext.replace(".", "").toUpperCase()} {pesoTexto(e.peso)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {truncado && (
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Se muestran los primeros archivos de una carpeta muy grande.
                </p>
              )}
            </div>
          </div>

          {/* Visor grande de una foto o un PDF */}
          {visor && (
            <div
              className="fixed inset-0 z-[60] flex flex-col bg-black/90"
              onClick={() => setVisor(null)}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center gap-2 px-4 py-3 text-white">
                <span className="min-w-0 flex-1 truncate text-sm">{visor.nombre}</span>
                {visor.url && (
                  <a
                    href={visor.url}
                    download={visor.nombre}
                    onClick={(ev) => ev.stopPropagation()}
                    className="rounded-full p-1.5 hover:bg-white/15"
                    aria-label="Descargar"
                  >
                    <Download className="size-5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setVisor(null)}
                  className="rounded-full p-1.5 hover:bg-white/15"
                  aria-label="Cerrar"
                >
                  <X className="size-6" />
                </button>
              </div>
              <div className="flex flex-1 items-center justify-center overflow-hidden p-2" onClick={(ev) => ev.stopPropagation()}>
                {visor.tipo === "img" ? (
                  <VisorImagen
                    imagenes={imagenes}
                    actual={visor.nombre}
                    onCambiar={(url, nombre) => setVisor({ url, nombre, tipo: "img" })}
                  />
                ) : (
                  <iframe title={visor.nombre} src={visor.url} className="size-full rounded-lg bg-white" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Foto a pantalla grande con flechas para pasar a la anterior/siguiente. */
function VisorImagen({
  imagenes,
  actual,
  onCambiar,
}: {
  imagenes: Extract<Elemento, { tipo: "archivo" }>[];
  actual: string;
  onCambiar: (url: string, nombre: string) => void;
}) {
  const idx = imagenes.findIndex((im) => im.nombre === actual);
  const ir = (d: number) => {
    const n = imagenes[(idx + d + imagenes.length) % imagenes.length];
    if (n?.url) onCambiar(n.url, n.nombre);
  };
  const uno = imagenes[idx];
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowLeft") ir(-1);
      if (ev.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, imagenes]);
  if (!uno?.url) return null;
  return (
    <div className="relative flex size-full items-center justify-center">
      {imagenes.length > 1 && (
        <button
          type="button"
          onClick={() => ir(-1)}
          className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
          aria-label="Anterior"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={uno.url} alt={uno.nombre} className="max-h-full max-w-full rounded-lg object-contain" />
      {imagenes.length > 1 && (
        <button
          type="button"
          onClick={() => ir(1)}
          className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
          aria-label="Siguiente"
        >
          <ChevronRight className="size-6" />
        </button>
      )}
    </div>
  );
}
