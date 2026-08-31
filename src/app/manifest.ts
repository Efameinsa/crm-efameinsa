import type { MetadataRoute } from "next";

/**
 * Manifiesto de la aplicación instalable.
 *
 * POR QUÉ. Santos, 31-08-2026: que el CRM «se abra como una aplicación»,
 * anclada a la barra de tareas, con su ícono, sin barra de direcciones — y que
 * lleguen los avisos a Windows, iMac y celulares. El push ya existía desde el
 * 25-08 (`src/lib/notificaciones.ts` + `public/sw.js`), pero sin manifiesto el
 * navegador no ofrece instalar nada, y en iPhone el push NO EXISTE hasta que la
 * aplicación está instalada en la pantalla de inicio.
 *
 * NO ES UNA APLICACIÓN SIN CONEXIÓN, y no se pretende que lo sea: se descartó
 * el 31-08 porque el 98 % del uso es en PC de escritorio dentro de la oficina y
 * porque la numeración correlativa de cotizaciones y cierres no admite trabajar
 * desconectado. Ver el service worker: no guarda ni un dato del CRM.
 *
 * Next lo publica en `/manifest.webmanifest` y agrega solo el
 * `<link rel="manifest">`. OJO: esa ruta está excluida del proxy de auth en
 * `src/proxy.ts` — el navegador pide el manifiesto SIN cookies, así que detrás
 * del proxy recibiría el HTML del login en vez del JSON y no habría instalación
 * posible. Es la misma trampa que ya costó una tarde con `/sw.js`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Identidad estable de la aplicación instalada: si esto cambia, Windows la
    // trata como OTRA aplicación y quien ya la tenía anclada se queda con un
    // ícono muerto. No tocar.
    id: "/",
    name: "CRM Efameinsa",
    short_name: "CRM Efameinsa",
    description: "Cartera, cotizaciones, agenda y cierres de venta de EFAMEINSA.",

    // Arranca en «/», que el proxy redirige al escritorio de cada rol
    // (comercial, central, gerencia, operaciones, postventa). Se deja así a
    // propósito: es el MISMO arranque para todos y cada quien cae donde
    // trabaja. Si no hay sesión, cae en el login, que es lo correcto.
    start_url: "/",
    scope: "/",

    // «standalone» es lo que pidió Santos: ventana propia, sin barra de
    // direcciones, con su entrada en la barra de tareas.
    display: "standalone",
    orientation: "any",

    // Granate y fondo del área de trabajo, los de marca (ver globals.css).
    // El granate pinta la barra de título de la ventana instalada en Windows.
    theme_color: "#7e1210",
    background_color: "#f5f3f2",

    lang: "es-PE",
    dir: "ltr",
    categories: ["business", "productivity"],

    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // «maskable»: el sistema los recorta a círculo o cuadrado redondeado y
      // solo respeta el 80 % central, por eso son una versión aparte con el
      // emblema más chico. Sin uno de estos, Android dibuja el ícono metido
      // dentro de un cuadrito blanco.
      { src: "/iconos/icono-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],

    // No se declaran `shortcuts` (los accesos del menú contextual del ícono):
    // cada rol trabaja en una ruta distinta y el manifiesto es uno solo para
    // todos, así que un atajo a «Mi día» le saldría en blanco a Central.
  };
}
