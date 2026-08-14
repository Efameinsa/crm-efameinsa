// Service worker mínimo: solo recibe push y maneja el click de la notificación.
// No cachea nada (no es una PWA offline todavía — eso es v2).

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let datos = {};
  try {
    datos = event.data.json();
  } catch {
    datos = { title: "CRM Efameinsa", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(datos.title || "CRM Efameinsa", {
      body: datos.body || "",
      icon: "/logo-efameinsa.png",
      badge: "/logo-efameinsa.png",
      data: { url: datos.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
