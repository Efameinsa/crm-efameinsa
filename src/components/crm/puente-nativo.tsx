"use client";

import { useCallback, useEffect, useState } from "react";
import {
  abrirDocumento,
  descargarArchivo,
  abrirFuera,
  enrutarApertura,
  esApp,
  esDeEsteSitio,
  EVENTO_VER_PDF,
  imprimirPagina,
  type DetalleVerPdf,
} from "@/lib/nativo";
import { VisorPdfNativo } from "@/components/crm/visor-pdf-nativo";

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

export function PuenteNativo() {
  const [pdf, setPdf] = useState<DetalleVerPdf | null>(null);

  const cerrarPdf = useCallback(() => {
    // El visor puso una entrada en el historial: así «atrás» lo cierra y no
    // saca a la persona de la pantalla en la que estaba.
    if (window.history.state?.visorPdf) window.history.back();
    else setPdf(null);
  }, []);

  useEffect(() => {
    if (!esApp()) return;
    document.documentElement.dataset.app = "android";

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

  if (!pdf) return null;
  return <VisorPdfNativo origen={pdf.blob} titulo={pdf.nombre} onCerrar={cerrarPdf} />;
}
