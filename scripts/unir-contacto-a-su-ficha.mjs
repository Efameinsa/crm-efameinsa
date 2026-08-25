// ============================================================
// CRM EFAMEINSA · Unir un contacto repetido a la ficha que ya existía
// ============================================================
// Caso de Ariana, 25-08: «lo de Enrique Díaz ya fue atendido el mismo día 19».
// El lead PRO-08877 entró por el formulario web el 19, se derivó el 25, y como
// el cliente ya estaba en el CRM pero SIN teléfono cargado, el deduplicador no
// lo reconoció y la derivación le abrió una ficha nueva. El mismo señor quedó
// partido en dos: la cotización y el seguimiento en una ficha, el contacto de
// hoy en la otra.
//
// QUÉ HACE. Une la ficha que nació de la derivación con la que ya existía:
//
//   · toda la historia se muda a la ficha buena (fusionar de lib-fusionar-cuentas);
//   · el teléfono del formulario queda como contacto de esa ficha — que es lo
//     que va a evitar que el próximo formulario del mismo señor vuelva a abrir
//     una tercera;
//   · si la ficha buena ya tenía una oportunidad abierta, el lead se engancha a
//     ELLA y la oportunidad vacía que creó la derivación se borra. El comercial
//     ya lo está trabajando: no necesita dos fichas del mismo cliente en su
//     tablero, necesita que su seguimiento sepa de dónde vino el contacto.
//
// QUÉ NO HACE. No borra nada que tenga trabajo encima: si la oportunidad nueva
// ya tiene una gestión o una cotización, se queda como está y solo se unen las
// fichas. Y no decide que dos personas son la misma — eso lo dice quien lo
// ejecuta, que para eso mira los dos nombres en pantalla antes de aplicar.
//
// Uso:
//   node --env-file=.env.local scripts/unir-contacto-a-su-ficha.mjs <CODIGO_LEAD> <ID_CUENTA_BUENA> [--aplicar]

import { Client } from "pg";
import { fusionar, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const [codigoLead, idDestino] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APLICAR = process.argv.includes("--aplicar");
const ABIERTAS = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial"];

if (!codigoLead || !idDestino) {
  console.error("Uso: unir-contacto-a-su-ficha.mjs <CODIGO_LEAD> <ID_CUENTA_BUENA> [--aplicar]");
  process.exit(1);
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: leads } = await bd.query(
  `select l.id, l.codigo, l.nombre_contacto, l.telefono, l.cuenta_id,
          (l.created_at at time zone 'America/Lima')::timestamp(0) llegó,
          (l.asignado_at at time zone 'America/Lima')::timestamp(0) derivado,
          p.codigo_comercial, p.nombre as comercial, l.asignado_a
     from leads l left join perfiles p on p.id = l.asignado_a
    where upper(l.codigo) = upper($1)`,
  [codigoLead],
);
if (leads.length !== 1) {
  console.error(`✗ No hay un contacto con código ${codigoLead}.`);
  process.exit(1);
}
const lead = leads[0];
if (!lead.cuenta_id) {
  console.error(`✗ ${lead.codigo} no tiene ficha: no hay nada que unir.`);
  process.exit(1);
}

const { rows: fichas } = await bd.query(
  `select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.departamento, p.codigo_comercial, p.nombre as dueno,
          (select count(*) from oportunidades o where o.cuenta_id = c.id) ops
     from cuentas c left join perfiles p on p.id = c.comercial_id
    where c.id = any($1::uuid[])`,
  [[lead.cuenta_id, idDestino]],
);
const origen = fichas.find((f) => f.id === lead.cuenta_id);
const destino = fichas.find((f) => f.id === idDestino);
if (!destino) {
  console.error(`✗ No existe la cuenta ${idDestino}.`);
  process.exit(1);
}
if (origen.id === destino.id) {
  console.error(`✗ ${lead.codigo} ya está en esa ficha.`);
  process.exit(1);
}

// La oportunidad que creó la derivación, y la que el comercial ya venía
// trabajando en la ficha buena.
const { rows: nuevas } = await bd.query(
  `select o.id, o.etapa, (select count(*) from actividades a where a.oportunidad_id = o.id) gestiones,
          (select count(*) from cotizaciones z where z.oportunidad_id = o.id) cotizaciones
     from oportunidades o where o.lead_id = $1`,
  [lead.id],
);
const { rows: abiertas } = await bd.query(
  `select o.id, o.etapa, o.proxima_accion, o.lead_id, p.codigo_comercial
     from oportunidades o left join perfiles p on p.id = o.comercial_id
    where o.cuenta_id = $1 and o.etapa::text = any($2::text[])
    order by o.updated_at desc`,
  [destino.id, ABIERTAS],
);
const nueva = nuevas[0] ?? null;
const enCurso = abiertas.find((o) => o.id !== nueva?.id && !o.lead_id) ?? null;
const puedeBorrarse = nueva && enCurso && Number(nueva.gestiones) === 0 && Number(nueva.cotizaciones) === 0;

console.log(`\nContacto ${lead.codigo} — ${lead.nombre_contacto} · ${lead.telefono ?? "sin teléfono"}`);
console.log(`  llegó ${lead.llegó}, derivado ${lead.derivado ?? "—"} a ${lead.codigo_comercial ?? "—"} ${lead.comercial ?? ""}`);
console.log(`\n  ficha que abrió la derivación : ${origen.razon_social}  (${origen.ops} oportunidad(es))`);
console.log(`  ficha que ya existía          : ${destino.razon_social}  (${destino.ops} oportunidad(es), cartera de ${destino.codigo_comercial ?? "nadie"})`);
console.log(`\n  la historia se muda a: ${destino.razon_social}`);
if (enCurso) {
  console.log(`  el contacto se engancha a la oportunidad en curso: ${enCurso.etapa} · ${enCurso.proxima_accion ?? "sin próxima acción"}`);
} else {
  console.log(`  la ficha buena no tiene ninguna oportunidad abierta sin lead: la nueva se queda como está`);
}
if (nueva) {
  console.log(
    puedeBorrarse
      ? `  la oportunidad vacía de la derivación se borra (${nueva.etapa}, sin gestiones ni cotizaciones)`
      : `  la oportunidad de la derivación se conserva (${nueva.etapa}, ${nueva.gestiones} gestión(es), ${nueva.cotizaciones} cotización(es))`,
  );
}

if (!APLICAR) {
  console.log("\nNada se ha modificado. Agregá --aplicar para hacerlo.\n");
  await bd.end();
  process.exit(0);
}

// La cartera se queda con quien tuvo la actividad más reciente sobre el
// cliente, que es la misma regla que usan las otras fusiones del proyecto.
const [actDestino, actOrigen] = await Promise.all([ultimaActividad(bd, destino.id), ultimaActividad(bd, origen.id)]);
const carteraId =
  (actDestino ?? "0") >= (actOrigen ?? "0")
    ? destino.codigo_comercial
      ? undefined
      : lead.asignado_a
    : lead.asignado_a;

await fusionar(bd, destino.id, origen.id, { carteraId: carteraId ?? null });

if (puedeBorrarse) {
  await bd.query(`update oportunidades set lead_id = $2, updated_at = now() where id = $1`, [enCurso.id, lead.id]);
  await bd.query(`delete from oportunidades where id = $1`, [nueva.id]);
}

console.log(`\n✓ ${lead.codigo} quedó dentro de la ficha de ${destino.razon_social}.`);
if (puedeBorrarse) console.log(`✓ Se enganchó al seguimiento que ya estaba en curso; no quedó una segunda ficha en el tablero.`);
console.log(`✓ El teléfono ${lead.telefono ?? "—"} queda en la ficha: el próximo formulario del mismo cliente ya no abrirá otra.\n`);
await bd.end();
