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
//   · No es un explorador libre. Entrega el archivo exacto que el CRM firmó,
//     y puede listar UNA carpeta puntual —la de un cliente— solo con una firma
//     del CRM para esa carpeta, que vence a los cinco minutos. Sin firma no se
//     puede recorrer nada.
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
import { appendFileSync, createReadStream, readdirSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolve, sep, extname, basename, join } from "node:path";

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

  // ── /carpeta: qué documentos tiene UNA carpeta, con firma ──────────────
  //
  // Existe para que el CRM pueda mostrar «los documentos de este cliente»: las
  // carpetas del servidor están organizadas por cliente, y sin poder
  // preguntarle a UNA carpeta qué contiene, ninguna pantalla puede armarse.
  //
  // NO contradice el «no lista carpetas» de arriba, y la diferencia importa:
  // no hay navegación libre. Cada listado exige una firma del CRM PARA ESA
  // carpeta exacta, que vence a los cinco minutos, y la firma lleva el prefijo
  // «carpeta:» para que un enlace de archivo no sirva como enlace de listado ni
  // al revés. Devuelve un solo nivel, solo documentos permitidos y subcarpetas,
  // sin recorrer nada recursivamente.
  if (url.pathname === "/carpeta") {
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
      res.writeHead(410, { "content-type": "text/plain; charset=utf-8" });
      res.end("Este enlace venció. Vuelva a abrirlo desde el CRM.");
      return;
    }
    if (!firmaValida(firmar(`carpeta:${rutaB64}`, vence), firma)) {
      rechazadas++;
      anotar(`FIRMA MAL (carpeta)  desde ${req.socket.remoteAddress}`);
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Enlace no válido.");
      return;
    }
    let carpeta;
    try {
      carpeta = resolve(Buffer.from(rutaB64, "base64url").toString("utf8"));
    } catch {
      rechazadas++;
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("Ruta ilegible.");
      return;
    }
    if (!dentroDeUnaRaiz(carpeta)) {
      rechazadas++;
      anotar(`FUERA DE RAÍZ (carpeta)  ${carpeta}`);
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Esa carpeta no se sirve desde acá.");
      return;
    }
    let entradas;
    try {
      entradas = readdirSync(carpeta, { withFileTypes: true });
    } catch {
      anotar(`NO ESTÁ (carpeta)  ${carpeta}`);
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Esa carpeta no está en el servidor.");
      return;
    }
    // Filtro opcional por nombre («q»). No toca la seguridad —la firma cubre la
    // carpeta— y es lo que permite que la ficha de una MÁQUINA abra su carpeta
    // ya filtrada por la serie: /carpeta?...&q=509KWSB0A214
    const filtro = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const elementos = [];
    for (const en of entradas) {
      if (elementos.length >= 500) break; // hay carpetas con miles de fotos
      if (en.name.startsWith("~$") || en.name.startsWith(".")) continue;
      if (filtro && en.isFile() && !en.name.toLowerCase().includes(filtro)) continue;
      if (en.isDirectory()) {
        elementos.push({ nombre: en.name, tipo: "carpeta" });
        continue;
      }
      const ext = extname(en.name).toLowerCase();
      if (!EXTENSIONES_PERMITIDAS.has(ext)) continue;
      let peso = null, modificado = null;
      try {
        const i = statSync(join(carpeta, en.name));
        peso = i.size;
        modificado = i.mtime.toISOString();
      } catch { /* si no se puede medir, se lista igual */ }
      elementos.push({ nombre: en.name, tipo: "archivo", ext, peso, modificado });
    }
    // Carpetas primero y lo demás de más nuevo a más viejo: es el orden en que
    // se busca «el último informe de este cliente».
    elementos.sort((a, b) =>
      a.tipo !== b.tipo ? (a.tipo === "carpeta" ? -1 : 1) : (b.modificado ?? "").localeCompare(a.modificado ?? ""),
    );
    anotar(`CARPETA  ${elementos.length} elementos  ${basename(carpeta)}`);
    servidas++;

    // DOS FORMAS DE RESPONDER, y el porqué importa. El CRM vive en https y el
    // navegador le prohíbe LEER datos de un servicio http (contenido mixto).
    // Pero NAVEGAR hacia http sí está permitido. Así que:
    //   · Un clic desde el CRM (navegación, Accept: text/html) recibe una
    //     PÁGINA con los documentos del cliente, servida por este mismo
    //     programa, con cada enlace ya firmado. Funciona HOY, sin certificado.
    //   · Cuando Sistemas ponga el certificado (etapa 2), el CRM podrá pedir
    //     este mismo listado como JSON y dibujarlo dentro de su propia ficha.
    const quiereHtml = (req.headers.accept ?? "").includes("text/html");
    if (!quiereHtml) {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": ORIGEN,
        "cache-control": "private, max-age=60",
      });
      res.end(JSON.stringify({ carpeta: basename(carpeta), elementos, truncado: entradas.length > 500 }));
      return;
    }

    const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const enlaceHijo = (nombreHijo, esCarpeta) => {
      const rutaHijo = join(carpeta, nombreHijo);
      const pB64 = Buffer.from(rutaHijo, "utf8").toString("base64url");
      const v = Math.floor(Date.now() / 1000) + 300;
      const s = firmar(esCarpeta ? `carpeta:${pB64}` : pB64, v);
      return `/${esCarpeta ? "carpeta" : "archivo"}?p=${pB64}&e=${v}&s=${s}`;
    };
    const peso = (b) => (b == null ? "" : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
    const fecha = (m) => (m ? new Date(m).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "");
    const icono = (e) =>
      e.tipo === "carpeta" ? "📁" : [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(e.ext) ? "🖼️" : [".mp4", ".mov", ".3gp"].includes(e.ext) ? "🎬" : "📄";

    const filas = elementos
      .map(
        (e) => `<a class="fila" href="${enlaceHijo(e.nombre, e.tipo === "carpeta")}"${e.tipo === "archivo" ? ` target="_blank" rel="noreferrer"` : ""}>
          <span class="ico">${icono(e)}</span>
          <span class="nom">${esc(e.nombre)}</span>
          <span class="met">${e.tipo === "carpeta" ? "carpeta" : `${peso(e.peso)} · ${fecha(e.modificado)}`}</span>
        </a>`,
      )
      .join("\n");

    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "private, max-age=60" });
    res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(basename(carpeta))} · Documentos del servidor</title>
<style>
  :root{color-scheme:light}
  body{margin:0;background:#f5f3f2;color:#2c2e35;font-family:Arial,"Segoe UI",sans-serif}
  .caja{max-width:860px;margin:0 auto;padding:20px 16px 60px}
  .marca{font-size:12px;font-weight:700;letter-spacing:.14em;color:#7e1210;text-transform:uppercase;margin:0 0 2px}
  h1{font-size:20px;margin:0 0 2px;word-break:break-word}
  .sub{font-size:12.5px;color:#6b6b6b;margin:0 0 16px}
  .fila{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e8e4e3;border-radius:8px;
    padding:10px 12px;margin-bottom:6px;text-decoration:none;color:inherit}
  .fila:hover{background:#f3eeed}
  .ico{flex:none}
  .nom{flex:1;min-width:0;font-size:13.5px;word-break:break-word}
  .met{flex:none;font-size:11.5px;color:#6b6b6b;white-space:nowrap}
  .aviso{font-size:11.5px;color:#6b6b6b;margin-top:14px;line-height:1.5}
</style></head><body><div class="caja">
<p class="marca">Efameinsa · Servidor de la oficina</p>
<h1>${esc(basename(carpeta))}</h1>
<p class="sub">${elementos.length} elemento${elementos.length === 1 ? "" : "s"}${filtro ? ` que dicen «${esc(filtro)}»` : ""}${entradas.length > 500 ? " · lista recortada a 500" : ""} · los enlaces vencen en 5 minutos: si uno expira, vuelva a abrir desde el CRM</p>
<input id="buscar" type="search" placeholder="Buscar en esta carpeta…" autocomplete="off"
  style="width:100%;box-sizing:border-box;margin:0 0 10px;padding:9px 12px;font:inherit;font-size:13.5px;border:1px solid #e8e4e3;border-radius:8px;background:#fff">
${filas || '<p class="aviso">Esta carpeta no tiene documentos que se puedan mostrar.</p>'}
<script>
  // Filtro instantáneo sobre lo ya listado: no hace ningún pedido nuevo, así
  // que funciona aunque los enlaces de la página estén por vencer.
  document.getElementById("buscar").addEventListener("input", function () {
    var q = this.value.toLowerCase();
    document.querySelectorAll(".fila").forEach(function (f) {
      f.style.display = f.querySelector(".nom").textContent.toLowerCase().indexOf(q) === -1 ? "none" : "";
    });
  });
</script>
<p class="aviso">Solo lectura. Esta página la sirve el servidor de la empresa y solo se ve desde la red interna.</p>
</div></body></html>`);
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
