// ============================================================
// CRM EFAMEINSA · Paso 7 · Rescatar la foto de dentro del pantallazo
// ============================================================
// Seis fichas no tienen más imagen que una captura de pantalla, y el CRM
// tampoco tiene foto propia de ese equipo. Pero el equipo SE VE dentro de la
// captura: son capturas de un visor de PDF, con barras negras a los lados y la
// máquina sobre fondo blanco en el medio.
//
// El recorte busca eso mismo: primero descarta las columnas y filas negras
// (las barras del visor y el cromo del navegador), y de lo que queda se
// encoge hasta el rectángulo que contiene algo distinto del blanco — la
// máquina. Se deja un margen de 2 % para no comerle el borde.
//
// SIEMPRE se mira el resultado antes de darlo por bueno: el paso escribe una
// hoja de contacto con el antes y el después.
//
// Uso: node scripts/fichas-v-07-recortar-pantallazos.mjs [CODIGO...]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "canvas";

const CLASIFICACION = "scripts/data/fichas-v/clasificacion.json";
const DIR = "scripts/data/fichas-v/recortes";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = (ruta) => "file:///" + resolve(ruta).split("\\").join("/");

const { fichas } = JSON.parse(readFileSync(CLASIFICACION, "utf-8"));
const pedidos = process.argv.slice(2).map((c) => c.toUpperCase());
mkdirSync(DIR, { recursive: true });

/** Recorta el contenido útil de una captura y lo devuelve como PNG. */
async function recortar(origen, destino) {
  const img = await loadImage(resolve(origen));
  const lienzo = createCanvas(img.width, img.height);
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  const luz = (x, y) => {
    const i = (y * width + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };

  // 1. Fuera el cromo del navegador y la barra de tareas: viven en el 8 % de
  //    arriba y el 8 % de abajo de la captura de una ventana maximizada.
  const yA = Math.round(height * 0.08);
  const yB = Math.round(height * 0.92);

  // 2. La banda de la imagen: las columnas que son blancas casi de arriba a
  //    abajo. A los lados quedan las barras negras del visor.
  const columnaBlanca = (x) => {
    let claros = 0;
    let total = 0;
    for (let y = yA; y <= yB; y += 3) {
      total++;
      if (luz(x, y) > 200) claros++;
    }
    return claros / total > 0.55;
  };
  // Se busca la RACHA MÁS LARGA de columnas claras, no la primera: la ventana
  // de Windows tiene un borde blanco de un píxel en los dos extremos y, yendo
  // de afuera hacia adentro, el recorte se detenía en ese borde y no recortaba
  // nada.
  let x0 = 0;
  let x1 = width - 1;
  let mejorInicio = -1;
  let mejorLargo = 0;
  let inicio = -1;
  for (let x = 0; x < width; x++) {
    if (columnaBlanca(x)) {
      if (inicio === -1) inicio = x;
      if (x - inicio + 1 > mejorLargo) {
        mejorLargo = x - inicio + 1;
        mejorInicio = inicio;
      }
    } else {
      inicio = -1;
    }
  }
  if (mejorLargo > width * 0.2) {
    x0 = mejorInicio;
    x1 = mejorInicio + mejorLargo - 1;
  } else {
    x0 = Math.round(width * 0.05);
    x1 = Math.round(width * 0.95);
  }

  // 3. Dentro de la banda, el rectángulo que ocupa el equipo: lo que no es
  //    blanco. Se exige varios píxeles por fila para que una sombra suelta o
  //    una raya del visor no agranden el recorte.
  // Umbral flojo y cuenta absoluta: el equipo es BLANCO sobre fondo blanco y,
  // exigiendo un porcentaje de píxeles oscuros, el recorte le comía el costado
  // derecho a las secadoras UT075 (se veía la máquina cortada por la mitad).
  const filaConContenido = (y) => {
    let cuenta = 0;
    for (let x = x0; x <= x1; x += 2) if (luz(x, y) < 240) cuenta++;
    return cuenta >= 3;
  };
  const columnaConContenido = (x, ya, yb) => {
    let cuenta = 0;
    for (let y = ya; y <= yb; y += 2) if (luz(x, y) < 240) cuenta++;
    return cuenta >= 3;
  };

  let y0 = yA;
  let y1 = yB;
  while (y0 < y1 && !filaConContenido(y0)) y0++;
  while (y1 > y0 && !filaConContenido(y1)) y1--;
  while (x0 < x1 && !columnaConContenido(x0, y0, y1)) x0++;
  while (x1 > x0 && !columnaConContenido(x1, y0, y1)) x1--;

  const margen = Math.round((x1 - x0) * 0.04);
  x0 = Math.max(0, x0 - margen);
  y0 = Math.max(0, y0 - margen);
  x1 = Math.min(width - 1, x1 + margen);
  y1 = Math.min(height - 1, y1 + margen);

  const ancho = x1 - x0 + 1;
  const alto = y1 - y0 + 1;
  const salida = createCanvas(ancho, alto);
  salida.getContext("2d").drawImage(lienzo, x0, y0, ancho, alto, 0, 0, ancho, alto);
  writeFileSync(destino, salida.toBuffer("image/png"));
  return { ancho, alto, de: `${img.width}×${img.height}` };
}

const sinFoto = fichas.filter(
  (f) => !f.imagenes.some((i) => i.rol === "producto") && (pedidos.length === 0 || pedidos.includes(f.codigo)),
);

const hechos = [];
for (const f of sinFoto) {
  const captura = f.imagenes.find((i) => i.rol === "pantallazo");
  if (!captura) continue;
  const destino = `${DIR}/${f.codigo}.png`;
  try {
    const r = await recortar(captura.archivo, destino);
    hechos.push({ codigo: f.codigo, origen: captura.archivo, destino, ...r });
    console.log(`  ✓ ${f.codigo.padEnd(11)} ${r.de} → ${r.ancho}×${r.alto}`);
  } catch (e) {
    console.log(`  ✗ ${f.codigo}: ${String(e.message ?? e).slice(0, 70)}`);
  }
}

// Hoja de contacto con el antes y el después.
const html = `<!doctype html><meta charset=utf-8><style>
body{font:13px Segoe UI,Arial;margin:16px} section{border-top:1px solid #ddd;padding:10px 0}
.par{display:flex;gap:22px;align-items:flex-start} figure{margin:0}
img{max-width:420px;max-height:300px;border:1px solid #eee;display:block}
figcaption{font-size:11px;text-align:center;color:#555}</style>
<h1 style="font-size:15px">Recorte del pantallazo · antes y después</h1>
${hechos
  .map(
    (h) => `<section><b>${h.codigo}</b><div class=par>
  <figure><img src="${url(h.origen)}"><figcaption>original ${h.de}</figcaption></figure>
  <figure><img src="${url(h.destino)}"><figcaption>recorte ${h.ancho}×${h.alto}</figcaption></figure>
</div></section>`,
  )
  .join("")}`;
writeFileSync(`${DIR}/revision.html`, html);
execFileSync(
  EDGE,
  ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,2400", `--screenshot=${resolve(`${DIR}/revision.png`)}`, url(`${DIR}/revision.html`)],
  { stdio: "ignore", timeout: 120_000 },
);
writeFileSync(`${DIR}/recortes.json`, JSON.stringify(hechos, null, 2));
console.log(`\n${hechos.length} recortes · revisar ${DIR}/revision.png`);
