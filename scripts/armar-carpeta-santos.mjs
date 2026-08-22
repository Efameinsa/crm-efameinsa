// Arma V:\SANTOS\<MARCA>\<CODIGO>\ con copias del catálogo y la
// especificación técnica de cada código (lee el cruce ya hecho por
// cruzar-codificacion-equipos.mjs) — para que Darwin/Santos pueda navegar
// visualmente qué tiene cada producto, sin depender de la organización de
// V:\LESLY. Es una copia, no toca ni mueve nada del original.
//
// Si a un código le falta catálogo y/o especificación, igual se crea la
// carpeta con lo que sí hay, más un FALTA.txt corto explicando qué falta
// (mismo dato que el Excel para Lesly, pero visible al navegar la carpeta).
//
// Uso: node scripts/armar-carpeta-santos.mjs [ruta-al-cruce.json] [raiz-salida]

import { readFileSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ENTRADA = process.argv[2] ?? "scripts/data/cruce-codificacion-equipos-2026-08-22.json";
const RAIZ = process.argv[3] ?? "V:/SANTOS";

const datos = JSON.parse(readFileSync(ENTRADA, "utf-8"));

function nombreSeguro(s) {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim();
}

const carpetasVistas = new Set();
let archivos = 0;
for (const d of datos) {
  const marca = nombreSeguro(d.marca || "SIN MARCA");
  const carpetaCodigo = join(RAIZ, marca, nombreSeguro(d.codigo));
  mkdirSync(carpetaCodigo, { recursive: true });
  carpetasVistas.add(carpetaCodigo);

  const tieneSpec = Boolean(d.especificacion) || Boolean(d.especificacionAprox?.length);
  const tieneCat = Boolean(d.catalogos?.length);

  if (d.especificacion) {
    copyFileSync(d.especificacion, join(carpetaCodigo, "ESPECIFICACION - " + basename(d.especificacion)));
    archivos++;
  }
  // Aproximada: se copia igual, pero con el nombre marcado para que Darwin
  // sepa que el match no fue exacto y conviene confirmarlo.
  for (const aprox of d.especificacionAprox ?? []) {
    copyFileSync(aprox, join(carpetaCodigo, "ESPECIFICACION (revisar match) - " + basename(aprox)));
    archivos++;
  }
  for (const cat of d.catalogos ?? []) {
    const destino = join(carpetaCodigo, "CATALOGO - " + basename(cat));
    if (!existsSync(destino)) {
      copyFileSync(cat, destino);
      archivos++;
    }
  }

  if (!tieneSpec || !tieneCat) {
    const falta = !tieneSpec && !tieneCat ? "catálogo Y especificación técnica" : !tieneSpec ? "especificación técnica" : "catálogo";
    writeFileSync(
      join(carpetaCodigo, "FALTA.txt"),
      `Código: ${d.codigo}\nMarca: ${d.marca}\nEquipo: ${d.equipo}\n\nFalta: ${falta}\n`,
      "utf-8",
    );
  }
}

// Resumen por marca, para no tener que abrir cada carpeta.
const resumen = {};
for (const d of datos) {
  const m = d.marca;
  resumen[m] ??= { total: 0, completos: 0 };
  resumen[m].total++;
  const ok = (d.especificacion || d.especificacionAprox?.length) && d.catalogos?.length;
  if (ok) resumen[m].completos++;
}
writeFileSync(
  join(RAIZ, "LEEME.txt"),
  [
    "Carpeta armada automáticamente desde V:\\LESLY (cruce del " + new Date().toISOString().slice(0, 10) + ").",
    "Una subcarpeta por marca > código, con su catálogo (foto/ficha comercial) y su especificación técnica.",
    "Si falta algo, la carpeta del código tiene un FALTA.txt explicando qué.",
    "El detalle completo de lo que falta está en 'Pendientes catalogo y especificaciones - para Lesly.xlsx', en esta misma carpeta.",
    "",
    "Resumen por marca (completos = con catálogo Y especificación):",
    ...Object.entries(resumen).map(([m, r]) => `  ${m}: ${r.completos}/${r.total} completos`),
  ].join("\n"),
  "utf-8",
);

console.log(`Carpetas de código: ${carpetasVistas.size} (3 códigos duplicados en el Excel comparten carpeta — ver reporte-pendientes-lesly.mjs)`);
console.log(`Archivos copiados: ${archivos}`);
console.log("Resumen por marca:", resumen);
