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
// ACUERDOS DE LA REUNIÓN DEL 31-08 CON GERENCIA Y SISTEMAS, que este archivo
// ya cumple:
//   · «Primero solo lectura, vamos a ver cómo fluye» (gerencia). Se discutió
//     habilitar escritura para que postventa suba informes nuevos y se decidió
//     dejarlo para una segunda etapa. Este programa NO tiene con qué escribir.
//   · El puerto lo elige Sistemas, y NO va a ser uno de los habituales: «el que
//     se usa generalmente es muy usado, se puede cambiar a uno parecido para
//     que no haya rastreos externos». Por eso el puerto es una variable, sin
//     ningún valor quemado en el programa.
//   · Todo es interno. No se abre nada hacia internet.
//
// USO:
//   set ARCHIVOS_SECRETO=<el mismo secreto que el CRM>
//   set ARCHIVOS_PUERTO=<el puerto que elija Sistemas>
//   node servidor-archivos.mjs
//
// Variables:
//   ARCHIVOS_SECRETO  (obligatoria) secreto compartido con el CRM
//   ARCHIVOS_PUERTO   (opcional, 8080 por defecto) el que decida Sistemas
//   ARCHIVOS_RAICES   (opcional) rutas permitidas separadas por «;»
//   ARCHIVOS_ORIGEN   (opcional) de dónde se acepta que venga el pedido
//   ARCHIVOS_REDES    (opcional) redes que pueden pedir, separadas por «;»
//                     Por defecto solo las privadas: nada de internet.
//   ARCHIVOS_REGISTRO (opcional) archivo donde anotar lo que se entrega

import { createServer } from "node:http";
import { appendFileSync, createReadStream, statSync } from "node:fs";
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
  // Los videos cortos que también se quieren ver desde el CRM (Santos, 31-08).
  // Si en el servidor la carpeta se llama distinto, se ajusta en ARCHIVOS_RAICES.
  "\\\\192.168.10.210\\10. VIDEOS",
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

/**
 * SOLO SE ENTREGAN DOCUMENTOS. Aunque alguien tuviera una firma válida, no se
 * sirve nada que no sea un informe, una foto o un video: ni un .exe, ni un
 * .bak, ni un archivo de configuración. Es el mismo criterio que pidió
 * gerencia al hablar de la escritura futura —«solamente para documentos PDF y
 * DOC, Word, imágenes PNG, JPG»—, aplicado desde ya a la lectura.
 */
const EXTENSIONES_PERMITIDAS = new Set(Object.keys(TIPOS));

/**
 * De qué redes se aceptan pedidos. Por defecto, solo las privadas: aunque el
 * puerto quedara expuesto por error, desde internet no se entrega nada. Es una
 * segunda tranca además de la regla del firewall, porque la seguridad no
 * debería depender de que una sola cosa esté bien configurada.
 */
const REDES = (process.env.ARCHIVOS_REDES ?? "192.168.;10.;172.16.;172.17.;172.18.;172.19.;172.2;172.3;127.;::1;::ffff:192.168.;::ffff:10.;::ffff:127.")
  .split(";")
  .map((r) => r.trim())
  .filter(Boolean);

function redPermitida(ip) {
  if (!ip) return false;
  return REDES.some((r) => ip.startsWith(r));
}

/**
 * El registro. Va a la consola y, si se pide, también a un archivo: Sistemas
 * tiene que poder auditar qué se entregó y a quién sin depender de que la
 * ventana siga abierta. Se escribe agregando al final, nunca se reescribe.
 */
const ARCHIVO_REGISTRO = process.env.ARCHIVOS_REGISTRO ?? "";
const registro = [];
const anotar = (linea) => {
  const l = `${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}  ${linea}`;
  registro.push(l);
  if (registro.length > 500) registro.shift();
  console.log(l);
  if (ARCHIVO_REGISTRO) {
    try {
      appendFileSync(ARCHIVO_REGISTRO, l + "\n", "utf8");
    } catch {
      // Si el registro no se puede escribir, el servicio sigue sirviendo: es
      // preferible perder una línea de bitácora que dejar de entregar un
      // informe cuando alguien lo está esperando al teléfono.
    }
  }
};

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  // SOLO SE PUEDE LEER, Y SE DEMUESTRA. El programa no tiene ninguna
  // instrucción para escribir, pero además rechaza de entrada cualquier método
  // que no sea leer. Es para que quien audite no tenga que confiar en mi
  // palabra: un POST, un PUT o un DELETE se van con 405 sin tocar nada.
  if (req.method !== "GET" && req.method !== "HEAD") {
    rechazadas++;
    anotar(`MÉTODO RECHAZADO  ${req.method}  desde ${req.socket.remoteAddress}`);
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
    res.end("Este servicio es de solo lectura: solo acepta GET y HEAD.");
    return;
  }

  // Segunda tranca, antes de mirar nada más: de dónde viene el pedido.
  const ip = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  if (!redPermitida(req.socket.remoteAddress ?? "") && !redPermitida(ip)) {
    rechazadas++;
    anotar(`FUERA DE LA RED  ${ip}`);
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Este servicio solo atiende pedidos de la red interna.");
    return;
  }

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

  // Los archivos temporales que deja Word abierto («~$INFORME…docx») pesan cero
  // y no son el documento: en las carpetas del servidor hay varios, y
  // entregarlos sería darle al usuario un archivo vacío con nombre correcto.
  if (basename(ruta).startsWith("~$")) {
    rechazadas++;
    anotar(`TEMPORAL DE WORD  ${basename(ruta)}`);
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Ese es un archivo temporal de Word, no el documento.");
    return;
  }

  if (!EXTENSIONES_PERMITIDAS.has(extname(ruta).toLowerCase())) {
    rechazadas++;
    anotar(`EXTENSIÓN NO PERMITIDA  ${basename(ruta)}`);
    res.writeHead(415, { "content-type": "text/plain; charset=utf-8" });
    res.end("Este servicio solo entrega informes, fotos y videos.");
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
  console.log(`  Redes que pueden pedir: ${REDES.join(" ")}`);
  console.log(`  Extensiones que se entregan: ${[...EXTENSIONES_PERMITIDAS].join(" ")}`);
  console.log(`  Registro en archivo: ${ARCHIVO_REGISTRO || "(solo consola)"}`);
  console.log("  SOLO LECTURA: este programa no crea, no borra ni modifica ningún archivo.");
  console.log(`  Estado: http://localhost:${PUERTO}/estado`);
  console.log("─".repeat(70));
});
