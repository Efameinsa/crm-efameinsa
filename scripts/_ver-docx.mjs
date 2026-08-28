// Mira un .docx cualquiera: lo exporta a PDF con Word y lo dibuja a PNG.
// Uso: node scripts/_ver-docx.mjs <archivo.docx> [carpeta-salida]
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, basename } from "node:path";
import { createCanvas } from "canvas";
import "./lib-path2d-shim.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

class FabricaCanvas {
  create(w, h) {
    const canvas = createCanvas(Math.max(1, w | 0), Math.max(1, h | 0));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(e, w, h) { e.canvas.width = Math.max(1, w | 0); e.canvas.height = Math.max(1, h | 0); }
  destroy(e) { if (e?.canvas) { e.canvas.width = 0; e.canvas.height = 0; e.canvas = null; e.context = null; } }
}

const origen = resolve(process.argv[2]).replace(/\\/g, "/");
const dir = process.argv[3] ?? "scripts/data/fichas-v/vista-doc";
mkdirSync(dir, { recursive: true });
const nombre = basename(origen).replace(/\.docx?$/i, "").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40);
const pdf = resolve(dir, `${nombre}.pdf`).replace(/\\/g, "/");

if (!existsSync(pdf)) {
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/convertir-ficha-a-pdf.ps1", origen, pdf], { stdio: "pipe", timeout: 180_000 });
}

const doc = await getDocument({
  url: pdf,
  standardFontDataUrl: resolve("node_modules/pdfjs-dist/standard_fonts/") + "/",
  CanvasFactory: FabricaCanvas,
  isOffscreenCanvasSupported: false,
  isImageDecoderSupported: false,
}).promise;

for (let n = 1; n <= doc.numPages; n++) {
  const pagina = await doc.getPage(n);
  const vista = pagina.getViewport({ scale: 2 });
  const lienzo = createCanvas(vista.width, vista.height);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, vista.width, vista.height);
  await pagina.render({ canvasContext: ctx, viewport: vista, canvas: lienzo }).promise;
  writeFileSync(`${dir}/${nombre}-p${n}.png`, lienzo.toBuffer("image/png"));
}
console.log(`${doc.numPages} páginas → ${dir}/${nombre}-p*.png`);
