// Carga al parque instalado lo que dicen las guías de remisión del servidor.
//
// Sin `--aplicar` hace el ENSAYO dentro de una transacción y la revierte.
//
//   node --env-file=.env.local scripts/cargar-guias-al-parque.mjs
//   node --env-file=.env.local scripts/cargar-guias-al-parque.mjs --aplicar
//
// LAS REGLAS, y por qué son así:
//
// · Una guía de VENTA es una máquina que salió a un cliente: se registra y su
//   fecha de despacho es la de la guía. La garantía se calcula sola desde ahí
//   (`calcular_garantia_equipo` usa fecha_despacho), que es exactamente lo que
//   significa «la garantía corre desde la guía».
//
// · Una guía de motivo «Otros» que devuelve una máquina de un SERVICIO no es
//   una venta: la máquina ya era del cliente y esa fecha es la de una
//   reparación. Se registra la máquina si falta —saber que el cliente la
//   tiene es útil— pero SIN fecha de despacho: darle garantía desde una
//   reparación regalaría hasta dos años que no corresponden.
//
// · Los REPUESTOS con serie (placas, válvulas, empaquetaduras) no son máquinas
//   instaladas y no entran.
//
// · CONSIGNACIÓN y DEVOLUCIÓN no entran: la primera es material dejado a
//   prueba y la segunda es material que vuelve.
//
// · NUNCA se crea una ficha de cliente. Si el RUC de la guía no está en el
//   CRM, la máquina queda fuera y se reporta: crear fichas a ciegas es lo que
//   produce los duplicados que ya tenemos.
//
// · NUNCA se pisa un dato que ya estaba. Solo se rellena lo vacío.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const { guias } = JSON.parse(readFileSync("scripts/data/guias-remision.json", "utf8"));

const SERVICIO = /SERVICIO|MANTENIMIENTO|CULMINACION|CORRECTIVO|PREVENTIVO|REPARACION|DEVOLUC|ACTUALIZACION|GARANT/i;
const MAQUINA = /LAVADORA|SECADORA|CALANDRIA|PLANCHA|MESA|CENTRIFUGA|PRENSA|CALDER|BARRERA|TORRE|WET|SECADO/i;
const VENTA = new Set(["Venta", "Venta sujeta a confirmación del comprador"]);
const norm = (s) => String(s ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

/** Qué es este ítem: una máquina vendida, una máquina que vuelve de servicio, o nada. */
function clasificar(item, guia) {
  const d = String(item.descripcion ?? "");
  if (!MAQUINA.test(d)) return null; // repuestos y componentes: no son parque
  if (SERVICIO.test(d)) return "vuelve_de_servicio";
  if (VENTA.has(guia.motivo)) return "vendida";
  if (String(guia.motivo ?? "").startsWith("Otros")) return "vuelve_de_servicio";
  return null; // consignación, devolución
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: cuentas } = await bd.query(`select id, num_doc, razon_social from cuentas where num_doc is not null`);
const porRuc = new Map(cuentas.map((c) => [String(c.num_doc).replace(/\D/g, ""), c]));
const { rows: equipos } = await bd.query(
  `select id, serie, fecha_despacho, fecha_venta, cuenta_id from equipos_instalados where serie is not null`);
const porSerie = new Map(equipos.map((e) => [norm(e.serie), e]));

// La guía MÁS ANTIGUA de cada serie manda: la garantía corre desde que salió
// la primera vez, no desde la última vez que se movió.
const candidatas = new Map();
for (const g of guias) {
  for (const i of g.items) {
    if (!i.serie) continue;
    const tipo = clasificar(i, g);
    if (!tipo) continue;
    const s = norm(i.serie);
    const previo = candidatas.get(s);
    // «vendida» le gana a «vuelve_de_servicio» aunque sea posterior: es la
    // única de las dos que puede fechar la garantía.
    const mejor =
      !previo ||
      (tipo === "vendida" && previo.tipo !== "vendida") ||
      (tipo === previo.tipo && String(g.emitida) < String(previo.g.emitida));
    if (mejor) candidatas.set(s, { ...i, g, tipo });
  }
}

const plan = { crear: [], fechar: [], sinCliente: [], yaCompletas: [] };
for (const [s, c] of candidatas) {
  const cuenta = c.g.ruc ? porRuc.get(c.g.ruc) : null;
  const existe = porSerie.get(s);
  if (!existe && !cuenta) { plan.sinCliente.push(c); continue; }
  if (!existe) { plan.crear.push({ ...c, cuenta }); continue; }
  // Existe: solo se le completa la fecha si está vacía Y la guía es de venta.
  if (c.tipo === "vendida" && !existe.fecha_despacho) plan.fechar.push({ ...c, equipo: existe });
  else plan.yaCompletas.push(c);
}

console.log(`Series candidatas: ${candidatas.size}`);
console.log(`  · se CREAN en el parque:                ${plan.crear.length}`);
console.log(`      de ellas, sin fecha (vuelven de servicio): ${plan.crear.filter((x) => x.tipo !== "vendida").length}`);
console.log(`  · ya están y se les COMPLETA la fecha:  ${plan.fechar.length}`);
console.log(`  · ya están y no se tocan:               ${plan.yaCompletas.length}`);
console.log(`  · fuera, el cliente no está en el CRM:  ${plan.sinCliente.length}`);

await bd.query("begin");
try {
  let creadas = 0, fechadas = 0;
  for (const c of plan.crear) {
    const nota = `Cargado de la guía de remisión ${c.g.numero} (${c.g.emitida}), ruta X: del servidor.` +
      (c.tipo === "vendida" ? "" : " La guía documenta un servicio, no una venta: por eso queda SIN fecha de despacho y sin garantía.");
    await bd.query(
      `insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, fecha_despacho, guia_remision, observaciones)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [String(c.serie).trim(), c.cuenta.id, c.cuenta.razon_social, String(c.descripcion).slice(0, 200),
       c.tipo === "vendida" ? c.g.emitida : null, c.g.numero, nota]);
    creadas++;
  }
  for (const c of plan.fechar) {
    const { rowCount } = await bd.query(
      `update equipos_instalados
          set fecha_despacho = $2,
              guia_remision  = coalesce(guia_remision, $3),
              observaciones  = coalesce(nullif(observaciones,''), '') ||
                               case when coalesce(observaciones,'') = '' then '' else E'\\n' end ||
                               $4
        where id = $1 and fecha_despacho is null`,
      [c.equipo.id, c.g.emitida, c.g.numero,
       `Fecha de despacho tomada de la guía ${c.g.numero} (${c.g.emitida}).`]);
    fechadas += rowCount;
  }
  const { rows: [antes] } = await bd.query(`select count(*) n, count(garantia_hasta) g from equipos_instalados`);
  console.log(`\nCreadas: ${creadas}  ·  fechadas: ${fechadas}`);
  console.log(`El parque queda en ${antes.n} máquinas, ${antes.g} con garantía calculada.`);
  if (APLICAR) {
    await bd.query("commit");
    console.log("\nAPLICADO.");
  } else {
    await bd.query("rollback");
    console.log("\n(ensayo: revertido, no se escribió nada — para aplicar, --aplicar)");
  }
} catch (e) {
  await bd.query("rollback");
  console.log("\n✗ falló, no se escribió nada:", e.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await bd.end();
}
