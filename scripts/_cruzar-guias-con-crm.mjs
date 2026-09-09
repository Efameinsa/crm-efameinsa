// Cruce SOLO LECTURA de las guías de remisión con lo que el CRM ya sabe.
import { readFileSync } from "node:fs";
import { Client } from "pg";
const { guias } = JSON.parse(readFileSync("scripts/data/guias-remision.json", "utf8"));
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const norm = (s) => String(s ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
const { rows: equipos } = await bd.query(`select id::text, serie, cuenta_id::text, fecha_venta, garantia_hasta from equipos_instalados where serie is not null`);
const porSerie = new Map(equipos.map((e) => [norm(e.serie), e]));
const { rows: cuentas } = await bd.query(`select id::text, num_doc, razon_social from cuentas where num_doc is not null`);
const porRuc = new Map(cuentas.map((c) => [String(c.num_doc).replace(/\D/g, ""), c]));

const items = guias.flatMap((g) => g.items.map((i) => ({ ...i, g })));
const conSerie = items.filter((i) => i.serie);
const series = [...new Set(conSerie.map((i) => norm(i.serie)))];
const yaEstan = series.filter((s) => porSerie.has(s));
const rucs = [...new Set(guias.map((g) => g.ruc).filter(Boolean))];
const rucsConocidos = rucs.filter((r) => porRuc.has(r));

console.log(`SERIES  · en las guías: ${series.length}  ·  que el CRM ya tiene: ${yaEstan.length}  ·  NUEVAS: ${series.length - yaEstan.length}`);
console.log(`CLIENTES· RUC en las guías: ${rucs.length}  ·  que el CRM ya tiene: ${rucsConocidos.length}  ·  desconocidos: ${rucs.length - rucsConocidos.length}`);
console.log(`MÁQUINAS del parque con serie: ${equipos.length}  ·  de ellas, con guía: ${equipos.filter((e) => series.includes(norm(e.serie))).length}`);
const sinFecha = equipos.filter((e) => !e.fecha_venta && series.includes(norm(e.serie)));
console.log(`Máquinas SIN fecha de venta que la guía SÍ tiene: ${sinFecha.length}`);
const sinGarantia = equipos.filter((e) => !e.garantia_hasta && series.includes(norm(e.serie)));
console.log(`Máquinas SIN garantía calculada que la guía permitiría fechar: ${sinGarantia.length}`);

console.log("\nEjemplos de series NUEVAS (no están en el parque):");
for (const s of series.filter((x) => !porSerie.has(x)).slice(0, 6)) {
  const it = conSerie.find((i) => norm(i.serie) === s);
  console.log(`  ${it.serie}  ·  ${String(it.descripcion).slice(0, 60)}  ·  guía ${it.g.numero} ${it.g.emitida}  ·  ${String(it.g.cliente).slice(0, 30)}`);
}
await bd.end();
