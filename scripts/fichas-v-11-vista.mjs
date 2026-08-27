// ============================================================
// CRM EFAMEINSA · Paso 11 · La VISTA de cada ficha, para mirarla
// ============================================================
// Regla que fijó Darwin el 27-08: «siempre haz una vista para analizar lo que
// tienes y ver de dónde a dónde es la imagen y de dónde a dónde es otro
// elemento como logo».
//
// El .docx guarda las imágenes sueltas, con nombres que no dicen nada
// (image3.png) y en un orden que no siempre es el de la página. Mirando la
// hoja armada, en cambio, se ve al instante qué es el logo, qué es el equipo y
// qué es la vista de complemento del pie. Por eso cada ficha se exporta a PDF
// con Word y se dibuja a PNG: esa imagen es la que se revisa, y de ahí salen
// los recortes cuando el archivo incrustado no sirve.
//
// Deja scripts/data/fichas-v/vista/<CODIGO>-p1.png (y -p2 si tiene dos hojas).
//
// Uso: node scripts/fichas-v-11-vista.mjs [CODIGO...]

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createCanvas } from "canvas";
import "./lib-path2d-shim.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const LISTA = "scripts/data/fichas-v/lista.json";
const DIR = "scripts/data/fichas-v/vista";
const ESCALA = 2; // ~150 ppp: alcanza para mirar y para recortar
const TIMEOUT_MS = 120_000;

class FabricaCanvas {
  create(w, h) {
    const canvas = createCanvas(Math.max(1, w | 0), Math.max(1, h | 0));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(entrada, w, h) {
    entrada.canvas.width = Math.max(1, w | 0);
    entrada.canvas.height = Math.max(1, h | 0);
  }
  destroy(entrada) {
    if (entrada?.canvas) {
      entrada.canvas.width = 0;
      entrada.canvas.height = 0;
      entrada.canvas = null;
      entrada.context = null;
    }
  }
}

const { productos } = JSON.parse(readFileSync(LISTA, "utf-8"));
const pedidos = process.argv.slice(2).map((c) => c.toUpperCase());
const elegidos = pedidos.length ? productos.filter((p) => pedidos.includes(p.codigo)) : productos;
mkdirSync(DIR, { recursive: true });

let hechas = 0;
const fallidas = [];

for (const p of elegidos) {
  const pdf = resolve(DIR, `${p.codigo}.pdf`).replace(/\\/g, "/");
  try {
    if (!existsSync(pdf) || statSync(pdf).size === 0) {
      execFileSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/convertir-ficha-a-pdf.ps1", p.docx, pdf],
        { timeout: TIMEOUT_MS, stdio: "pipe" },
      );
    }

    const doc = await getDocument({
      url: pdf,
      standardFontDataUrl: resolve("node_modules/pdfjs-dist/standard_fonts/") + "/",
      CanvasFactory: FabricaCanvas,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    }).promise;

    for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
      const pagina = await doc.getPage(n);
      const vista = pagina.getViewport({ scale: ESCALA });
      const lienzo = createCanvas(vista.width, vista.height);
      const ctx = lienzo.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, vista.width, vista.height);
      await pagina.render({ canvasContext: ctx, viewport: vista, canvas: lienzo }).promise;
      writeFileSync(`${DIR}/${p.codigo}-p${n}.png`, lienzo.toBuffer("image/png"));
    }
    hechas++;
    if (hechas % 10 === 0) console.log(`  ${hechas}/${elegidos.length}`);
  } catch (e) {
    fallidas.push({ codigo: p.codigo, error: String(e.message ?? e).slice(0, 100) });
    try {
      execFileSync("taskkill", ["/F", "/IM", "WINWORD.EXE"], { stdio: "ignore" });
    } catch {
      /* no quedó Word colgado */
    }
  }
}

console.log(`\nVistas: ${hechas}  ·  fallidas: ${fallidas.length}`);
for (const f of fallidas) console.log(`  ✗ ${f.codigo}: ${f.error}`);
console.log(`→ ${DIR}`);
