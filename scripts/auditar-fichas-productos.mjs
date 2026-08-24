// ============================================================
// CRM EFAMEINSA · Auditar cada equipo contra su propia ficha .docx
// ============================================================
// Reportado el 24-08: se cotizó SECU30 y en el PDF salió la foto de otro
// equipo. Este script revisa LOS 67 equipos contra el Word del que dicen venir,
// para saber cuántos más están mal antes de que lo descubra un cliente.
//
// QUÉ SE ENCONTRÓ EN EL CASO SECU30, que es lo que orienta toda la revisión:
// el CRM no puso una foto al azar. El .docx de SECU30 no tiene una foto de
// producto: tiene un PANTALLAZO DE PANTALLA COMPLETA de 1440×900 —se ve el
// navegador Edge con sus pestañas, la barra de direcciones y el reloj de
// Windows— y la pestaña abierta dice UT075, que es otra máquina. Al no haber
// imagen usable, el cargador tomó prestada la de un equipo hermano (SECU302,
// del mismo UT030). Las características y medidas de SECU30 SÍ son las suyas:
// se verificaron una por una contra su Word.
//
// O sea que el problema de fondo está en los documentos de origen, no en el
// CRM. Por eso esta auditoría mira cuatro cosas:
//
//   1. FOTO PRESTADA. El equipo muestra la foto de otro. Se lee de la propia
//      metadata que dejó el cargador (`foto_prestada_de`), no se adivina.
//   2. FICHA CON PANTALLAZO. El .docx trae una captura de pantalla en vez de
//      una foto de producto: se detecta por medidas típicas de monitor.
//      Mientras eso no se corrija en el Word, el equipo no puede tener foto
//      propia.
//   3. VOLTAJE PERDIDO. El extractor leía solo las 12 primeras líneas de la
//      cabecera. En las fichas donde los rótulos y los valores van en párrafos
//      separados (7 y 7), el voltaje cae en la línea 13 y quedó vacío: sale en
//      blanco en la tabla que ve el cliente.
//   4. CAPACIDAD. La del CRM contra la que dice el Word.
//
// ⚠️ NO se comparan las fotos por hash de bytes. Se intentó y daba 58 de 60
// "mal": el cargador recomprime las imágenes, así que los bytes nunca
// coinciden aunque la foto sea la correcta. Un método que reprueba a casi
// todos no está midiendo lo que dice medir.
//
// No escribe nada. Uso:
//   node --env-file=.env.local scripts/auditar-fichas-productos.mjs

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/** Medidas de monitor: si la imagen mide así, es un pantallazo, no un equipo. */
const PANTALLAS = new Set([
  "1440x900", "1920x1080", "1366x768", "1536x864", "1600x900",
  "2560x1440", "1280x720", "1280x800", "1680x1050", "3840x2160",
]);

function rutaDocx(ficha) {
  const o = ficha?.origen;
  if (typeof o === "string") return o;
  return o?.ficha_tecnica ?? o?.ficha ?? null;
}

function lineasDe(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "latin1",
  });
  return Buffer.from(xml, "latin1")
    .toString("utf-8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
}

/** Medidas de cada imagen del .docx, leyendo la cabecera del PNG/JPEG. */
function medidasDeImagenes(docx) {
  const internos = execFileSync("unzip", ["-l", docx], { encoding: "utf-8", maxBuffer: 64e6 })
    .split("\n")
    .map((l) => l.match(/(word\/media\/\S+)$/)?.[1])
    .filter(Boolean);
  const out = [];
  for (const interno of internos) {
    try {
      const buf = execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64e6, encoding: "buffer" });
      let w = 0, h = 0;
      if (buf.slice(1, 4).toString() === "PNG") {
        w = buf.readUInt32BE(16);
        h = buf.readUInt32BE(20);
      } else if (buf[0] === 0xff && buf[1] === 0xd8) {
        // JPEG: se recorre hasta el marcador SOF, que trae alto y ancho.
        let i = 2;
        while (i < buf.length - 9) {
          if (buf[i] !== 0xff) { i++; continue; }
          const m = buf[i + 1];
          if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
            h = buf.readUInt16BE(i + 5);
            w = buf.readUInt16BE(i + 7);
            break;
          }
          i += 2 + buf.readUInt16BE(i + 2);
        }
      }
      if (w && h) out.push({ interno, px: `${w}x${h}` });
    } catch {
      /* imagen ilegible */
    }
  }
  return out;
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: productos } = await bd.query(
  `select id, sku, marca, modelo, nombre, capacidad, segmento, activo, foto_path, ficha
     from productos order by sku nulls last`,
);

const p = { fotoPrestada: [], pantallazo: [], voltaje: [], capacidad: [], ajenas: [], sinDocx: [] };
let revisados = 0;

for (const prod of productos) {
  const etiqueta = `${prod.sku ?? "(sin SKU)"} · ${prod.marca} ${prod.modelo}${prod.activo ? "" : " [inactivo]"}`;
  const docx = rutaDocx(prod.ficha);
  if (!docx || !/\.docx$/i.test(docx) || !existsSync(docx)) {
    p.sinDocx.push({ etiqueta, detalle: docx ? `${docx} — no se encuentra` : "sin ficha declarada" });
    continue;
  }
  revisados++;

  let lineas;
  try {
    lineas = lineasDe(docx);
  } catch {
    p.sinDocx.push({ etiqueta, detalle: `${docx} — ilegible` });
    continue;
  }

  // 1. Foto prestada de otro equipo.
  const prestada = prod.ficha?.origen?.foto_prestada_de;
  if (prestada) p.fotoPrestada.push({ etiqueta, detalle: `muestra la foto de ${prestada}` });

  // 2. La ficha trae un pantallazo en vez de una foto de producto.
  const capturas = medidasDeImagenes(docx).filter((i) => PANTALLAS.has(i.px));
  if (capturas.length > 0) {
    p.pantallazo.push({ etiqueta, detalle: `su Word tiene una captura de pantalla (${capturas[0].px}) en vez de la foto` });
  }

  // 3. Voltaje que el Word declara y el CRM no tiene.
  const cabecera = lineas.slice(0, 20).join(" | ");
  const voltaje = cabecera.match(/(\d{3}\s*V?\s*\/\s*\d{2}\s*Hz?\s*\/\s*[\d-]+\s*(?:PH|N|Ph)?)/i)?.[1];
  if (voltaje && !prod.ficha?.controles) {
    p.voltaje.push({ etiqueta, detalle: `el Word dice ${voltaje.replace(/\s+/g, "")} y el CRM lo tiene vacío` });
  }

  // 4. Capacidad que no coincide.
  const capDocx = cabecera.match(/(\d+(?:[.,]\d+)?)\s*(kg|lb)\b/i)?.[1];
  const capCrm = String(prod.capacidad ?? "").match(/(\d+(?:[.,]\d+)?)/)?.[1];
  if (capDocx && capCrm && capDocx !== capCrm) {
    p.capacidad.push({ etiqueta, detalle: `Word ${capDocx} kg · CRM ${capCrm} kg` });
  }

  // 5. Texto que no está en su propio Word.
  const enDocx = new Set(lineas.map((l) => l.trim()));
  const guardadas = Array.isArray(prod.ficha?.caracteristicas) ? prod.ficha.caracteristicas : [];
  const ajenas = guardadas.filter((c) => !enDocx.has(String(c).trim()));
  if (ajenas.length > 0) {
    p.ajenas.push({
      etiqueta,
      detalle: `${ajenas.length}/${guardadas.length} viñetas no están en su Word · ej: ${String(ajenas[0]).slice(0, 55)}`,
    });
  }
}

const bloque = (titulo, xs, explica, quien) => {
  console.log(`\n${"─".repeat(78)}\n${titulo}: ${xs.length}`);
  if (explica) console.log(`  ${explica}`);
  if (quien) console.log(`  Lo corrige: ${quien}`);
  for (const x of xs) console.log(`   · ${x.etiqueta.padEnd(36)} ${x.detalle}`);
};

console.log(`Equipos en el catálogo: ${productos.length} · con ficha .docx localizable: ${revisados}`);

bloque(
  "FOTO DE OTRO EQUIPO",
  p.fotoPrestada,
  "El cliente ve una máquina que no es exactamente la que está cotizando.",
  "logística, poniendo una foto limpia en el Word de cada uno",
);
bloque(
  "EL WORD TRAE UN PANTALLAZO EN VEZ DE FOTO",
  p.pantallazo,
  "Es la causa de fondo: sin foto usable, el cargador tuvo que prestar la de un hermano.",
  "quien arma las fichas — hay que pegar la foto recortada, no una captura de pantalla",
);
bloque(
  "VOLTAJE PERDIDO",
  p.voltaje,
  "Sale en blanco en la tabla de especificaciones que ve el cliente.",
  "el CRM: es un fallo del extractor, no del documento",
);
bloque("CAPACIDAD QUE NO COINCIDE", p.capacidad, "El CRM y la ficha dicen cosas distintas.", "hay que decidir cuál manda");
bloque("TEXTO QUE NO ESTÁ EN SU WORD", p.ajenas, "Características que vienen de otro documento.", "el CRM");
bloque("SIN FICHA LOCALIZABLE", p.sinDocx, "No se pudo verificar nada: revisar a mano.", "");

console.log(`\n${"─".repeat(78)}\nNada de esto se escribió en la base. Es solo el diagnóstico.`);

await bd.end();
