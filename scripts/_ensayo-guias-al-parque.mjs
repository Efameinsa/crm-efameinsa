// EN SECO: qué pasaría si las guías de remisión entraran al parque instalado.
// No escribe una sola fila. Solo cuenta y muestra ejemplos.
//
//   node --env-file=.env.local scripts/_ensayo-guias-al-parque.mjs
import { readFileSync } from "node:fs";
import { Client } from "pg";

const { guias } = JSON.parse(readFileSync("scripts/data/guias-remision.json", "utf8"));
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const norm = (s) => String(s ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
const { rows: equipos } = await bd.query(
  `select id::text, serie, cuenta_id::text, fecha_venta, garantia_hasta from equipos_instalados where serie is not null`);
const porSerie = new Map(equipos.map((e) => [norm(e.serie), e]));
const { rows: cuentas } = await bd.query(`select id::text, num_doc, razon_social from cuentas where num_doc is not null`);
const porRuc = new Map(cuentas.map((c) => [String(c.num_doc).replace(/\D/g, ""), c]));

// UN ÍTEM CON SERIE NO ES SIEMPRE UNA MÁQUINA INSTALADA. El motivo del
// traslado lo dice: una consignación es material que se deja a prueba y una
// devolución es material que VUELVE. Meterlos al parque como equipos vendidos
// sería inventar instalaciones que no ocurrieron.
const MOTIVO_INSTALA = new Set(["Venta", "Venta sujeta a confirmación del comprador"]);

const items = [];
for (const g of guias) for (const i of g.items) if (i.serie) items.push({ ...i, g });

const porMotivo = {};
for (const i of items) {
  const m = i.g.motivo ?? "(sin motivo)";
  porMotivo[m] = (porMotivo[m] ?? 0) + 1;
}

// La serie más antigua manda: la garantía corre desde que SALIÓ la primera vez.
const primera = new Map();
for (const i of items.filter((x) => MOTIVO_INSTALA.has(x.g.motivo))) {
  const s = norm(i.serie);
  const previo = primera.get(s);
  if (!previo || String(i.g.emitida) < String(previo.g.emitida)) primera.set(s, i);
}

const nuevas = [...primera.values()].filter((i) => !porSerie.has(norm(i.serie)));
const conocidas = [...primera.values()].filter((i) => porSerie.has(norm(i.serie)));
const nuevasConCliente = nuevas.filter((i) => i.g.ruc && porRuc.has(i.g.ruc));
const nuevasSinCliente = nuevas.filter((i) => !i.g.ruc || !porRuc.has(i.g.ruc));
const aFechar = conocidas.filter((i) => {
  const e = porSerie.get(norm(i.serie));
  return !e.fecha_venta || !e.garantia_hasta;
});
const yaFechadas = conocidas.filter((i) => {
  const e = porSerie.get(norm(i.serie));
  return e.fecha_venta && e.garantia_hasta;
});
// Lo que hay que mirar con lupa: la fecha del CRM y la de la guía no coinciden.
const discrepan = yaFechadas.filter((i) => {
  const e = porSerie.get(norm(i.serie));
  return String(e.fecha_venta).slice(0, 10) !== String(i.g.emitida).slice(0, 10);
});

console.log("ÍTEMS CON SERIE, POR MOTIVO DEL TRASLADO");
for (const [m, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${MOTIVO_INSTALA.has(m) ? "→ instala" : "  no entra"}  ${String(n).padStart(4)}  ${m}`);
}
console.log(`\nSeries únicas que SÍ instalan: ${primera.size}`);
console.log(`  · ya están en el parque: ${conocidas.length}`);
console.log(`      de ellas, SIN fecha o SIN garantía (se completarían): ${aFechar.length}`);
console.log(`      con fecha propia que NO coincide con la guía (mirar): ${discrepan.length}`);
console.log(`  · NO están en el parque: ${nuevas.length}`);
console.log(`      con cliente ya conocido por RUC: ${nuevasConCliente.length}`);
console.log(`      sin cliente en el CRM (habría que crearlo): ${nuevasSinCliente.length}`);
console.log(`\nEl parque hoy tiene ${equipos.length} máquinas con serie.`);

console.log("\nEJEMPLOS de lo que se COMPLETARÍA (ya está la máquina, falta la fecha):");
for (const i of aFechar.slice(0, 5)) {
  const e = porSerie.get(norm(i.serie));
  console.log(`  ${i.serie}  ·  hoy fecha_venta=${e.fecha_venta ?? "vacía"}  →  guía ${i.g.numero} del ${i.g.emitida}`);
}
console.log("\nEJEMPLOS de series que NO coinciden en fecha (no se tocarían sin decidir):");
for (const i of discrepan.slice(0, 5)) {
  const e = porSerie.get(norm(i.serie));
  console.log(`  ${i.serie}  ·  CRM ${String(e.fecha_venta).slice(0, 10)}  vs  guía ${i.g.emitida}`);
}
console.log("\nEJEMPLOS de lo que se CREARÍA (máquina nueva en el parque):");
for (const i of nuevasConCliente.slice(0, 5)) {
  console.log(`  ${i.serie}  ·  ${String(i.descripcion).slice(0, 52)}  ·  ${porRuc.get(i.g.ruc).razon_social.slice(0, 26)}  ·  ${i.g.emitida}`);
}
console.log("\nSERIES SOSPECHOSAS (parecen código de repuesto, no de máquina):");
const sospechosas = [...primera.values()].filter((i) => i.serie.length <= 5 || /^MOD/.test(i.serie));
for (const i of sospechosas.slice(0, 8)) console.log(`  ${i.serie}  ·  ${String(i.descripcion).slice(0, 62)}`);
console.log(`  (${sospechosas.length} en total)`);
await bd.end();
