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
// EL AGUJERO QUE TENÍA ESTA MISMA PRUEBA (07-09, tarde). Buscaba el texto
// literal `oportunidades(` y por eso dejó pasar OCHO consultas que escribían
// `oportunidades!inner(` — el `!inner` en medio hace que ese texto no aparezca.
// Estuvieron rotas en producción con los 364 tests en verde: la lista de
// Presupuestos que abrió el ing. Carlos salía vacía (123 documentos
// invisibles), y el cierre semanal contaba CERO cotizaciones cuando Katerine
// tenía 33 esa semana. Una red con el agujero del tamaño exacto del problema
// es peor que no tener red, porque da confianza.
//
// Ahora se busca por expresión regular: cualquier forma de embeber la tabla
// —con `!inner`, con `!left` o pelada— que no venga desambiguada por su llave
// foránea. La regla es simple: entre estos dos pares el embed SIEMPRE se
// nombra. Si mañana aparece una tercera relación, esto ya obliga a escribirla
// desambiguada desde el primer día.
const PARES_AMBIGUOS = [
  { desde: "cotizaciones", embed: "oportunidades", llave: "cotizaciones_oportunidad_id_fkey" },
  { desde: "oportunidades", embed: "cotizaciones", llave: "cotizaciones_oportunidad_id_fkey" },
];

/**
 * Caza `tabla(`, `tabla!inner(`, `tabla!left(` … y perdona únicamente
 * `tabla!<llave>` , que es la forma correcta.
 */
function patronSinDesambiguar(embed: string, llave: string): RegExp {
  return new RegExp(`\\b${embed}(?!!${llave})(?:![A-Za-z_]+)?\\(`);
}

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
    for (const { desde, embed, llave } of PARES_AMBIGUOS) {
      const marca = `.from("${desde}")`;
      const patron = patronSinDesambiguar(embed, llave);
      let i = codigo.indexOf(marca);
      while (i !== -1) {
        // El select de esta consulta: desde el .from() hasta el siguiente
        // .from(), que es donde empieza otra.
        const siguiente = codigo.indexOf(".from(", i + marca.length);
        const consulta = codigo.slice(i, siguiente === -1 ? undefined : siguiente);
        if (patron.test(consulta)) {
          const linea = codigo.slice(0, i).split("\n").length;
          fallas.push(
            `${path.relative(raiz, archivo)}:${linea} — embebe ${embed} desde ${desde} sin nombrar la llave; usar ${embed}!${llave}(`,
          );
        }
        i = codigo.indexOf(marca, i + marca.length);
      }
    }
  }

  expect(fallas, `\n${fallas.join("\n")}\n`).toEqual([]);
});

// Que la prueba de arriba SIRVA. Sin esto no hay forma de saber si pasa porque
// el código está bien o porque el patrón dejó de encontrar nada — que es
// exactamente lo que ocurrió con `!inner`.
test("el patrón reconoce las formas rotas y perdona la correcta", () => {
  const patron = patronSinDesambiguar("oportunidades", "cotizaciones_oportunidad_id_fkey");

  for (const roto of [
    '.select("id, oportunidades(comercial_id)")',
    '.select("id, oportunidades!inner(comercial_id)")',
    '.select("id, oportunidades!left(comercial_id)")',
  ]) {
    expect(patron.test(roto), `debería marcar: ${roto}`).toBe(true);
  }

  for (const bueno of [
    '.select("id, oportunidades!cotizaciones_oportunidad_id_fkey(comercial_id)")',
    '.select("id, oportunidades!cotizaciones_oportunidad_id_fkey!inner(comercial_id)")',
  ]) {
    expect(patron.test(bueno), `no debería marcar: ${bueno}`).toBe(false);
  }
});
