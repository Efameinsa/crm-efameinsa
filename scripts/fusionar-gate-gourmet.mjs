// ============================================================
// CRM EFAMEINSA · GATE GOURMET PERU estaba en tres fichas
// ============================================================
// C5, 10-09, a Central: «se reporta que GATE es cliente según ERP y no jaló
// historial». Santos, 11-09: «inicia con todo».
//
// El correo de Nayeli Loayza (@gategroup.com, sin RUC) entró el 10-09 y
// Central lo derivó como «Cliente nuevo» a C5: nació una tercera ficha vacía.
// Las otras dos ya existían: la del RUC 20341848955 en cartera de C4 (Ariana,
// desde 2022, última gestión marzo 2022) y una sin RUC en cartera de C1
// (Brenda) con cuatro cotizaciones de junio 2025 (996-25 por US$ 227.698).
//
// QUEDA LA DEL RUC (regla de la casa) y las otras dos le mudan encima su
// historia: los expedientes, las cotizaciones del archivo, los contactos y el
// lead PRO-09263 con su expediente vivo. LA CARTERA se queda con quien tuvo la
// actividad más reciente —la regla de lib-fusionar-cuentas.mjs—, que hoy es
// C5 (10-09). Por la regla de los seis meses ninguna de las dos carteras
// anteriores tenía un derecho vivo; si el ERP dice otra cosa, gerencia la
// mueve con «Reasignar» en la ficha.
//
// GATE GROUP (C5, 2023, «es de otro país») NO se toca: es la matriz, no este
// cliente.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-gate-gourmet.mjs
//   node --env-file=.env.local scripts/fusionar-gate-gourmet.mjs --aplicar

import { Client } from "pg";
import { fusionar, historia, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const APLICAR = process.argv.includes("--aplicar");
const DESTINO = "8412f6e0-348e-417a-aaf2-e873d734bee4"; // GATE GOURMET PERU S.R.L. · RUC 20341848955 · C4
const ORIGENES = [
  "a98d5f06-6530-4f41-9387-daecbecf055b", // GATE GOURMET  PERU SRL · sin RUC · C1 (Brenda) · cotizaciones 2025
  "4541c5a2-80d6-4b57-acb3-a26519d84b6d", // Gate Gourmet Perú · sin RUC · C5 · PRO-09263 del 10-09
];

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(
  `select cu.id, cu.razon_social, cu.num_doc, cu.comercial_id, p.codigo_comercial codigo
     from cuentas cu left join perfiles p on p.id = cu.comercial_id where cu.id = any($1)`,
  [[DESTINO, ...ORIGENES]],
);
const destino = rows.find((r) => r.id === DESTINO);
const origenes = ORIGENES.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
if (!destino || origenes.length !== ORIGENES.length) {
  console.log("ABORTA: falta alguna ficha (¿ya se fusionó?)", { destino: !!destino, origenes: origenes.length });
  await bd.end();
  process.exit(1);
}
if (destino.num_doc !== "20341848955" || origenes.some((o) => o.num_doc)) {
  console.log("ABORTA: los documentos no son los esperados", rows.map((r) => [r.razon_social, r.num_doc]));
  await bd.end();
  process.exit(1);
}

console.log(`QUEDA:\n  ${destino.razon_social} · RUC ${destino.num_doc} · ${destino.codigo} · ${JSON.stringify(await historia(bd, DESTINO))}`);
for (const o of origenes) {
  console.log(`\nSE FUSIONA Y DESAPARECE:\n  ${o.razon_social} · sin RUC · ${o.codigo} · ${JSON.stringify(await historia(bd, o.id))}`);
}

const fechas = [];
for (const c of [destino, ...origenes]) fechas.push({ c, f: await ultimaActividad(bd, c.id) });
fechas.sort((a, b) => new Date(b.f) - new Date(a.f));
const carteraId = fechas[0].c.comercial_id;
console.log(`\nLa cartera queda en: ${fechas[0].c.codigo} (actividad más reciente: ${new Date(fechas[0].f).toLocaleDateString("es-PE")}) — gerencia la puede mover con «Reasignar»`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  for (const o of origenes) {
    await fusionar(bd, DESTINO, o.id, { carteraId, nombreOficial: destino.razon_social });
    console.log(`✓ Fusionada «${o.razon_social}»`);
  }
  await bd.query("commit");
} catch (e) {
  await bd.query("rollback");
  console.log(`\nSE REVIRTIÓ TODO — ${e.message}`);
  await bd.end();
  process.exit(1);
}

const { rows: [final] } = await bd.query(
  `select cu.razon_social, cu.nombre_comercial, cu.num_doc, p.codigo_comercial duenio,
          (select count(*) from oportunidades o where o.cuenta_id=cu.id)::int expedientes,
          (select count(*) from contactos ct where ct.cuenta_id=cu.id)::int contactos,
          (select count(*) from cotizaciones_historicas ch where ch.cuenta_id=cu.id)::int cotiz_archivo,
          (select count(*) from leads l where l.cuenta_id=cu.id)::int leads
     from cuentas cu left join perfiles p on p.id = cu.comercial_id where cu.id = $1`,
  [DESTINO],
);
console.log("\nCómo quedó la ficha única:");
console.table([final]);
console.log(`Ficha: /comercial/cartera/${DESTINO} · /central/clientes/${DESTINO}`);
await bd.end();
