import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * UN ARCHIVO «use server» SOLO PUEDE EXPORTAR FUNCIONES ASÍNCRONAS.
 *
 * El 08-09 se exportó un arreglo desde `acciones/oportunidades.ts` —una lista
 * de etapas, para poder probarla— y eso rompió el módulo ENTERO al cargarlo:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * Con el módulo roto, TODA acción de servidor que lo arrastre devuelve 500. Se
 * notó al cerrar sesión («This page couldn't load — A server error occurred»)
 * cuarenta minutos después de desplegarlo, con la gente trabajando.
 *
 * LO QUE HACE ESTO ESPECIALMENTE TRAICIONERO: no lo ve nadie.
 *   · `tsc` no se queja: es una regla de Next, no de TypeScript.
 *   · `next build` tampoco: el archivo compila.
 *   · Y las pruebas unitarias menos, porque importan el módulo directamente,
 *     sin la regla. La prueba de la lista pasaba en verde con producción rota.
 *
 * Por eso el guardián mira el TEXTO de los archivos. Los `type` y `interface`
 * no cuentan: desaparecen al compilar y no llegan a ser un valor.
 */

const PROHIBIDO = /^export\s+(const|let|var|class|enum|function\s+(?!.*\basync\b))/;

function archivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

test("los archivos «use server» solo exportan funciones asíncronas", () => {
  const raiz = path.resolve(__dirname, "..");
  const fallas: string[] = [];

  for (const archivo of archivos(raiz)) {
    const codigo = fs.readFileSync(archivo, "utf8");
    if (!/^["']use server["'];?\s*$/m.test(codigo.split("\n")[0] ?? "")) continue;
    codigo.split("\n").forEach((linea, i) => {
      if (PROHIBIDO.test(linea)) {
        const relativo = path.relative(path.resolve(raiz, ".."), archivo).split(path.sep).join("/");
        fallas.push(
          `${relativo}:${i + 1} — «${linea.trim().slice(0, 60)}»: un archivo "use server" solo exporta funciones async. Mueva esto a un módulo aparte.`,
        );
      }
    });
  }

  expect(fallas, `\n${fallas.join("\n")}\n`).toEqual([]);
});

test("el guardián reconoce lo que tiene que reconocer", () => {
  // Si el patrón dejara de encontrar nada pasaría en verde con el error suelto
  // en producción, que es exactamente lo que hoy pasó con las otras pruebas.
  expect(PROHIBIDO.test("export const ETAPAS_MANUALES = [];")).toBe(true);
  expect(PROHIBIDO.test("export class Cosa {}")).toBe(true);
  expect(PROHIBIDO.test("export function haceAlgo() {}")).toBe(true);
  // Y no molesta con lo que sí está permitido.
  expect(PROHIBIDO.test("export async function registrarActividad(datos) {}")).toBe(false);
  expect(PROHIBIDO.test("export interface DatosInforme {")).toBe(false);
  expect(PROHIBIDO.test('export type Desenlace = "a" | "b";')).toBe(false);
});
