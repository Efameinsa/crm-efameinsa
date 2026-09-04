// Los cuatro avisos que Central mandó el 04-09 entre las 14:25 y las 16:07
// llegaron solo a Finanzas: el contacto entró sin documento y sin ficha, y la
// versión de entonces solo sabía buscar al cliente por esas dos vías (ver la
// migración 0173). Dos de esos avisos son instrucciones de despacho que
// postventa necesita hoy —Pacha Nan Samay pide envío mañana a primera hora por
// Roman Cargo a Oxapampa; Sierra Travel, el lunes 7 o martes 8 por Espinoza
// Cargo a Huamanga—, así que se reenvían para que lleguen a donde tenían que
// llegar.
//
// Se reenvían DESDE GERENCIA, no simulando a Central: el aviso queda con su
// autor real y se puede revertir como cualquier otro. El texto es el que
// escribió Central, con una línea al final que explica por qué llega tarde.
//
// Antes se unen las dos fichas de GRUPO ALIMENTICIO SAN JOSE S.A. —mismo
// nombre, mismo teléfono, mismo comercial (C1), una con RUC y otra sin
// documento—, porque mientras estén partidas el aviso no sabe a cuál anotar.

import pg from "pg";
import { fusionar, historia, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const SANTOS = "13064ef8-3e96-45fc-9d72-c181cac5226f"; // Gerencia Comercial
const BRENDA = "e03cde25-7d86-4e21-8abb-08c21a279ed4";
const SAN_JOSE_CON_RUC = "799db62b-ae33-49bb-9616-fffb19dbc6ca";
const SAN_JOSE_SIN_DOC = "97522731-8e2d-4cd5-8941-a27b45b84a13";
const CODIGOS = ["PRO-09139", "PRO-09140", "PRO-09141", "PRO-09146"];
const COLA = "\n\n[Reenviado el 04-09 desde gerencia: el aviso original llegó solo a Finanzas porque el contacto no tenía ficha enlazada.]";

const bd = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p = []) => (await bd.query(s, p)).rows;

console.log("== ANTES: las dos fichas de San José ==");
console.table(await q(`select id, razon_social, tipo_doc, num_doc from cuentas where id = any($1)`, [[SAN_JOSE_CON_RUC, SAN_JOSE_SIN_DOC]]));
for (const id of [SAN_JOSE_CON_RUC, SAN_JOSE_SIN_DOC]) {
  console.log(id.slice(0, 8), await ultimaActividad(bd, id), JSON.stringify(await historia(bd, id)));
}

try {
  await bd.query("begin");

  // 1. Una sola ficha de San José, la que tiene el RUC. La cartera no se mueve:
  //    las dos ya eran de C1.
  await fusionar(bd, SAN_JOSE_CON_RUC, SAN_JOSE_SIN_DOC, {
    carteraId: BRENDA,
    nombreOficial: "GRUPO ALIMENTICIO SAN JOSE S.A.",
  });
  console.log("\nFichas de San José unidas en la del RUC.");

  // 2. Los cuatro avisos, otra vez, a los tres destinos.
  await bd.query("set local role authenticated");
  await bd.query(`select set_config('request.jwt.claims', json_build_object('sub','${SANTOS}','role','authenticated')::text, true)`);

  for (const codigo of CODIGOS) {
    const lead = (await q(`select id, codigo, razon_social, mensaje from leads where codigo = $1`, [codigo]))[0];
    if (!lead) { console.log(codigo, "· no está"); continue; }
    const r = (await q(`select derivar_aviso($1, true, true, true, $2) j`, [lead.id, (lead.mensaje ?? "").trim() + COLA]))[0].j;
    console.log(`\n${codigo} · ${(r.cliente ?? "").slice(0, 44)}`);
    console.log("   hecho:", JSON.stringify(r.hecho));
    if ((r.falta ?? []).length) console.log("   falta:", JSON.stringify(r.falta));
  }

  await bd.query("reset role");
  await bd.query("commit");
  console.log("\nAplicado.");
} catch (e) {
  await bd.query("rollback");
  console.error("Revertido por error:", e.message);
  process.exit(1);
}

console.log("\n== DESPUÉS ==");
console.table(await q(`select razon_social, tipo_doc, num_doc from cuentas where id = $1`, [SAN_JOSE_CON_RUC]));
console.log("avisos registrados (todos revertibles):");
console.table(
  await q(`select l.codigo, a.a_finanzas, a.a_postventa, a.a_comercial, a.actividad_id is not null en_historial, a.servicio_id is not null en_pedido
             from avisos_derivados a join leads l on l.id = a.lead_id order by a.created_at`),
);
console.log("lo que ve postventa en sus pedidos:");
console.table(
  await q(`select cliente_texto, right(observaciones, 80) ultima_linea from servicios_postventa where observaciones like '%Aviso de Central%'`),
);
await bd.end();
