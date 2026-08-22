// Fusiona el cruce Fase 1 (solo V:\LESLY) con los hallazgos de la Fase 1b
// (barrido de todo V:\) en un solo archivo final. Reglas para no adivinar:
//   - especificación EXACTA (prefijo de archivo == código): se aplica sola.
//   - catálogo con UN solo candidato: se aplica solo.
//   - catálogo con VARIOS candidatos, o especificación "de respaldo" (sin
//     prefijo exacto): NO se elige por mi cuenta — quedan en "revisar", con
//     todos los candidatos, para que Darwin decida mirándolos.
//
// Uso: node scripts/fusionar-cruce-codificacion.mjs [salida.json]

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

function ultimoArchivo(prefijo) {
  return readdirSync("scripts/data")
    .filter((f) => f.startsWith(prefijo) && f.endsWith(".json"))
    .sort()
    .map((f) => `scripts/data/${f}`)
    .pop();
}

const v1 = JSON.parse(readFileSync(ultimoArchivo("cruce-codificacion-equipos-"), "utf-8"));
const v2 = JSON.parse(readFileSync(ultimoArchivo("cruce-v2-hallazgos-"), "utf-8"));
const v2PorCodigo = new Map(v2.resultado.map((r) => [r.codigo, r]));

const SALIDA = process.argv[2] ?? "scripts/data/cruce-final-2026-08-22.json";

let aplicadosSpec = 0, aplicadosCat = 0;

const final = v1.map((p) => {
  const h = v2PorCodigo.get(p.codigo);
  const fila = { ...p, revisar: [] };

  if (h?.especificacionExacta) {
    fila.especificacion = h.especificacionExacta;
    aplicadosSpec++;
  } else if (h?.especificacionRespaldo?.length) {
    fila.revisar.push({ tipo: "especificacion", candidatos: h.especificacionRespaldo });
  }

  if (h?.catalogoCandidatos?.length === 1) {
    fila.catalogos = [...(fila.catalogos ?? []), h.catalogoCandidatos[0]];
    aplicadosCat++;
  } else if (h?.catalogoCandidatos?.length > 1) {
    fila.revisar.push({ tipo: "catalogo", candidatos: h.catalogoCandidatos });
  }

  return fila;
});

writeFileSync(SALIDA, JSON.stringify(final, null, 2));

const tieneSpec = (f) => Boolean(f.especificacion) || Boolean(f.especificacionAprox?.length);
const tieneCat = (f) => Boolean(f.catalogos?.length);
const completos = final.filter((f) => tieneSpec(f) && tieneCat(f)).length;
const conAlgoQueRevisar = final.filter((f) => f.revisar.length > 0).length;
const sinNadaAun = final.filter((f) => !tieneSpec(f) && !tieneCat(f) && f.revisar.length === 0).length;

console.log(`Total códigos: ${final.length}`);
console.log(`Especificaciones exactas aplicadas desde el barrido: ${aplicadosSpec}`);
console.log(`Catálogos (candidato único) aplicados desde el barrido: ${aplicadosCat}`);
console.log(`Completos (spec + catálogo): ${completos}/${final.length}`);
console.log(`Con candidatos para revisar a mano (ambiguos): ${conAlgoQueRevisar}`);
console.log(`Siguen sin nada, ni para revisar: ${sinNadaAun}`);
console.log(`\nEscrito: ${SALIDA}`);
