// ============================================================
// CRM EFAMEINSA · Paso 10 · Servir las cotizaciones de prueba en local
// ============================================================
// Levanta http://localhost:4173 con el índice de las 116 fichas y sus PDF, para
// poder recorrerlas en el navegador. No usa la base ni la sesión del CRM: sirve
// archivos de scripts/data/fichas-v/ y nada más.
//
// Uso: node scripts/fichas-v-10-servidor.mjs   (Ctrl+C para parar)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const RAIZ = resolve("scripts/data/fichas-v");
const PUERTO = Number(process.env.PUERTO ?? 4173);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
};

createServer(async (pedido, respuesta) => {
  try {
    const url = decodeURIComponent((pedido.url ?? "/").split("?")[0]);
    const relativa = url === "/" ? "index.html" : normalize(url).replace(/^([/\\])+/, "");
    const archivo = join(RAIZ, relativa);
    // Nada fuera de la carpeta, aunque llegue una ruta con "..".
    if (!archivo.startsWith(RAIZ)) {
      respuesta.writeHead(403).end("Fuera de la carpeta");
      return;
    }
    await stat(archivo);
    const datos = await readFile(archivo);
    respuesta.writeHead(200, { "Content-Type": TIPOS[extname(archivo).toLowerCase()] ?? "application/octet-stream" });
    respuesta.end(datos);
  } catch {
    respuesta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No está");
  }
}).listen(PUERTO, () => {
  console.log(`Cotizaciones de prueba en  http://localhost:${PUERTO}`);
  console.log("Ctrl+C para parar.");
});
