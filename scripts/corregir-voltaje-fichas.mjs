// ============================================================
// CRM EFAMEINSA · Recuperar el voltaje que el extractor perdió
// ============================================================
// La tabla de especificaciones que ve el cliente tiene una columna "Controles
// Automático" con el voltaje: "220V/60Hz/1Ph". En 27 de los 60 equipos sale en
// blanco, aunque su ficha .docx lo dice con todas las letras.
//
// POR QUÉ. El extractor del 22-08 leía la cabecera con `lineas.slice(0, 12)`.
// Eso alcanza cuando los datos vienen intercalados, pero muchas fichas ponen
// primero los SIETE rótulos y después los SIETE valores:
//
//     [1] Marca            [7]  UNIMAC
//     [2] Modelo           [8]  UT030E
//     [3] Capacidad        [9]  14kg
//     [4] Calentamiento    [10] ELÉCTRICO
//     [5] Panel            [11] DUAL DIGITAL
//     [6] Controles        [12] 220V/60HZ/3PH   ← queda fuera de las 12
//
// El voltaje es siempre el último valor, así que era justo el que se caía. Es
// un fallo del CRM, no de los documentos: el dato estaba ahí desde el principio.
//
// Se descubrió mirando SECU30 el 24-08, a raíz del reporte de que un equipo
// salía con la foto de otro (eso último es un problema distinto: su Word tiene
// un pantallazo en vez de una foto; ver auditar-fichas-productos.mjs).
//
// Uso: node --env-file=.env.local scripts/corregir-voltaje-fichas.mjs [--aplicar]

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");

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

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(`select id, sku, marca, modelo, ficha from productos order by sku nulls last`);

let corregidos = 0;
let sinCambio = 0;

for (const p of rows) {
  const docx = rutaDocx(p.ficha);
  if (!docx || !/\.docx$/i.test(docx) || !existsSync(docx)) continue;

  let lineas;
  try {
    lineas = lineasDe(docx);
  } catch {
    continue;
  }

  // 20 en vez de 12: cubre la plantilla de siete rótulos y siete valores sin
  // meterse en el cuerpo de la ficha, que empieza recién en la línea 14.
  const cabecera = lineas.slice(0, 20).join(" | ");
  const voltaje = cabecera.match(/(\d{3}\s*V?\s*\/\s*\d{2}\s*Hz?\s*\/\s*[\d-]+\s*(?:PH|N|Ph)?)/i)?.[1];
  if (!voltaje) continue;

  const limpio = voltaje.replace(/\s+/g, "");
  if (p.ficha?.controles === limpio) {
    sinCambio++;
    continue;
  }

  console.log(
    `${String(p.sku ?? "(sin SKU)").padEnd(11)} ${p.marca} ${p.modelo}`.padEnd(46) +
      ` ${p.ficha?.controles ?? "(vacío)"} → ${limpio}`,
  );
  corregidos++;

  if (!APLICAR) continue;
  await bd.query(
    `update productos set ficha = jsonb_set(coalesce(ficha, '{}'::jsonb), '{controles}', to_jsonb($2::text)), updated_at = now()
      where id = $1`,
    [p.id, limpio],
  );
}

console.log(`\nequipos con el voltaje ya correcto: ${sinCambio}`);
console.log(
  APLICAR ? `${corregidos} ficha(s) corregida(s).` : `${corregidos} por corregir. (Simulación: correr con --aplicar.)`,
);

await bd.end();
