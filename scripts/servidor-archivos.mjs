// ============================================================
// CRM EFAMEINSA · Servidor de archivos de la oficina
// ============================================================
// Sirve por HTTP, de SOLO LECTURA, los documentos que ya viven en el servidor
// de la empresa (\\192.168.10.210): informes técnicos en PDF y Word, fotos por
// cliente y videos cortos. Son ~22 GB en total, 5,4 GB solo de 2025-2026.
//
// POR QUÉ EXISTE. Santos, 31-08-2026: «quiero dejar de usar R2 de Cloudflare
// que hemos estado usando como almacenamiento y gestionar todos los documentos
// desde nuestro servidor local, pero que nuestro CRM lo pueda encontrar como si
// fuera una nube». El 98 % del uso del CRM es dentro de la oficina, así que el
// navegador puede pedirle el archivo DIRECTO a este servicio por la red local
// —11 MB/s medidos— sin que pase por internet. Hoy, con R2, todo baja de
// afuera por un enlace de 69 Mbps compartido.
//
// LO QUE NO HACE, a propósito:
//   · No escribe. Nunca. Ni borra, ni mueve, ni renombra. Es de solo lectura y
//     así no puede arruinar el archivo de la empresa.
//   · No lista carpetas. No es un explorador: solo entrega el archivo exacto
//     que el CRM pidió y firmó.
//   · No tiene base de datos ni sesión. Quién puede ver qué lo decide el CRM,
//     que es donde viven los permisos.
//
// CÓMO SE PROTEGE. El CRM firma cada enlace con un secreto compartido y una
// fecha de vencimiento —igual que hacía R2 con sus URL firmadas de 5 minutos—.
// Sin firma válida no entrega nada. Y aunque alguien adivine una firma, solo
// puede leer dentro de las carpetas declaradas acá abajo: cualquier intento de
// salirse con «..» se rechaza comparando la ruta REAL ya resuelta.
//
// SIN DEPENDENCIAS. Solo Node. No hay `npm install` que hacer en el servidor:
// se copia este archivo y se corre. Es a propósito, para que el ingeniero de
// sistemas no tenga que instalar nada más en una máquina de producción.
//
// USO:
//   set ARCHIVOS_SECRETO=<el mismo secreto que el CRM>
//   node servidor-archivos.mjs
//
// Variables:
//   ARCHIVOS_SECRETO  (obligatoria) secreto compartido con el CRM
//   ARCHIVOS_PUERTO   (opcional, 8080 por defecto)
//   ARCHIVOS_RAICES   (opcional) rutas permitidas separadas por «;»
//   ARCHIVOS_ORIGEN   (opcional) de dónde se acepta que venga el pedido

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolve, sep, extname, basename } from "node:path";

const PUERTO = Number(process.env.ARCHIVOS_PUERTO ?? 8080);
const SECRETO = process.env.ARCHIVOS_SECRETO ?? "";
const ORIGEN = process.env.ARCHIVOS_ORIGEN ?? "https://crm.efameinsa.com";

// LAS CARPETAS PERMITIDAS. Fuera de estas, el servicio no lee nada.
// En la prueba desde una PC de la oficina se usan las unidades mapeadas; en el
// servidor se cambian por las rutas locales del disco, que son más rápidas.
const RAICES_POR_DEFECTO = [
  "X:\\", // \\192.168.10.210\Mantenimiento\POST VENTA 2026\INFORMES DE SERVICIO TECNICOS 2023
  "W:\\", // \\192.168.10.210\09. fotos\CLIENTES
  "V:\\", // \\192.168.10.210\Ventas\...\FICHA TECNICA 2021-2026
];
const RAICES = (process.env.ARCHIVOS_RAICES ? process.env.ARCHIVOS_RAICES.split(";") : RAICES_POR_DEFECTO)
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => resolve(r));

if (!SECRETO || SECRETO.length < 24) {
  console.error("Falta ARCHIVOS_SECRETO (mínimo 24 caracteres). El servicio no arranca sin eso.");
  process.exit(1);
}

const TIPOS = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".3gp": "video/3gpp",
  ".txt": "text/plain; charset=utf-8",
};

/** La firma que emite el CRM: ruta + vencimiento, con el secreto compartido. */
function firmar(rutaB64, vence) {
  return createHmac("sha256", SECRETO).update(`${rutaB64}.${vence}`).digest("base64url");
}

/** Comparación en tiempo constante: comparar firmas con === filtra el secreto. */
function firmaValida(esperada, recibida) {
  const a = Buffer.from(esperada);
  const b = Buffer.from(recibida ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Que la ruta caiga DENTRO de una carpeta permitida, mirando la ruta ya
 * resuelta y no el texto. Es lo que frena un «..\..\Windows\System32».
 */
function dentroDeUnaRaiz(rutaAbsoluta) {
  return RAICES.some((raiz) => rutaAbsoluta === raiz || rutaAbsoluta.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep));
}

const registro = [];
const anotar = (linea) => {
  const l = `${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}  ${linea}`;
  registro.push(l);
  if (registro.length > 500) registro.shift();
  console.log(l);
};

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  // Que el CRM (y quien monitoree) pueda preguntar si esto está vivo.
  if (url.pathname === "/estado") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": ORIGEN });
    res.end(JSON.stringify({ vivo: true, raices: RAICES, desde: arranque, servidas, rechazadas }, null, 2));
    return;
  }

  if (url.pathname !== "/archivo") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("No hay nada acá. Este servicio solo entrega archivos firmados por el CRM.");
    return;
  }

  const rutaB64 = url.searchParams.get("p") ?? "";
  const vence = Number(url.searchParams.get("e") ?? 0);
  const firma = url.searchParams.get("s") ?? "";

  if (!rutaB64 || !vence || !firma) {
    rechazadas++;
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Pedido incompleto.");
    return;
  }

  if (Date.now() / 1000 > vence) {
    rechazadas++;
    anotar(`VENCIDO  ${basename(Buffer.from(rutaB64, "base64url").toString("utf8"))}`);
    res.writeHead(410, { "content-type": "text/plain; charset=utf-8" });
    res.end("Este enlace venció. Vuelva a abrirlo desde el CRM.");
    return;
  }

  if (!firmaValida(firmar(rutaB64, vence), firma)) {
    rechazadas++;
    anotar(`FIRMA MAL  desde ${req.socket.remoteAddress}`);
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Enlace no válido.");
    return;
  }

  let ruta;
  try {
    ruta = resolve(Buffer.from(rutaB64, "base64url").toString("utf8"));
  } catch {
    rechazadas++;
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Ruta ilegible.");
    return;
  }

  if (!dentroDeUnaRaiz(ruta)) {
    rechazadas++;
    anotar(`FUERA DE RAÍZ  ${ruta}`);
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Esa ruta no se sirve desde acá.");
    return;
  }

  let info;
  try {
    info = await stat(ruta);
    if (!info.isFile()) throw new Error("no es un archivo");
  } catch {
    anotar(`NO ESTÁ  ${ruta}`);
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("El archivo ya no está en el servidor.");
    return;
  }

  const tipo = TIPOS[extname(ruta).toLowerCase()] ?? "application/octet-stream";
  const nombre = basename(ruta);
  // `inline` para que el PDF y las fotos se abran en el navegador en vez de
  // bajarse: el CRM los muestra, no los reparte.
  const disposicion = `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`;

  // Rango parcial: es lo que hace que un video se pueda adelantar sin bajarlo
  // entero, y que un PDF grande empiece a verse antes.
  const rango = req.headers.range;
  if (rango) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rango);
    if (m) {
      const inicio = m[1] ? Number(m[1]) : 0;
      const fin = m[2] ? Number(m[2]) : info.size - 1;
      if (inicio <= fin && fin < info.size) {
        res.writeHead(206, {
          "content-type": tipo,
          "content-disposition": disposicion,
          "content-length": fin - inicio + 1,
          "content-range": `bytes ${inicio}-${fin}/${info.size}`,
          "accept-ranges": "bytes",
          "access-control-allow-origin": ORIGEN,
          "cache-control": "private, max-age=300",
        });
        createReadStream(ruta, { start: inicio, end: fin }).pipe(res);
        servidas++;
        return;
      }
    }
  }

  res.writeHead(200, {
    "content-type": tipo,
    "content-disposition": disposicion,
    "content-length": info.size,
    "accept-ranges": "bytes",
    "access-control-allow-origin": ORIGEN,
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
  });
  createReadStream(ruta).pipe(res);
  servidas++;
  anotar(`OK  ${(info.size / 1024 / 1024).toFixed(1)} MB  ${nombre}`);
});

let servidas = 0;
let rechazadas = 0;
const arranque = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });

servidor.listen(PUERTO, () => {
  console.log("─".repeat(70));
  console.log("  CRM EFAMEINSA · Servidor de archivos de la oficina");
  console.log("─".repeat(70));
  console.log(`  Escuchando en el puerto ${PUERTO}`);
  console.log(`  Carpetas permitidas:`);
  for (const r of RAICES) {
    let ok = "";
    try {
      ok = statSync(r).isDirectory() ? "✓" : "✗ no es carpeta";
    } catch {
      ok = "✗ NO SE VE (¿unidad no mapeada?)";
    }
    console.log(`     ${ok}  ${r}`);
  }
  console.log(`  Origen permitido: ${ORIGEN}`);
  console.log(`  Estado: http://localhost:${PUERTO}/estado`);
  console.log("─".repeat(70));
});
