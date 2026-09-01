// Service worker del CRM Efameinsa.
//
// HISTORIA. Nació el 25-08-2026 haciendo una sola cosa: recibir el push y
// abrir la pantalla al hacer clic. El 31-08 Santos pidió las dos cosas que
// faltaban —«que lleguen las notificaciones» y «que se abra como una
// aplicación, simulando una aplicación de escritorio»— y este archivo pasó a
// ser también el requisito técnico de la instalación: Chrome y Edge NO ofrecen
// el botón «Instalar» si el sitio no tiene un service worker con manejador de
// `fetch`.
//
// LO QUE ESTE ARCHIVO NO HACE, A PROPÓSITO
// Acá NO se guarda ni una respuesta de Supabase, ni una pantalla del CRM con
// datos, ni nada bajo /api. Mostrar la cartera de ayer como si fuera la de
// hoy es peor que no mostrar nada — este sistema ya tuvo incidentes por
// pantallas que mentían (Kanban y «Mi día» vacíos, la campana marcando 2 sin
// nada que atender). Lo que se cachea: los ESTÁTICOS DE LA PROPIA APLICACIÓN
// (hash en el nombre, no envejecen) y — desde la v2, plan 26 — la página
// /offline, que no tiene ni un dato: solo dice la verdad («sin conexión») y
// reintenta sola. La mañana del 31-08 el offline se había descartado entero;
// esa noche Santos redefinió el objetivo —«la intención de la PWA era
// trabajar bien en local»— y el plan 26 lo resuelve SIN romper la regla de
// no cachear datos: la app abre, avisa honesto, y los correlativos sin
// internet salen de la despensa del coordinador local, jamás inventados.
//
// OJO: `/sw.js` está excluido del matcher del proxy de auth en `src/proxy.ts`.
// Un service worker servido detrás de una redirección lo rechaza el navegador
// («script resource is behind a redirect»). No devolver eso al proxy.

// Subir la versión INVALIDA el caché entero en la próxima activación. Se sube
// solo si cambia lo que se cachea, no en cada despliegue: los estáticos de Next
// ya vienen con hash.
const VERSION = "crm-efameinsa-v2";
const CACHE_ESTATICOS = `estaticos-${VERSION}`;

// Lo poco que conviene tener listo desde el primer arranque: el ícono y la
// insignia que pinta la notificación, y la página honesta del corte de
// internet (plan 26). Si fallan, la instalación NO se aborta (un ícono
// ausente no es motivo para dejar sin service worker a nadie).
const PAGINA_OFFLINE = "/offline";
const PRECARGA = ["/iconos/icono-192.png", "/iconos/insignia-96.png", PAGINA_OFFLINE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_ESTATICOS);
        await cache.addAll(PRECARGA);
      } catch (err) {
        console.warn("sw: no se pudo precargar los íconos", err);
      }
      // Sin esto, una versión nueva del service worker se queda «en espera»
      // hasta que la persona cierre TODAS las ventanas del CRM — y acá la
      // gente deja la pestaña abierta toda la jornada.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== CACHE_ESTATICOS).map((n) => caches.delete(n)));
      // Tomar el control de las pestañas YA ABIERTAS. No es cosmético: sin
      // esto la página que registra el service worker queda sin controlar, y
      // `client.navigate()` —lo que lleva la ventana a la pantalla del aviso al
      // hacer clic en la notificación— falla en las ventanas no controladas.
      // Ese era el motivo real de que el clic en la notificación enfocara la
      // ventana pero se quedara donde estaba.
      await self.clients.claim();
    })(),
  );
});

/**
 * ¿Este pedido es un estático inmutable de la propia aplicación?
 *
 * Solo `/_next/static/**` (JS y CSS con hash de contenido en el nombre) y los
 * íconos/logos que servimos desde `public/`. TODO lo demás —pantallas, server
 * actions, /api, Supabase, R2— va a la red siempre, sin excepción.
 */
function esEstaticoDeLaAplicacion(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/iconos/")) return true;
  return /^\/(logo-efameinsa|logo-efameinsa-listo|efameinsa-blanco)\.png$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const pedido = event.request;
  if (pedido.method !== "GET") return;

  let url;
  try {
    url = new URL(pedido.url);
  } catch {
    return;
  }

  // NAVEGACIONES (abrir o refrescar una pantalla): red primero, siempre —
  // y si la red no está, la página honesta de «sin conexión» (plan 26).
  // Nunca una pantalla vieja con datos: /offline no tiene ni uno.
  if (pedido.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(pedido);
        } catch {
          const cache = await caches.open(CACHE_ESTATICOS);
          const offline = await cache.match(PAGINA_OFFLINE);
          return offline ?? new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  // No llamar a respondWith() = el navegador hace su pedido normal, como si
  // este service worker no existiera. Es el camino del 99 % del tráfico.
  if (!esEstaticoDeLaAplicacion(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      const guardado = await cache.match(pedido);
      if (guardado) return guardado;

      const respuesta = await fetch(pedido);
      // Solo se guarda lo que llegó bien y completo (`basic` = mismo origen).
      if (respuesta.ok && respuesta.type === "basic") {
        cache.put(pedido, respuesta.clone()).catch(() => {});
      }
      return respuesta;
    })(),
  );
});

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
      // Antes acá iba `logo-efameinsa.png`, que mide 2345×381: el sistema lo
      // aplastaba dentro de un cuadrado y no se reconocía. Ahora va el ícono
      // cuadrado de la aplicación, el mismo de la barra de tareas.
      icon: "/iconos/icono-192.png",
      badge: "/iconos/insignia-96.png",
      // Una urgencia de Central NO se va sola. Es la misma regla que ya rige la
      // ventanita dentro del CRM desde el 25-08 (caso Mi Casita Facilita: un
      // cliente reclamó que lo dejaron esperando). Si el aviso desapareciera
      // solo, quien fue al baño vuelve y no se entera.
      requireInteraction: datos.tipo === "urgencia",
      // Agrupar por destino evita apilar diez avisos del mismo sitio, pero
      // `renotify` es OBLIGATORIO acá: sin él, el segundo aviso reemplazaría al
      // primero EN SILENCIO y un prospecto podría pasar desapercibido — que es
      // justo lo que estos avisos vienen a impedir. Las urgencias no se
      // agrupan nunca: cada cliente que espera es un caso aparte.
      tag: datos.tipo === "urgencia" ? undefined : datos.url || undefined,
      renotify: datos.tipo !== "urgencia" && Boolean(datos.url),
      // Sonido pedido EXPLÍCITO (Santos, 31-08: «es delicado recibir un lead
      // y no atenderlo»). `silent: false` le dice al sistema que este aviso
      // debe sonar; si aun así no suena, el mudo está en Windows (el sonido
      // por aplicación) o en el navegador — la lista de configuración por
      // máquina está en docs/27-sonido-y-segundo-plano.md.
      silent: false,
      vibrate: [200, 100, 200],
      data: { url: datos.url || "/", tipo: datos.tipo || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // 1) Si ya hay una ventana EN esa pantalla, solo se la trae al frente.
      const exacta = ventanas.find((v) => v.url === destino);
      if (exacta) return exacta.focus();

      // 2) Cualquier ventana del CRM: se la lleva al destino y se la enfoca.
      //    `navigate()` puede rechazar cuando la ventana no la controla este
      //    service worker — una pestaña que quedó abierta desde antes de que
      //    se instalara o se actualizara. `clients.claim()` cubre casi todos
      //    esos casos, pero no todos.
      let sinLlevar = null;
      for (const ventana of ventanas) {
        if (!ventana.url.startsWith(self.location.origin)) continue;
        try {
          const llevada = await ventana.navigate(destino);
          await (llevada ?? ventana).focus();
          return;
        } catch {
          // Se recuerda por si al final no queda nada mejor, pero NO se
          // termina acá.
          sinLlevar = sinLlevar ?? ventana;
        }
      }

      // 3) Ninguna ventana se dejó llevar, o no había ninguna. Se abre el
      //    destino. Con la aplicación instalada, Chrome y Edge lo abren en la
      //    VENTANA DE LA APLICACIÓN (el destino está dentro del `scope` del
      //    manifiesto), no en una pestaña suelta del navegador.
      //
      //    ⚠️ Acá estaba el «hago clic en el aviso y no sale nada» que reportó
      //    postventa el 01-09: cuando `navigate()` rechazaba, el código
      //    enfocaba la ventana y terminaba. La persona veía el CRM saltar al
      //    frente y quedarse en la misma pantalla, como si el aviso no
      //    llevara a ningún lado. Enfocar sin navegar no es un plan B: es
      //    quedarse a medias. Solo se enfoca si ni siquiera se puede abrir.
      try {
        await self.clients.openWindow(destino);
      } catch {
        if (sinLlevar) await sinLlevar.focus();
      }
    })(),
  );
});
