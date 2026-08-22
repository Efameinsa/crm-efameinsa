// Une los dos cruces en el archivo definitivo que consumen el reporte para
// Lesly y la carpeta V:\SANTOS.
//
//   especificación técnica → manda el cruce por CONTENIDO (cruzar-por-
//     contenido.mjs): leyó dentro de cada ficha y verificó modelo, control,
//     calentamiento, fuerza G, etc. Es el único que detecta archivos mal
//     nombrados.
//   catálogo comercial → se mantiene el cruce por rangos de nombre
//     (cruzar-codificacion-equipos*.mjs) y se le suma lo que el contenido
//     haya encontrado: un catálogo agrupa varios modelos en un PDF, así que
//     el nombre del archivo ("RX80-RX105-RX135") sigue siendo la mejor pista.
//
// Uso: node scripts/fusionar-cruce-final.mjs [salida.json]

import { readFileSync, writeFileSync } from "node:fs";

const SALIDA = process.argv[2] ?? "scripts/data/cruce-definitivo-2026-08-22.json";

const porNombre = JSON.parse(readFileSync("scripts/data/cruce-final-2026-08-22.json", "utf-8"));
const { resultado: porContenido, malNombrados, intercambios, discrepanciasDeModelo } = JSON.parse(
  readFileSync("scripts/data/cruce-contenido-2026-08-22.json", "utf-8"),
);

// Un código puede repetirse en el maestro (LAV180 = RX180 rígida Y FX180
// flotante), así que se aparea por posición dentro del mismo código.
const pendientesPorCodigo = new Map();
for (const [i, c] of porContenido.entries()) {
  pendientesPorCodigo.set(c.codigo, [...(pendientesPorCodigo.get(c.codigo) ?? []), i]);
}
const usados = new Map();

const definitivo = porNombre.map((p) => {
  const indices = pendientesPorCodigo.get(p.codigo) ?? [];
  const n = usados.get(p.codigo) ?? 0;
  usados.set(p.codigo, n + 1);
  const c = porContenido[indices[Math.min(n, indices.length - 1)]];

  const fila = { ...p, revisar: [...(p.revisar ?? [])] };

  if (c?.especificacion?.elegido) {
    fila.especificacion = c.especificacion.elegido.ruta;
    fila.especificacionConfianza = c.especificacion.confianza;
    fila.especificacionEvidencia = c.especificacion.elegido.evidencia;
    fila.especificacionAviso = c.especificacion.elegido.conflictos;
    // El cruce por contenido ya decidió: se limpia el "revisar" que había
    // dejado el cruce por nombre para no pedir dos veces lo mismo.
    fila.revisar = fila.revisar.filter((r) => r.tipo !== "especificacion");
    fila.especificacionAprox = [];
  } else if (c?.especificacion?.alternativas?.length) {
    fila.especificacionConfianza = c.especificacion.confianza;
    if (!fila.revisar.some((r) => r.tipo === "especificacion")) {
      fila.revisar.push({ tipo: "especificacion", candidatos: c.especificacion.alternativas.map((a) => a.ruta) });
    }
  } else {
    fila.especificacionConfianza = c?.especificacion?.confianza ?? "sin_candidatos";
  }

  // Catálogo: se suma lo que el contenido haya encontrado a lo que ya tenía.
  if (c?.catalogo?.elegido) {
    const yaEsta = (fila.catalogos ?? []).includes(c.catalogo.elegido.ruta);
    if (!yaEsta) fila.catalogos = [...(fila.catalogos ?? []), c.catalogo.elegido.ruta];
  }

  return fila;
});

writeFileSync(SALIDA, JSON.stringify({ productos: definitivo, malNombrados, intercambios, discrepanciasDeModelo }, null, 1));

const tieneSpec = (f) => Boolean(f.especificacion);
const tieneCat = (f) => Boolean(f.catalogos?.length);
console.log(`Códigos: ${definitivo.length}`);
console.log(`  con especificación : ${definitivo.filter(tieneSpec).length}`);
console.log(`  con catálogo       : ${definitivo.filter(tieneCat).length}`);
console.log(`  completos          : ${definitivo.filter((f) => tieneSpec(f) && tieneCat(f)).length}`);
console.log(`  con algo a revisar : ${definitivo.filter((f) => f.revisar.length).length}`);
console.log(`\nFichas mal nombradas: ${malNombrados.length} · intercambios: ${intercambios.length} · discrepancias maestro↔ficha: ${discrepanciasDeModelo.length}`);
console.log(`\nEscrito: ${SALIDA}`);
