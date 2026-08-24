// ============================================================
// CRM EFAMEINSA · Rescatar la foto del equipo desde el pantallazo de su ficha
// ============================================================
// Reportado el 24-08: SECU30 salía en el PDF con la foto de otro equipo.
//
// La causa: 21 fichas .docx no traen una foto de producto sino una CAPTURA DE
// PANTALLA COMPLETA (1440×900 o 1920×1080) —se ve el navegador, la barra de
// direcciones y el reloj de Windows—. Como no había imagen usable, el cargador
// del 22-08 le prestó a esos equipos la foto de un hermano de la misma familia.
// Diez quedaron así, y el cliente ve una máquina que no es exactamente la suya.
//
// PERO LA FOTO ESTÁ AHÍ: dentro del pantallazo, sobre fondo blanco. Este script
// la recorta y la deja como foto propia del equipo.
//
// ANTES DE HACERLO SE COMPROBÓ QUE EL PANTALLAZO ES DEL EQUIPO CORRECTO. En el
// de SECU30 se ve una pestaña del navegador que dice "UT075", que es otra
// máquina, y eso daba para pensar que el pantallazo era de un equipo ajeno. No
// lo es: al comparar los 14 pantallazos del catálogo por huella, cada uno
// aparece SOLO dentro de su propia familia — el de los UT030 lo comparten los
// tres UT030 y ninguno más, el de los UT075 solo los UT075, etc. La pestaña
// "UT075" era simplemente otra pestaña abierta en ese momento.
//
// El recorte se hace en tres pasos, todos medidos sobre los píxeles:
//   1. Las BARRAS LATERALES oscuras del visor delimitan la página blanca.
//   2. Se descarta el cromo del navegador (arriba) y la barra de tareas (abajo).
//   3. Dentro de la página se toma el recuadro de lo que no es blanco, y se
//      descartan las filas de arriba y de abajo que solo tienen texto suelto
//      (la URL del visor), que son finas comparadas con el equipo.
//
// Uso: node --env-file=.env.local scripts/rescatar-fotos-de-pantallazos.mjs [--aplicar]
//      node ... --solo SECU30       (para probar con uno)

import { Client } from "pg";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1] : null;
const DESTINO = "public/productos";

const PANTALLAS = new Set([
  "1440x900", "1920x1080", "1366x768", "1536x864", "1600x900",
  "2560x1440", "1280x720", "1280x800", "1680x1050", "3840x2160",
]);

function rutaDocx(ficha) {
  const o = ficha?.origen;
  if (typeof o === "string") return o;
  return o?.ficha_tecnica ?? o?.ficha ?? null;
}

function imagenesDe(docx) {
  const internos = execFileSync("unzip", ["-l", docx], { encoding: "utf-8", maxBuffer: 64e6 })
    .split("\n")
    .map((l) => l.match(/(word\/media\/\S+)$/)?.[1])
    .filter(Boolean);
  const out = [];
  for (const interno of internos) {
    const buf = execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64e6, encoding: "buffer" });
    if (buf.slice(1, 4).toString() !== "PNG") continue;
    out.push({ interno, buf, px: `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}` });
  }
  return out;
}

/** Recorta el equipo de un pantallazo. Devuelve null si no encuentra nada claro. */
async function recortarEquipo(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  const blanco = (x, y) => lum(x, y) > 244;

  // Banda útil: sin cromo del navegador ni barra de tareas.
  const yA = Math.round(H * 0.09);
  const yB = Math.round(H * 0.94);

  // 1. Barras laterales oscuras del visor: columnas casi enteras en oscuro.
  const oscura = (x) => {
    let n = 0;
    for (let y = yA; y < yB; y += 3) if (lum(x, y) < 80) n++;
    return n / ((yB - yA) / 3) > 0.8;
  };
  let X0 = 0;
  while (X0 < W - 1 && oscura(X0)) X0++;
  // Si la barra empieza más adentro (hay un borde claro de 1 px), se busca la
  // última columna oscura de la mitad izquierda.
  for (let x = 0; x < Math.round(W / 2); x++) if (oscura(x)) X0 = x + 1;
  let X1 = W - 1;
  for (let x = W - 1; x > Math.round(W / 2); x--) if (oscura(x)) X1 = x - 1;
  if (X1 - X0 < W * 0.2) return null; // sin página reconocible

  // 2. Recuadro de lo que no es blanco dentro de la página.
  const filaContenido = [];
  for (let y = yA; y <= yB; y++) {
    let n = 0;
    for (let x = X0; x <= X1; x++) if (!blanco(x, y)) n++;
    filaContenido.push({ y, n });
  }
  const anchoPagina = X1 - X0 + 1;
  // 3. Se ignoran las filas finas: texto suelto del visor, no el equipo.
  const sustanciales = filaContenido.filter((f) => f.n > anchoPagina * 0.04);
  if (sustanciales.length < H * 0.1) return null;
  const ay = sustanciales[0].y;
  const by = sustanciales[sustanciales.length - 1].y;

  let ax = X1;
  let bx = X0;
  for (let y = ay; y <= by; y++) {
    for (let x = X0; x <= X1; x++) {
      if (!blanco(x, y)) {
        if (x < ax) ax = x;
        if (x > bx) bx = x;
      }
    }
  }
  if (bx - ax < W * 0.05 || by - ay < H * 0.1) return null;

  // Filtro de cordura. Un recorte que abarca casi toda la pantalla no es un
  // equipo: es que el pantallazo tenía otra maquetación (sin barras laterales)
  // y la detección se llevó el navegador entero. Y una máquina de lavandería
  // siempre es MÁS ALTA QUE ANCHA en estas fotos de catálogo; si sale apaisada,
  // el recorte agarró de más. Los dos casos se dejan fuera para que alguien los
  // mire, en vez de meter una imagen cualquiera en la cotización de un cliente.
  const ancho = bx - ax + 1;
  const alto = by - ay + 1;
  if (ancho > W * 0.6) return null;
  if (alto / ancho < 0.9) return null;

  const m = 18;
  const left = Math.max(0, ax - m);
  const top = Math.max(0, ay - m);
  return {
    caja: `${bx - ax + 1}x${by - ay + 1}`,
    left,
    top,
    width: Math.min(W - left, bx - ax + 1 + 2 * m),
    height: Math.min(H - top, by - ay + 1 + 2 * m),
  };
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// A quién le hace falta el rescate. Dos casos, y el segundo apareció el 24-08
// al revisar la LAV180 (PRIMUS RX180 gris):
//
//   a) Los que muestran la foto de otro equipo (`foto_prestada_de`).
//   b) Los que COMPARTEN su archivo de foto con otro equipo. El cargador
//      prefirió la imagen "limpia" del .docx sobre el pantallazo — pero esa
//      imagen limpia es la foto GENÉRICA del catálogo de la marca, la misma en
//      todas las fichas de la familia. Hay una compartida por NUEVE equipos.
//      El pantallazo, en cambio, es del modelo concreto: en el de la LAV180 se
//      ve la máquina GRIS —como dice su propio nombre de archivo— y la pestaña
//      del navegador dice "RX80_OPL_XCnt". La genérica es plateada.
//
// Compartir foto no siempre está mal: la UWT130 en 220V y en 380V es la misma
// máquina. Por eso no se toca al que no tiene pantallazo propio del cual sacar
// algo mejor — y por eso el recorte se revisa antes de aplicarlo.
// ⚠️ Se compara por CONTENIDO, no por nombre de archivo. Los duplicados tienen
// nombres distintos —lav180-v1.png, lav1801.png, lav240.png…— y los mismos
// bytes adentro, así que agrupar por `foto_path` no encontraba casi ninguno.
const { rows: todos } = await bd.query(
  `select id, sku, marca, modelo, foto_path, ficha from productos where activo order by sku`,
);

const porContenido = new Map();
for (const p of todos) {
  if (!p.foto_path) continue;
  const archivo = join(DESTINO, basename(p.foto_path));
  if (!existsSync(archivo)) continue;
  const h = createHash("sha1").update(readFileSync(archivo)).digest("hex");
  if (!porContenido.has(h)) porContenido.set(h, []);
  porContenido.get(h).push(p.id);
}
const compartenCon = new Map();
for (const ids of porContenido.values()) for (const id of ids) compartenCon.set(id, ids.length);

const rows = todos
  .filter((p) => {
    if (p.ficha?.origen?.foto_rescatada_de_pantallazo) return false; // ya rescatado
    return Boolean(p.ficha?.origen?.foto_prestada_de) || (compartenCon.get(p.id) ?? 1) > 1;
  })
  .map((p) => ({ ...p, comparten: compartenCon.get(p.id) ?? 1 }));

console.log(`Equipos con foto ajena o compartida: ${rows.length}\n`);
let rescatados = 0;

for (const p of rows) {
  if (SOLO && p.sku !== SOLO) continue;
  const docx = rutaDocx(p.ficha);
  if (!docx || !existsSync(docx)) {
    console.log(`  ${String(p.sku).padEnd(11)} sin ficha localizable`);
    continue;
  }
  const capturas = imagenesDe(docx).filter((i) => PANTALLAS.has(i.px));
  if (capturas.length === 0) continue; // sin pantallazo no hay nada mejor que ofrecer

  const r = await recortarEquipo(capturas[0].buf);
  if (!r) {
    console.log(`  ${String(p.sku).padEnd(11)} el pantallazo (${capturas[0].px}) no dejó un recorte claro`);
    continue;
  }

  const archivo = `${String(p.sku).toLowerCase()}.png`;
  console.log(
    `  ${String(p.sku).padEnd(11)} ${String(p.marca + " " + p.modelo).padEnd(24)} comparten ${p.comparten} · pantallazo ${capturas[0].px} → ${r.caja} → ${archivo}`,
  );
  rescatados++;

  if (!APLICAR) continue;

  await sharp(capturas[0].buf)
    .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
    .flatten({ background: "#ffffff" })
    .resize({ width: 700, withoutEnlargement: true })
    .png()
    .toFile(`${DESTINO}/${archivo}`);

  const ficha = { ...(p.ficha ?? {}) };
  ficha.origen = {
    ...(typeof ficha.origen === "object" ? ficha.origen : {}),
    foto_prestada_de: null,
    foto_rescatada_de_pantallazo: capturas[0].interno,
  };
  await bd.query(`update productos set foto_path = $2, ficha = $3, updated_at = now() where id = $1`, [
    p.id,
    `/productos/${archivo}`,
    JSON.stringify(ficha),
  ]);
}

console.log(
  APLICAR
    ? `\n${rescatados} foto(s) rescatada(s). Conviene mirarlas antes de cotizar con ellas.`
    : `\n${rescatados} por rescatar. (Simulación: correr con --aplicar.)`,
);

await bd.end();
