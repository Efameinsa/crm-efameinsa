import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { anioLima, hoyLima } from "@/lib/periodo";

// POR QUÉ ESTA PRUEBA. El CRM se usa en Lima y corre en servidores que están
// en UTC. Son cinco horas de diferencia, así que desde las 19:00 de Lima
// —hora de trabajo real, los lunes se sale 19:00— cualquier fecha calculada
// en UTC ya es la del día siguiente.
//
// El 07-09-2026 eso resultó estar en dos capas a la vez:
//
//   · En la base: siete funciones usaban `current_date`, entre ellas
//     `registrar_venta`. Una venta cerrada a las ocho de la noche buscaba su
//     informe con la fecha de MAÑANA y en el reporte caía en la semana que no
//     era. Corregido por la migración 0186 con `hoy_lima()`.
//
//   · En el código: `new Date().getFullYear()` alimentaba el correlativo del
//     informe de servicio. Un informe emitido la noche del 31 de diciembre
//     habría tomado número de la serie del año siguiente, dejando un hueco en
//     la de este. En este proyecto los huecos de correlativos ya costaron
//     días de desenredo.
//
// La regla: la fecha de hoy y el año se piden a los ayudantes que respetan
// Lima. Esta prueba impide que vuelva a colarse un cálculo en UTC, que es un
// error invisible: funciona todo el día y se equivoca de noche.

const PROHIBIDO: { patron: RegExp; porque: string }[] = [
  { patron: /new Date\(\)\.getFullYear\(\)/, porque: "usar anioLima()" },
  { patron: /new Date\(\)\.getMonth\(\)/, porque: "usar hoyLima() y partir la cadena" },
  { patron: /new Date\(\)\.getDate\(\)/, porque: "usar hoyLima() y partir la cadena" },
  { patron: /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/, porque: "usar hoyLima()" },
];

// Los ayudantes tienen que poder usar Date: son ellos los que traducen a Lima.
const PERMITIDOS = new Set(["src/lib/periodo.ts", "src/lib/fechas.ts", "src/lib/calendario.ts"]);

function fuentes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return fuentes(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

test("la fecha de hoy se calcula en Lima, nunca en UTC", () => {
  const raiz = path.resolve(__dirname, "..");
  const fallas: string[] = [];

  for (const archivo of fuentes(raiz)) {
    const relativo = path.relative(path.resolve(raiz, ".."), archivo).replace(/\\/g, "/");
    if (PERMITIDOS.has(relativo)) continue;
    const codigo = fs.readFileSync(archivo, "utf8");
    for (const { patron, porque } of PROHIBIDO) {
      if (patron.test(codigo)) {
        const linea = codigo.slice(0, codigo.search(patron)).split("\n").length;
        fallas.push(`${relativo}:${linea} — ${patron.source} calcula en UTC; ${porque}`);
      }
    }
  }

  expect(fallas, `\n${fallas.join("\n")}\n`).toEqual([]);
});

// Que la prueba de arriba SIRVA: si el patrón dejara de encontrar nada, pasaría
// en verde con el error suelto en producción. Es exactamente lo que pasó hoy
// con el guard de los embeds, que buscaba un texto que no cubría todos los
// casos.
test("los patrones reconocen las formas prohibidas", () => {
  const roto = 'const anio = new Date().getFullYear();';
  expect(PROHIBIDO.some((p) => p.patron.test(roto))).toBe(true);
  expect(PROHIBIDO.some((p) => p.patron.test("const anio = anioLima();"))).toBe(false);
});

test("hoyLima y anioLima concuerdan entre sí", () => {
  expect(hoyLima()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(anioLima()).toBe(Number(hoyLima().slice(0, 4)));
});
