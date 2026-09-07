import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// POR QUÉ ESTA PRUEBA. El 05-09 la migración 0179 agregó
// oportunidades.cotizacion_proyectada → cotizaciones(id). Desde ese momento
// hubo DOS relaciones entre las dos tablas y PostgREST dejó de saber por cuál
// embeber: toda consulta que decía `oportunidades(...)` desde cotizaciones
// devolvió error PGRST201 en vez de datos. Como el código leía solo `data` y
// no `error`, la descarga del PDF contestaba «Cotización no encontrada» —el
// error que reportó Brenda el 07-09— y la bandeja de aprobaciones de gerencia
// se veía vacía. Nada en el compilador ni en los tests lo dijo: el select es
// un string.
//
// La regla, entonces: entre estos dos pares de tablas el embed SIEMPRE se
// nombra por su llave foránea. Si mañana aparece una tercera relación, esta
// prueba ya obliga a escribirla desambiguada desde el primer día.
const PARES_AMBIGUOS: { desde: string; embed: string; usar: string }[] = [
  { desde: "cotizaciones", embed: "oportunidades", usar: "oportunidades!cotizaciones_oportunidad_id_fkey" },
  { desde: "oportunidades", embed: "cotizaciones", usar: "cotizaciones!cotizaciones_oportunidad_id_fkey" },
];

function archivosFuente(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivosFuente(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

test("los embeds entre cotizaciones y oportunidades van nombrados por su llave foránea", () => {
  const raiz = path.resolve(__dirname, "..");
  const fallas: string[] = [];

  for (const archivo of archivosFuente(raiz)) {
    const codigo = fs.readFileSync(archivo, "utf8");
    for (const { desde, embed, usar } of PARES_AMBIGUOS) {
      const marca = `.from("${desde}")`;
      let i = codigo.indexOf(marca);
      while (i !== -1) {
        // El select de esta consulta: desde el .from() hasta el siguiente
        // .from(), que es donde empieza otra.
        const siguiente = codigo.indexOf(".from(", i + marca.length);
        const consulta = codigo.slice(i, siguiente === -1 ? undefined : siguiente);
        if (consulta.includes(`${embed}(`)) {
          const linea = codigo.slice(0, i).split("\n").length;
          fallas.push(`${path.relative(raiz, archivo)}:${linea} — embebe ${embed}( desde ${desde}; usar ${usar}(`);
        }
        i = codigo.indexOf(marca, i + marca.length);
      }
    }
  }

  expect(fallas, `\n${fallas.join("\n")}\n`).toEqual([]);
});
