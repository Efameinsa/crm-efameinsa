"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  abrirDocumento,
  descargarArchivo,
  abrirFuera,
  enrutarApertura,
  esApp,
  esDeEsteSitio,
  EVENTO_VER_PDF,
  imprimirPagina,
  versionDeLaApp,
  type DetalleVerPdf,
} from "@/lib/nativo";
import { appDesactualizada, VERSION_ULTIMA_APP } from "@/lib/app-version";
import { sinCambios } from "@/lib/modo-aplicacion";
import { VisorPdfNativo } from "@/components/crm/visor-pdf-nativo";
import { avisarConducta, EVENTOS_DEL_PUENTE } from "@/components/crm/vigilante-conducta";

/**
 * La parte del puente que vive en la pantalla (ver `src/lib/nativo.ts`).
 *
 * Dentro de la app de Android reemplaza las cuatro cosas que un WebView no
 * hace: abrir una pestaña nueva, bajar un archivo, imprimir y mostrar un PDF.
 * Se monta una sola vez en el layout de la sección privada. Fuera de la app
 * (navegador, PWA, iPhone) no hace NADA: ni un `addEventListener`.
 *
 * Por qué interceptar los clics en vez de cambiar los 53 sitios que abren una
 * pestaña nueva: son enlaces y botones repartidos por todo el CRM y cada día
 * aparece uno más. Un solo interceptor los cubre a todos, también los de
 * mañana.
 */

/** Un enlace que el WebView no sabría resolver; true si el puente se hizo cargo. */
function manejarEnlace(a: HTMLAnchorElement): boolean {
  const href = a.href;
  if (!href) return false;
  const descarga = a.hasAttribute("download");
  const nombre = a.getAttribute("download") || undefined;
  if (/^(blob|data):/i.test(href)) {
    if (!descarga) return false;
    // Un archivo armado en el celular (Excel, CSV…): se avisa a gerencia (0373). Los documentos del
    // servidor (/api) los anota el propio servidor.
    avisarConducta(EVENTOS_DEL_PUENTE.descarga, { nombre });
    void descargarArchivo(href, nombre ?? "archivo");
    return true;
  }
  if (!esDeEsteSitio(href)) {
    // Teléfono, correo, WhatsApp, un mapa u otra web: fuera de la app.
    if (/^(https?|tel|mailto|sms|whatsapp|geo|intent|market|maps):/i.test(href)) {
      void abrirFuera(href);
      return true;
    }
    return false;
  }
  const u = new URL(href);
  if (u.pathname.startsWith("/api/")) {
    void abrirDocumento(u.pathname + u.search, nombre);
    return true;
  }
  if (a.target === "_blank") {
    // Una pantalla del CRM «en pestaña nueva»: en la app no hay pestañas. Se
    // abre en la misma ventana y el botón «atrás» de Android vuelve.
    a.target = "_self";
  }
  return false;
}

/** Lo que se devuelve en lugar de una ventana nueva, para quien revisa si `window.open` funcionó. */
function ventanaFalsa(): Window {
  const abrir = (destino: string | URL) => void enrutarApertura(destino);
  const ubicacion = {
    get href() {
      return "";
    },
    set href(destino: string) {
      abrir(destino);
    },
    assign: abrir,
    replace: abrir,
  };
  return {
    closed: false,
    opener: null,
    close() {},
    focus() {},
    blur() {},
    location: ubicacion,
    document: { write() {}, writeln() {}, open() {}, close() {} },
  } as unknown as Window;
}

/** La versión instalada si ya no sirve con este CRM; null si está al día o si no es la app. */
function versionVieja(): string | null {
  const instalada = versionDeLaApp();
  return esApp() && appDesactualizada(instalada) ? instalada : null;
}

export function PuenteNativo() {
  const [pdf, setPdf] = useState<DetalleVerPdf | null>(null);
  // La versión de la app que ya no sirve con este CRM (ver src/lib/app-version.ts).
  const vieja = useSyncExternalStore(sinCambios, versionVieja, () => null);

  const cerrarPdf = useCallback(() => {
    // El visor puso una entrada en el historial: así «atrás» lo cierra y no
    // saca a la persona de la pantalla en la que estaba.
    if (window.history.state?.visorPdf) window.history.back();
    else setPdf(null);
  }, []);

  useEffect(() => {
    if (!esApp()) return;
    document.documentElement.dataset.app = "android";
    // Respaldo de la marca del User-Agent: el servidor la lee (layout) cuando una petición sale sin ella.
    document.cookie = `efa-app=android; path=/; max-age=31536000; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;

    const alHacerClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && manejarEnlace(a)) e.preventDefault();
    };
    document.addEventListener("click", alHacerClic, true);

    const abrirOriginal = window.open;
    window.open = ((url?: string | URL, destino?: string, caracteristicas?: string) => {
      const texto = url === undefined || url === null ? "" : String(url);
      if (texto === "" || texto === "about:blank") return ventanaFalsa();
      if (enrutarApertura(texto)) return ventanaFalsa();
      return abrirOriginal.call(window, url, destino, caracteristicas);
    }) as typeof window.open;

    const imprimirOriginal = window.print;
    window.print = () => {
      avisarConducta(EVENTOS_DEL_PUENTE.impresion);
      void imprimirPagina();
    };

    const clicOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (manejarEnlace(this)) return;
      clicOriginal.call(this);
    };

    const alVerPdf = (e: Event) => {
      const detalle = (e as CustomEvent<DetalleVerPdf>).detail;
      window.history.pushState({ visorPdf: true }, "");
      setPdf(detalle);
    };
    window.addEventListener(EVENTO_VER_PDF, alVerPdf);
    const alVolver = () => setPdf(null);
    window.addEventListener("popstate", alVolver);

    return () => {
      document.removeEventListener("click", alHacerClic, true);
      window.open = abrirOriginal;
      window.print = imprimirOriginal;
      HTMLAnchorElement.prototype.click = clicOriginal;
      window.removeEventListener(EVENTO_VER_PDF, alVerPdf);
      window.removeEventListener("popstate", alVolver);
      delete document.documentElement.dataset.app;
    };
  }, []);

  return (
    <>
      {vieja && (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-16 z-[65] mx-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-amber-950 shadow-lg"
        >
          Esta versión de la app ({vieja}) quedó vieja. Instale la {VERSION_ULTIMA_APP}: pídale el APK nuevo a Sistemas.
        </div>
      )}
      {pdf && <VisorPdfNativo origen={pdf.blob} titulo={pdf.nombre} onCerrar={cerrarPdf} />}
    </>
  );
}
