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

// Se llama desde el click del usuario en el callout de "Activar notificaciones"
// — nunca automáticamente al cargar la página (el permiso del navegador se
// pide una sola vez; pedirlo sin contexto lo quema).
export async function activarNotificaciones(): Promise<{ error: string | null }> {
  if (!soportaPush()) return { error: "Este navegador no admite notificaciones push" };

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { error: "Permiso de notificaciones denegado" };

  const registro = await navigator.serviceWorker.register("/sw.js");
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
