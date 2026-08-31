"use client";

import { guardarSuscripcionPush } from "@/lib/acciones/notificaciones";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Segura = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64Segura);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function soportaPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Registrar `/sw.js`, una sola vez y sin ruido.
 *
 * Se llama desde `AplicacionInstalable` al entrar a cualquier pantalla del CRM
 * (31-08-2026). Antes solo se registraba dentro de `activarNotificaciones()`,
 * o sea únicamente cuando alguien pulsaba el botón del callout: mientras nadie
 * lo pulsara, el navegador no veía service worker y por lo tanto NO ofrecía
 * instalar la aplicación —Chrome exige uno con manejador de `fetch`— y el push
 * dependía de un clic que Central tardó semanas en dar.
 *
 * `register()` es idempotente: llamarlo con la misma URL y el mismo alcance no
 * vuelve a instalar nada, solo devuelve el registro que ya hay.
 */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    // Que no se pueda registrar no rompe nada del CRM: solo se pierden el
    // aviso push y la instalación. Queda en la consola para poder mirarlo.
    console.warn("No se pudo registrar el service worker", err);
    return null;
  }
}

// Se llama desde el click del usuario en el callout de "Activar notificaciones"
// — nunca automáticamente al cargar la página (el permiso del navegador se
// pide una sola vez; pedirlo sin contexto lo quema).
export async function activarNotificaciones(): Promise<{ error: string | null }> {
  if (!soportaPush()) return { error: "Este navegador no admite notificaciones push" };

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { error: "Permiso de notificaciones denegado" };

  const registro = await registrarServiceWorker();
  if (!registro) return { error: "No se pudo preparar las notificaciones en este equipo" };
  await navigator.serviceWorker.ready;

  const suscripcionExistente = await registro.pushManager.getSubscription();
  const suscripcion =
    suscripcionExistente ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
    }));

  const json = suscripcion.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { error: "No se pudo completar la suscripción" };
  }

  return guardarSuscripcionPush({
    endpoint: json.endpoint,
    claves: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}
