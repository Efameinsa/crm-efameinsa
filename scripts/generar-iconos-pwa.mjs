// Genera los íconos de la aplicación instalable a partir del logo de marca.
//
// POR QUÉ EXISTE. El 31-08-2026 Santos pidió que el CRM «se abra como una
// aplicación», con su ícono propio y anclable a la barra de tareas, además de
// que lleguen las notificaciones a Windows, iMac y celulares. Un manifiesto sin
// íconos de 192 y 512 px no habilita el botón «Instalar» de Chrome/Edge, y el
// logo que había en `public/` es un lockup APAISADO (2345×381): puesto de ícono
// sale aplastado e ilegible en la barra de tareas.
//
// QUÉ DECIDE. Del logo blanco (`public/efameinsa-blanco.png`) se recorta SOLO
// el emblema —la «e» dentro del círculo, que ocupa el rectángulo 97,0 246×245
// del original— y se centra sobre un cuadrado granate #7E1210, el color de
// marca. El wordmark «EFAMEINSA» se descarta a propósito: a 192 px no se lee, y
// un ícono ilegible en la barra de tareas es exactamente el problema que se
// venía a resolver. El manual de marca está en CLAUDE.md.
//
// SE CORRE UNA SOLA VEZ y los PNG resultantes se versionan: el build NO
// depende de este script. Usa `sharp`, que está en node_modules porque lo
// arrastra Next (optimización de imágenes) pero NO está declarado en
// package.json — de ahí que se compruebe y se avise en vez de reventar. Si
// algún día falta, `npm i -D sharp` y volver a correr:
//
//   node scripts/generar-iconos-pwa.mjs

import { mkdir } from "node:fs/promises";
import path from "node:path";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "Falta `sharp` en node_modules. Los íconos ya versionados en public/iconos/ siguen sirviendo;\n" +
      "para REGENERARLOS: npm i -D sharp && node scripts/generar-iconos-pwa.mjs",
  );
  process.exit(1);
}

const RAIZ = path.resolve(import.meta.dirname, "..");
const ORIGEN = path.join(RAIZ, "public", "efameinsa-blanco.png");
const DESTINO = path.join(RAIZ, "public", "iconos");

const GRANATE = "#7e1210";

// Recorte del emblema dentro de `efameinsa-blanco.png` (medido sobre el canal
// alfa: la banda superior de píxeles opacos es 97,0 246×245; la de abajo es el
// wordmark, que no se usa).
const EMBLEMA = { left: 97, top: 0, width: 246, height: 245 };

/**
 * Un ícono cuadrado: emblema blanco centrado sobre el granate de marca.
 *
 * `proporcion` es cuánto del lado ocupa el emblema. Los íconos normales usan
 * 0,62 (aire suficiente para que no toque el borde); los `maskable` usan 0,54
 * porque el sistema operativo los RECORTA a círculo o a cuadrado redondeado y
 * solo garantiza el 80 % central — con 0,62 el círculo del emblema quedaría
 * mordido en Android.
 */
async function icono({ lado, proporcion, salida, fondo = GRANATE }) {
  const ladoEmblema = Math.round(lado * proporcion);
  const emblema = await sharp(ORIGEN)
    .extract(EMBLEMA)
    .resize(ladoEmblema, ladoEmblema, { fit: "contain", background: "#00000000" })
    .png()
    .toBuffer();

  const desplazamiento = Math.round((lado - ladoEmblema) / 2);
  await sharp({ create: { width: lado, height: lado, channels: 4, background: fondo } })
    .composite([{ input: emblema, top: desplazamiento, left: desplazamiento }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(DESTINO, salida));

  console.log(`  ✓ ${salida} (${lado}×${lado})`);
}

await mkdir(DESTINO, { recursive: true });
console.log("Íconos de la aplicación instalable:");

// Los dos tamaños que exige el manifiesto para que el navegador ofrezca instalar.
await icono({ lado: 192, proporcion: 0.62, salida: "icono-192.png" });
await icono({ lado: 512, proporcion: 0.62, salida: "icono-512.png" });

// `purpose: maskable`: el sistema los recorta a su antojo, así que el emblema
// va más chico y el granate llega hasta el borde (nunca transparente).
await icono({ lado: 192, proporcion: 0.54, salida: "icono-maskable-192.png" });
await icono({ lado: 512, proporcion: 0.54, salida: "icono-maskable-512.png" });

// iPhone/iPad/iMac: Safari no lee `icons` del manifiesto para el atajo, usa
// `apple-touch-icon`. Sin transparencia (iOS la rellena de negro).
await icono({ lado: 180, proporcion: 0.62, salida: "apple-touch-icon.png" });

// Insignia de la notificación (el cuadradito monocromo que Android/Chrome
// pintan junto al reloj): el sistema la enmascara, así que va el emblema en
// blanco sobre transparente, sin fondo.
await icono({ lado: 96, proporcion: 0.86, salida: "insignia-96.png", fondo: "#00000000" });

console.log("Listo. Se versionan: no hace falta volver a correr esto en cada build.");
