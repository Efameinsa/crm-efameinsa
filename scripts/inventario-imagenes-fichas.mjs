// Inventario de las imágenes que hay dentro de cada ficha técnica .docx.
//
// Un .docx es un zip: las imágenes viven en word/media/. Pero no todas son
// la foto del equipo — hay membretes de la papelería de Efameinsa, logos de
// marca y hasta capturas de pantalla completas (con navegador y barra de
// tareas incluidos). Este script las lista y las agrupa por huella para
// poder distinguir cuál es cuál antes de recortar nada.
//
// La señal más útil: una imagen que aparece en MUCHAS fichas distintas es
// papelería o logo; la que aparece en una sola es candidata a foto del
// equipo.
//
// Uso: node scripts/inventario-imagenes-fichas.mjs [salida.json]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SALIDA = process.argv[2] ?? "scripts/data/inventario-imagenes-2026-08-22.json";
const CRUCE = "scripts/data/cruce-definitivo-2026-08-22.json";

const productos = JSON.parse(readFileSync(CRUCE, "utf-8")).productos;

/** Nombres de las imágenes dentro del .docx, en el orden en que están. */
function listarMedia(docx) {
  try {
    const salida = execFileSync("unzip", ["-l", docx], { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
    return salida
      .split("\n")
      .map((l) => l.match(/(word\/media\/\S+)/)?.[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function leerImagen(docx, interno) {
  try {
    return execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const registros = [];
const porHuella = new Map();

for (const p of productos) {
  if (!p.especificacion || !/\.docx$/i.test(p.especificacion)) continue;
  for (const interno of listarMedia(p.especificacion)) {
    const datos = leerImagen(p.especificacion, interno);
    if (!datos) continue;
    const huella = createHash("sha1").update(datos).digest("hex").slice(0, 16);
    registros.push({
      codigo: p.codigo,
      confianza: p.especificacionConfianza,
      ficha: p.especificacion,
      interno,
      huella,
      bytes: datos.length,
    });
    porHuella.set(huella, [...(porHuella.get(huella) ?? []), p.codigo]);
  }
}

const repetidas = [...porHuella.entries()]
  .map(([huella, codigos]) => ({ huella, veces: codigos.length, codigos }))
  .sort((a, b) => b.veces - a.veces);

console.log(`Fichas .docx revisadas: ${new Set(registros.map((r) => r.ficha)).size}`);
console.log(`Imágenes encontradas: ${registros.length} (${porHuella.size} distintas)`);
console.log(`\nImágenes que se repiten en varias fichas (probable papelería o logo):`);
for (const r of repetidas.filter((x) => x.veces > 1).slice(0, 12)) {
  console.log(`  ${r.huella}  en ${r.veces} fichas`);
}
const unicas = repetidas.filter((x) => x.veces === 1).length;
console.log(`\nImágenes que aparecen en una sola ficha (candidatas a foto del equipo): ${unicas}`);

const sinImagenes = productos.filter(
  (p) => p.especificacion && /\.docx$/i.test(p.especificacion) && !registros.some((r) => r.ficha === p.especificacion),
);
console.log(`Fichas .docx sin ninguna imagen: ${sinImagenes.length}`);

writeFileSync(SALIDA, JSON.stringify({ registros, repetidas }, null, 1));
console.log(`\nEscrito: ${SALIDA}`);
