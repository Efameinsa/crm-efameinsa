// Cómo queda la fila de especificaciones de una ficha, sin generar el PDF.
// Uso: npx tsx scripts/_ver-especificaciones.ts [CODIGO...]
import { readFileSync } from "node:fs";
import { ajustarEspecificaciones } from "../src/lib/pdf/ajustar-especificaciones";

const { fichas } = JSON.parse(readFileSync("scripts/data/fichas-v/fichas.json", "utf-8"));
const pedidos = process.argv.slice(2).map((c) => c.toUpperCase());
const elegidas = pedidos.length ? fichas.filter((f: { codigo: string }) => pedidos.includes(f.codigo)) : fichas;

const COLUMNAS_EQUIPO_6 = [18, 22, 27, 32, 33, 38];
let peor = 0;
for (const f of elegidas) {
  const c = f.cabecera;
  const casillas = [
    { titulo: "Marca", valor: c.marca ?? "" },
    { titulo: "Modelo", valor: c.modelo ?? "" },
    ...(c.capacidad ? [{ titulo: "Capacidad", valor: c.capacidad }] : []),
    ...(c.calentamiento ? [{ titulo: "Calentamiento", valor: c.calentamiento }] : []),
    ...(c.panel ? [{ titulo: "Panel computarizado", valor: c.panel }] : []),
    ...(c.controles ? [{ titulo: "Controles Automático", valor: c.controles }] : []),
  ];
  if (casillas.length !== 6) continue;
  const r = ajustarEspecificaciones(casillas, COLUMNAS_EQUIPO_6);
  const renglones = r.casillas.flatMap((x) => [x.titulo.split("\n").length, x.valor.split("\n").length]);
  const maximo = Math.max(...renglones);
  peor = Math.max(peor, maximo);
  const movidos = r.anchos.some((a, i) => Math.abs(a - COLUMNAS_EQUIPO_6[i]) > 0.05);
  if (maximo > 2 || movidos) {
    console.log(
      `${f.codigo.padEnd(11)} máx ${maximo} renglones${movidos ? "  anchos " + r.anchos.join("/") : ""}`,
    );
    r.casillas.forEach((x, i) => {
      if (x.valor.includes("\n") || x.titulo.includes("\n"))
        console.log(`   ${x.titulo.replace(/\n/g, "·")} (${r.anchos[i]}mm): ${x.valor.replace(/\n/g, " · ")}`);
    });
  }
}
console.log(`\nMáximo de renglones en todas las fichas: ${peor}`);
