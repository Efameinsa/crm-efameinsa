// ============================================================
// CRM EFAMEINSA · Las fichas partidas de COINREFRI
// ============================================================
// Brenda escribió el 31-08: «solicito tu apoyo para que se pueda agregar en el
// sistema el seguimiento del cliente COINREFRI ya que no aparece», y adjuntó
// sus 24 seguimientos del 16-03 al 11-08-2026.
//
// NO FALTA CARGAR NADA. Está todo, en otra ficha del mismo cliente:
//
//   · CORP DE INGENIERIA DE REFRIGERACION SRL   RUC 20100160375  ← 7 op, 27
//     gestiones: TODO el seguimiento 2026 que ella reclama, más 4 ventas
//     históricas de 2023-2024 y el C4_VENTA del 20-04-2026
//   · COINREFRI                                 sin documento    ← la que ella
//     abrió: 1 oportunidad de 2023 «Filtrada», presupuesto 2612-23. Es la del
//     pantallazo que mandó, y de la que colgaba la cotización de US$ 3.347,46
//     que gerencia rechazó hoy viendo UNA sola gestión
//   · COINREFRI                                 sin documento    ← vacía
//   · COINREFRI                                 sin documento    ← vacía
//
// Es el mismo caso que SAN AGUSTIN PARACAS (27-08) con una vuelta de tuerca:
// acá las fichas NO se llaman igual —una lleva la razón social y las otras el
// nombre comercial—, así que `auditar-fichas-partidas.mjs`, que compara
// nombres, no las encuentra. Por eso hubo que llegar por el RUC.
//
// QUEDA FUERA A PROPÓSITO: «CORP DE INGENIERIA DE REFRIGERACION SRL -
// COINREFRI SRL», que es de ARIANA. Fusionarla le movería el cliente de un
// comercial a otro, y eso no es limpiar datos: lo decide gerencia. Se lista
// como aviso al final.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-coinrefri.mjs            (ensayo)
//   node --env-file=.env.local scripts/fusionar-coinrefri.mjs --aplicar

import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { fusionar, historia } from "./lib-fusionar-cuentas.mjs";

const APLICAR = process.argv.includes("--aplicar");
const RUC = "20100160375";
const NOMBRE_FINAL = "CORP DE INGENIERIA DE REFRIGERACION SRL";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: fichas } = await bd.query(
  `select cu.id, cu.razon_social, cu.num_doc, cu.comercial_id,
          coalesce(p.nombre, '(sin dueño)') duenio, p.codigo_comercial
     from cuentas cu left join perfiles p on p.id = cu.comercial_id
    where cu.num_doc = $1
       or cu.razon_social ilike '%COINREFRI%'
       or cu.razon_social ilike '%INGENIERIA DE REFRIGERACION%'
    order by (cu.num_doc is null), cu.created_at`,
  [RUC],
);

const destino = fichas.find((f) => f.num_doc === RUC);
if (!destino) {
  console.error("✗ No está la ficha con el RUC " + RUC + ". No se toca nada.");
  await bd.end();
  process.exit(1);
}

// Solo las de Brenda, que es la dueña de la ficha buena. La de Ariana se avisa.
const deOtroDuenio = fichas.filter((f) => f.id !== destino.id && f.comercial_id !== destino.comercial_id);
const origenes = fichas.filter((f) => f.id !== destino.id && f.comercial_id === destino.comercial_id);

console.log(`\n  DESTINO  ${destino.razon_social}  ·  RUC ${destino.num_doc}  ·  ${destino.duenio}`);
console.log("  " + JSON.stringify(await historia(bd, destino.id)));
for (const o of origenes) {
  console.log(`\n  se funde  ${o.razon_social}  ·  ${o.num_doc ?? "sin documento"}  ·  ${o.duenio}`);
  console.log("  " + JSON.stringify(await historia(bd, o.id)));
}

// Respaldo antes de tocar: qué había en cada ficha, por si hay que rehacerlo.
// Las consultas van UNA POR UNA: `pg` no admite dos en vuelo sobre el mismo
// cliente, y un Promise.all acá las interleaba.
const historiaPrevia = {};
for (const f of [destino, ...origenes]) historiaPrevia[f.id] = await historia(bd, f.id);

const respaldo = {
  fecha: new Date().toISOString(),
  motivo: "Brenda reportó que no veía el seguimiento de COINREFRI (correo 31-08-2026)",
  destino,
  origenes,
  fuera_de_la_fusion: deOtroDuenio,
  historia_previa: historiaPrevia,
  oportunidades: (
    await bd.query(
      `select o.id, o.cuenta_id, o.etapa, o.origen, o.monto_estimado, o.created_at,
              (select count(*) from actividades a where a.oportunidad_id = o.id)::int gestiones
         from oportunidades o where o.cuenta_id = any($1)`,
      [[destino.id, ...origenes.map((o) => o.id)]],
    )
  ).rows,
};
const rutaRespaldo = `backups/fusion-coinrefri-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(rutaRespaldo, JSON.stringify(respaldo, null, 2), "utf8");
console.log(`\n  respaldo → ${rutaRespaldo}`);

if (deOtroDuenio.length) {
  console.log("\n  ⚠ QUEDA FUERA (otro comercial, lo decide gerencia):");
  for (const f of deOtroDuenio) {
    console.log(`     ${f.razon_social} · ${f.duenio} · ${JSON.stringify(await historia(bd, f.id))}`);
  }
}

if (!APLICAR) {
  console.log("\n  Ensayo. Para aplicarlo: agregar --aplicar\n");
  await bd.end();
  process.exit(0);
}

// La cartera se queda con quien ya la tiene: la ficha buena es de Brenda y las
// otras también, así que no hay traspaso que decidir.
await bd.query("begin");
try {
  for (const o of origenes) {
    await fusionar(bd, destino.id, o.id, { carteraId: destino.comercial_id, nombreOficial: NOMBRE_FINAL });
    console.log(`  ✓ fusionada  ${o.razon_social}`);
  }
  await bd.query("commit");
} catch (e) {
  await bd.query("rollback");
  console.error("\n  ✗ ROLLBACK, no se cambió nada:", e.message);
  await bd.end();
  process.exit(1);
}

const { rows: despues } = await bd.query(
  `select cu.razon_social, cu.num_doc, cu.nombre_comercial,
          (select count(*) from oportunidades o where o.cuenta_id = cu.id)::int ops,
          (select count(*) from actividades a join oportunidades o on o.id = a.oportunidad_id
            where o.cuenta_id = cu.id)::int gestiones,
          (select count(*) from contactos c where c.cuenta_id = cu.id)::int contactos
     from cuentas cu where cu.id = $1`,
  [destino.id],
);
console.log("\n  DESPUÉS:", JSON.stringify(despues[0]));

const { rows: quedan } = await bd.query(
  `select razon_social, num_doc from cuentas
    where num_doc = $1 or razon_social ilike '%COINREFRI%' or razon_social ilike '%INGENIERIA DE REFRIGERACION%'`,
  [RUC],
);
console.log("  fichas que quedan:", quedan.map((q) => `${q.razon_social} (${q.num_doc ?? "sin doc"})`).join(" · "));
await bd.end();
