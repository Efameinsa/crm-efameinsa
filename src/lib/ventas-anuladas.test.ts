import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Que una venta anulada no vuelva a colarse en una cuenta.
 *
 * «Si no lo anulas va a sumar a su record» (Carlos, 28-08). La anulación vive
 * en la migración 0110, pero de nada sirve si mañana alguien agrega una
 * consulta nueva a `ventas` y se olvida del filtro: la venta anulada volvería a
 * contar en esa pantalla y en ninguna otra, que es la peor forma de fallar
 * —dos números distintos para la misma cosa, sin error a la vista—.
 *
 * Así que este test recorre el código y exige que TODA lectura de `ventas`
 * declare qué hace con las anuladas: o las filtra con `.is("anulada_at", null)`,
 * o dice por escrito que las incluye a propósito.
 *
 * ESTE TEST ES SOLO LA MITAD, y conviene saberlo. Lee TypeScript, y las
 * métricas no se calculan en TypeScript: se calculan en funciones y en una
 * vista de PostgreSQL, donde esto no llega. El 05-09 eso dejó pasar un cierre
 * anulado de Katerine que siguió sumando en su semana, en el tablero de
 * gerencia y en la supervisión diaria (migración 0174).
 *
 * La otra mitad es `npm run db:auditar-anuladas`, que hace exactamente lo
 * mismo sobre el catálogo VIVO de la base. No corre acá porque necesita
 * conexión; hay que correrla a mano al tocar funciones de métricas.
 */

const EXCEPCIONES = new Map([
  // El historial de la cuenta es el registro: la venta anulada se queda ahí
  // porque pasó, y se pinta tachada («Venta anulada»).
  ["src/lib/historial-cuenta.ts", "es el registro, se muestra marcada"],
  // Busca UNA venta por su id para armar el compendio del cierre; si ese cierre
  // está anulado, el compendio tiene que poder contarlo igual.
  ["src/lib/compendio-cierre.ts", "busca por id, no cuenta"],
  // Al registrar la venta desde el informe (0148) lee la nota de UNA venta
  // por su id para mostrar el aviso; no cuenta ni suma.
  ["src/lib/acciones/cotizaciones.ts", "busca por id, no cuenta"],
]);

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    if (p.includes(".test.")) return []; // este test se encontraría a sí mismo
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

describe("las ventas anuladas no cuentan", () => {
  it("toda consulta a «ventas» filtra las anuladas o dice por qué no", () => {
    const sinFiltro: string[] = [];

    for (const ruta of archivos("src")) {
      const codigo = readFileSync(ruta, "utf8");
      let desde = codigo.indexOf('from("ventas")');
      while (desde !== -1) {
        // La consulta llega hasta donde termina la sentencia.
        const fin = codigo.indexOf(";", desde);
        const consulta = codigo.slice(desde, fin === -1 ? desde + 400 : fin);
        const relativa = ruta.replace(/\\/g, "/");
        if (!consulta.includes('anulada_at') && !EXCEPCIONES.has(relativa)) {
          sinFiltro.push(`${relativa} (posición ${desde})`);
        }
        desde = codigo.indexOf('from("ventas")', desde + 1);
      }
    }

    expect(sinFiltro, `Estas consultas contarían ventas anuladas. Agregue .is("anulada_at", null) o, si de verdad tienen que incluirlas, anótelo en EXCEPCIONES de este test:\n${sinFiltro.join("\n")}`).toEqual([]);
  });
});
