/**
 * Saber si el CRM está corriendo INSTALADO (ventana propia, sin barra de
 * direcciones) o dentro de una pestaña del navegador.
 *
 * Santos, 31-08-2026: la aplicación instalable «simulando una aplicación de
 * escritorio». Dos pantallas se comportan distinto según el caso —el aviso de
 * «Instale el CRM» no tiene sentido si ya está instalado, y la flecha de volver
 * solo hace falta cuando no hay barra del navegador—, así que la pregunta vive
 * en un solo sitio.
 *
 * Se lee con `useSyncExternalStore`, no con `useEffect` + `useState`: esto es
 * exactamente un «sistema externo» que React no controla. Además así el primer
 * render del cliente usa la respuesta del SERVIDOR (siempre «no instalada», que
 * es lo que el servidor no puede saber) y recién después la real, sin
 * desincronizar la hidratación.
 */

/** Suscripción al cambio de modo (pasar de pestaña a ventana instalada). */
export function suscribirModoAplicacion(alCambiar: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const consulta = window.matchMedia("(display-mode: standalone)");
  consulta.addEventListener("change", alCambiar);
  return () => consulta.removeEventListener("change", alCambiar);
}

/** Lectura del navegador. Devuelve un booleano: estable entre renders. */
export function corriendoInstalada(): boolean {
  if (typeof window === "undefined") return false;
  // El segundo caso es Safari en iPhone/iPad, que nunca implementó
  // `display-mode` y expone su propio indicador.
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** En el servidor no hay ventana: se renderiza siempre como «no instalada». */
export function noInstaladaEnElServidor(): boolean {
  return false;
}

/** Nunca cambia durante la vida de la pestaña: no hay a qué suscribirse. */
export function sinCambios(): () => void {
  return () => {};
}

/**
 * Safari (iMac, iPhone, iPad) no dispara `beforeinstallprompt`: ahí no hay
 * botón «Instalar» que ofrecer, hay que decirle a la persona dónde está la
 * opción del menú. Importa de verdad porque en iPhone el push NO FUNCIONA hasta
 * que la aplicación está en la pantalla de inicio.
 *
 * Chrome en iPhone se declara «CriOS» (no «Chrome»), así que también cae acá —
 * y está bien: en iOS todos los navegadores instalan igual, desde «Compartir».
 */
export function esSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
