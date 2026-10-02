import { toast } from "sonner";

/**
 * EL PUENTE ENTRE EL CRM Y LA APP DE ANDROID.
 *
 * Santos, 01-10-2026: «replicar crm.efameinsa.com en una app nativa para
 * celular, con todas sus funcionalidades». La app («CRM Efameinsa», repo
 * Efameinsa/crm-app-movil) no reescribe el CRM: abre este mismo sitio dentro de
 * un WebView de Capacitor. Eso trae las pantallas responsive y cada despliegue
 * llega sola, pero hay cosas de la web que un WebView NO hace:
 *
 *   · mostrar un PDF dentro de la página (iframe en blanco);
 *   · bajar un archivo (`<a download>` y los `blob:` no hacen nada);
 *   · imprimir (`window.print()` no existe);
 *   · abrir una pestaña nueva (no hay pestañas, y una externa no trae la sesión).
 *
 * Este archivo es lo que reemplaza cada una de esas por su versión nativa.
 *
 * REGLA: nada de acá corre en el navegador ni en la PWA. Todo cuelga de
 * `esApp()`, que mira la marca que la app agrega al User-Agent
 * («EfameinsaApp/<versión>»). Los plugins se importan con `import()` y solo
 * cuando hacen falta: el paquete web normal no los carga.
 */

/** ¿Estamos dentro de la app de Android? Solo en el navegador del cliente. */
export function esApp(): boolean {
  return typeof navigator !== "undefined" && /EfameinsaApp\//.test(navigator.userAgent);
}

/** La versión de la app instalada («1.0.0»), o null fuera de la app. */
export function versionDeLaApp(): string | null {
  if (typeof navigator === "undefined") return null;
  return /EfameinsaApp\/([\w.\-]+)/.exec(navigator.userAgent)?.[1] ?? null;
}

/** Eventos con los que el puente le pide a la pantalla que muestre algo. */
export const EVENTO_VER_PDF = "efameinsa:ver-pdf";
export interface DetalleVerPdf {
  blob: Blob;
  nombre: string;
}

const ESQUEMAS_EXTERNOS = /^(tel|mailto|sms|whatsapp|geo|intent|market|maps):/i;

/** Pasa una dirección a absoluta; null si no se puede entender. */
function absoluta(url: string | URL): URL | null {
  try {
    return new URL(String(url), window.location.href);
  } catch {
    return null;
  }
}

/** ¿Es una dirección de este mismo sitio? */
export function esDeEsteSitio(url: string | URL): boolean {
  const u = absoluta(url);
  return Boolean(u && (u.protocol === "http:" || u.protocol === "https:") && u.origin === window.location.origin);
}

/** Abre algo FUERA de la app: WhatsApp, el teléfono, el correo, un mapa, otra web. */
export async function abrirFuera(url: string | URL): Promise<void> {
  const destino = String(url);
  try {
    const { AppLauncher } = await import("@capacitor/app-launcher");
    await AppLauncher.openUrl({ url: destino });
  } catch {
    // Sin el plugin (o sin app que lo resuelva) lo último que queda es dejar
    // que el sistema lo intente: el WebView entrega a Android lo que no es suyo.
    window.location.href = destino;
  }
}

/** El nombre de archivo que trae `Content-Disposition`, si lo trae. */
function nombreDeCabecera(cabecera: string | null): string | null {
  if (!cabecera) return null;
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cabecera)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8.trim());
    } catch {
      /* cae al nombre simple */
    }
  }
  const simple = /filename\s*=\s*"?([^";]+)"?/i.exec(cabecera)?.[1];
  return simple ? simple.trim() : null;
}

/** Un nombre que Android acepta como archivo. */
function nombreSeguro(nombre: string): string {
  const limpio = nombre.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
  return limpio || "documento";
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(lector.error ?? new Error("No se pudo leer el archivo."));
    lector.onload = () => resolve(String(lector.result).split(",")[1] ?? "");
    lector.readAsDataURL(blob);
  });
}

/**
 * Guarda un archivo en el celular y le deja elegir qué hacer: abrirlo con la
 * aplicación que corresponda (Excel, Word, el visor de PDF…) o compartirlo
 * (WhatsApp, correo, Drive, «guardar en el dispositivo»).
 */
export async function descargarArchivo(origen: Blob | string, nombre: string): Promise<void> {
  const id = toast.loading(`Preparando ${nombre}…`);
  try {
    const blob = typeof origen === "string" ? await (await fetch(origen, { credentials: "include" })).blob() : origen;
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const archivo = nombreSeguro(nombre);
    const { uri } = await Filesystem.writeFile({
      path: `descargas/${archivo}`,
      data: await blobABase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    toast.success(archivo, {
      id,
      duration: 15000,
      description: "El archivo está listo.",
      action: {
        label: "Abrir",
        onClick: () => void abrirArchivoGuardado(uri, blob.type, archivo),
      },
      cancel: {
        label: "Compartir",
        onClick: () => void compartirArchivoGuardado(uri, archivo),
      },
    });
  } catch (e) {
    toast.error("No se pudo guardar el archivo.", { id, description: e instanceof Error ? e.message : undefined });
  }
}

async function abrirArchivoGuardado(uri: string, tipo: string, nombre: string) {
  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: uri, contentType: tipo || undefined });
  } catch {
    // No hay aplicación para ese tipo de archivo: se ofrece compartirlo.
    await compartirArchivoGuardado(uri, nombre);
  }
}

async function compartirArchivoGuardado(uri: string, nombre: string) {
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: nombre, files: [uri], dialogTitle: "Abrir o compartir" });
  } catch {
    /* la persona cerró la hoja de compartir: no es un error */
  }
}

/**
 * Abre un documento de este sitio (una URL de `/api/...`) con la sesión de la
 * app: PDF dentro del visor del CRM, cualquier otra cosa como archivo.
 */
export async function abrirDocumento(url: string, nombreSugerido?: string): Promise<void> {
  const id = toast.loading("Abriendo el documento…");
  try {
    const r = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!r.ok) {
      let detalle = "";
      try {
        const j = await r.json();
        detalle = String(j.detalle ?? j.error ?? j.mensaje ?? "");
      } catch {
        /* no era JSON */
      }
      toast.error(
        r.status === 401 || r.status === 403
          ? "Esta sesión no puede abrir ese documento."
          : r.status === 404
            ? "No se encontró el documento."
            : detalle || `No se pudo abrir el documento (${r.status}).`,
        { id, description: r.status === 404 && detalle ? detalle : undefined },
      );
      return;
    }
    const tipo = r.headers.get("content-type") ?? "";
    const nombre = nombreDeCabecera(r.headers.get("content-disposition")) ?? nombreSugerido ?? nombreDeLaRuta(url);
    const blob = await r.blob();
    toast.dismiss(id);
    if (/pdf/i.test(tipo)) {
      window.dispatchEvent(new CustomEvent<DetalleVerPdf>(EVENTO_VER_PDF, { detail: { blob, nombre } }));
    } else {
      await descargarArchivo(blob, nombre);
    }
  } catch (e) {
    toast.error("No se pudo abrir el documento.", { id, description: e instanceof Error ? e.message : undefined });
  }
}

function nombreDeLaRuta(url: string): string {
  const u = absoluta(url);
  const ultimo = u?.pathname.split("/").filter(Boolean).pop();
  return ultimo ? decodeURIComponent(ultimo) : "documento";
}

/** Imprime la pantalla con el servicio de impresión de Android («Guardar como PDF» incluido). */
export async function imprimirPagina(): Promise<void> {
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const Imprimir = registerPlugin<{ imprimir(opciones?: { nombre?: string }): Promise<void> }>("Imprimir");
    await Imprimir.imprimir({ nombre: document.title || "CRM Efameinsa" });
  } catch (e) {
    toast.error("No se pudo abrir la impresión.", { description: e instanceof Error ? e.message : undefined });
  }
}

/**
 * Decide qué hacer con una dirección que alguien quiso abrir en una pestaña
 * nueva. Devuelve false si no es asunto del puente (que siga su camino).
 *
 *   · teléfono, correo, WhatsApp, mapas      → fuera de la app;
 *   · otra web                               → fuera de la app;
 *   · una pantalla de este sitio             → en la misma ventana (hay «atrás»);
 *   · un documento de /api (PDF, Excel…)     → el visor o la descarga.
 */
export function enrutarApertura(url: string | URL, nombre?: string): boolean {
  const u = absoluta(url);
  if (!u) return false;
  if (ESQUEMAS_EXTERNOS.test(u.href)) {
    void abrirFuera(u.href);
    return true;
  }
  if (u.protocol === "blob:" || u.protocol === "data:") {
    void descargarArchivo(u.href, nombre ?? "archivo");
    return true;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.origin !== window.location.origin) {
    void abrirFuera(u.href);
    return true;
  }
  if (u.pathname.startsWith("/api/")) {
    void abrirDocumento(u.pathname + u.search, nombre);
    return true;
  }
  window.location.assign(u.href);
  return true;
}
