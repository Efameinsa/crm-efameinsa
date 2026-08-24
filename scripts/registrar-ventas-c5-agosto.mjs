// ============================================================
// CRM EFAMEINSA · Las dos ventas de agosto que C5 reclama
// ============================================================
// Katerine (C5) reclama el 24-08 que dos de sus ventas no figuran. Mandó las
// dos filas de su Excel (Downloads/venta-1.jpg y venta-2.jpg):
//
//   19/08/2026 · ZERCOM PERU SAC.- AGUILAR PACARA JESUS GREGORIO · presupuesto
//   429-26 · US$ 2.350 · Mesa de planchado aspirante semi-industrial con
//   calderín 4 litros, SIDI MONDIAL / FENIX. Nota: «…que se le ha la factura
//   con otro ruc Y CIERRE SE HACE CON OPEN».
//
//   22/08/2026 · SAN AGUSTIN PARACAS S.A.C. · presupuesto 438-26 · US$ 21.000
//   · Lavadora industrial flotante UNIMAC UY280 31 KG. Nota: «se procede a
//   firmar el contrato y realizar el cierre con lo acordado EN EL CONTRATO con
//   open».
//
// POR QUÉ FALTAN. No es un fallo del CRM: nunca entraron. El histórico se
// importó hasta el 17-08 y estas son del 19 y del 22 — la última venta de C5
// en el sistema es del 12-08. Son dos de las 112 que quedaron fuera y que,
// según el ing. Carlos, se regularizan cuando cada comercial pasa su reporte
// de los sábados.
//
// LO QUE SÍ CONFIRMA EL SISTEMA. Los dos presupuestos existen en el archivo de
// documentos de la empresa, en la serie OPEN y con C5 como asesora:
//     OPEN 429-26 · 15-08-2026 · TENESE INGENIERIA S.A.C.- AGUILAR PACARA JESUS GREGORIO
//     OPEN 438-26 · 18-08-2026 · SAN AGUSTIN PARACAS S.A.C
//
// ⚠️ LA PRIMERA NO SE REGISTRA SOLA. El Excel de C5 dice ZERCOM PERU SAC y el
// presupuesto dice TENESE INGENIERIA S.A.C. — la misma persona (Aguilar Pacara
// Jesús Gregorio) con dos empresas distintas, y su propia nota avisa que «la
// factura va con otro RUC». No hay ninguna cuenta ZERCOM en el CRM. A qué
// empresa se le imputa una venta de US$ 2.350 no lo puede decidir un script:
// lo tiene que confirmar C5.
//
// Uso: node --env-file=.env.local scripts/registrar-ventas-c5-agosto.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: perfil } = await bd.query(
  `select id, nombre from perfiles where codigo_comercial = 'C5' limit 1`,
);
if (perfil.length === 0) throw new Error("No se encontró el perfil de C5");
const c5 = perfil[0];

// ── La que SÍ se puede registrar ────────────────────────────────────────────
// Cuenta con RUC, de su cartera, con una oportunidad ya en 'cotizada'. Se elige
// la que tiene RUC entre las tres fichas duplicadas del mismo cliente (las
// otras dos son SIN_DOC y una lleva el RUC metido dentro del nombre: es el
// problema de las cuentas partidas, que se resuelve aparte).
const { rows: cuentas } = await bd.query(
  `select cu.id, cu.razon_social, cu.num_doc,
          (select o.id from oportunidades o where o.cuenta_id = cu.id order by o.created_at desc limit 1) oportunidad_id,
          (select o.etapa from oportunidades o where o.cuenta_id = cu.id order by o.created_at desc limit 1) etapa
     from cuentas cu
    where cu.razon_social ilike 'SAN AGUSTIN PARACAS%'
      and cu.tipo_doc = 'RUC'
      and cu.comercial_id = $1`,
  [c5.id],
);

if (cuentas.length !== 1) {
  console.error(`Se esperaba UNA cuenta con RUC de SAN AGUSTIN PARACAS en la cartera de C5; hay ${cuentas.length}.`);
  await bd.end();
  process.exit(1);
}
const destino = cuentas[0];

const VENTA = {
  oportunidadId: destino.oportunidad_id,
  serie: "OPEN",
  fecha: "2026-08-22",
  monto: 21000,
  moneda: "USD",
  referencia: "Presu_438-26",
  equipo: "Lavadora industrial flotante UNIMAC UY280 31 KG",
  nota:
    "Registrada el 24-08 a partir del Excel de C5 (reporte del 22-08): «se procede a firmar el contrato " +
    "y realizar el cierre con lo acordado EN EL CONTRATO con open». Presupuesto OPEN 438-26 del 18-08, " +
    "que consta en el archivo de documentos. No entró antes porque el histórico se importó hasta el 17-08.",
};

// ¿Ya está registrada? Correr esto dos veces no puede duplicar una venta.
const { rows: yaEsta } = await bd.query(
  `select id from ventas where oportunidad_id = $1 and referencia_historica = $2`,
  [VENTA.oportunidadId, VENTA.referencia],
);

console.log(`Comercial: ${c5.nombre} (C5)\n`);
console.log("SE REGISTRA:");
console.log(`  ${destino.razon_social} · RUC ${destino.num_doc}`);
console.log(`  ${VENTA.fecha} · ${VENTA.moneda} ${VENTA.monto.toLocaleString("es-PE")} · serie ${VENTA.serie} · ${VENTA.referencia}`);
console.log(`  ${VENTA.equipo}`);
console.log(`  oportunidad ${VENTA.oportunidadId} (hoy en '${destino.etapa}')`);
if (yaEsta.length > 0) console.log(`  ⚠ ya estaba registrada: no se vuelve a insertar`);

console.log("\nNO SE REGISTRA, HAY QUE PREGUNTARLE A C5:");
console.log("  19-08 · US$ 2.350 · Mesa de planchado SIDI MONDIAL / FENIX · presupuesto OPEN 429-26");
console.log("  Su Excel dice ZERCOM PERU SAC y el presupuesto dice TENESE INGENIERIA S.A.C. — la misma");
console.log("  persona (Aguilar Pacara Jesús Gregorio) con dos empresas. Su nota avisa que la factura va");
console.log("  con otro RUC. No hay cuenta ZERCOM en el CRM.");
console.log("  → ¿a qué razón social y RUC se le imputa la venta?");

if (!APLICAR) {
  console.log("\n(Simulación: no se escribió nada. Correr con --aplicar.)");
  await bd.end();
  process.exit(0);
}

if (yaEsta.length === 0) {
  await bd.query(
    `insert into ventas (oportunidad_id, cotizacion_id, serie, fecha_venta, monto_total, moneda,
                         registrada_por, notas, origen, referencia_historica, equipo_historico)
     values ($1, null, $2::serie_cotizacion, $3::date, $4, $5::moneda, $6, $7, 'historico_excel', $8, $9)`,
    [
      VENTA.oportunidadId,
      VENTA.serie,
      VENTA.fecha,
      VENTA.monto,
      VENTA.moneda,
      c5.id,
      VENTA.nota,
      VENTA.referencia,
      VENTA.equipo,
    ],
  );
  // La oportunidad se cierra: es lo que hace que deje de aparecer como abierta
  // en el tablero y que cuente en el velocímetro de la meta.
  await bd.query(
    `update oportunidades set etapa = 'venta', cerrada_at = $2::date, updated_at = now() where id = $1`,
    [VENTA.oportunidadId, VENTA.fecha],
  );
  console.log("\n✓ Venta registrada y oportunidad cerrada.");
} else {
  console.log("\nNada que hacer: ya estaba registrada.");
}

await bd.end();
