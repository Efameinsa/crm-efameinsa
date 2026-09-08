/**
 * Datos de práctica para que un tester recorra postventa de punta a punta.
 *
 * NADA DE ESTO PUEDE MANCHAR UNA MÉTRICA. Dos reglas que se respetan acá:
 *
 *  1. Todo cuelga del perfil PV0 (es_prueba) y se marca `es_prueba` en las
 *     tablas que tienen la columna. `resumen_gerencia` excluye los perfiles de
 *     práctica, así que nada de esto llega a los tableros.
 *  2. NO se crean ventas ni informes de cierre. `v_ventas_detalle` NO filtra
 *     es_prueba —lo verifiqué— así que una venta de práctica SÍ aparecería en
 *     el cierre semanal y en el asistente. Por eso la siembra llega hasta la
 *     cotización y se detiene ahí.
 *
 * Las cotizaciones nacen como borrador y con código PRUEBA_: la pantalla de
 * Presupuestos descarta lo que empieza así (migración 0145).
 *
 * Correr con --aplicar; sin eso ensaya y revierte.
 */
import { Client } from "pg";
const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const pv = (await bd.query("select id from perfiles where codigo_comercial = 'PV0'")).rows[0]?.id;
if (!pv) throw new Error("no existe el perfil PV0");
const cuentas = (await bd.query(
  "select id, razon_social from cuentas where comercial_id = $1 order by razon_social", [pv])).rows;
if (cuentas.length < 4) throw new Error("PV0 necesita al menos 4 cuentas de práctica");

const horas = (h) => `now() - interval '${h} hours'`;

// Se repite un cliente a propósito: la bandeja agrupada por cliente solo se
// puede probar si alguien tiene más de un caso abierto.
const ATENCIONES = [
  { c: 0, tipo: "problema_tecnico",        detalle: "La lavadora no centrifuga y muestra error E-07",        h: 30 },
  { c: 0, tipo: "solicitud_repuesto",      detalle: "Pide presupuesto de la bomba de desagüe",               h: 6 },
  { c: 0, tipo: "solicitud_mantenimiento", detalle: "Quiere el preventivo semestral de sus dos secadoras",    h: 2 },
  { c: 1, tipo: "puesta_en_marcha",        detalle: "Equipo entregado ayer, esperando la puesta en marcha",   h: 20 },
  { c: 2, tipo: "problema_tecnico",        detalle: "Secadora calienta pero no gira el tambor",               h: 1 },
  { c: 3, tipo: "solicitud_repuesto",      detalle: "Cotización de resistencias y correas",                   h: 50 },
];

const SERVICIOS = [
  { c: 0, tipo: "mantenimiento_preventivo", dias: 0, nota: "Preventivo de las dos secadoras — visita de hoy" },
  { c: 1, tipo: "puesta_en_marcha",         dias: 0, nota: "Puesta en marcha de la lavadora nueva" },
  { c: 2, tipo: "mantenimiento_correctivo", dias: 2, nota: "Cambio de tambor programado" },
  { c: 3, tipo: "revision",                 dias: 4, nota: "Revisión de rutina" },
  { c: 1, tipo: "capacitacion",             dias: 6, nota: "Capacitación al personal de lavandería" },
];

await bd.query("begin");
try {
  let nAt = 0, nSv = 0, nCot = 0;

  for (const a of ATENCIONES) {
    const cuenta = cuentas[a.c % cuentas.length];
    const r = await bd.query(
      `insert into atenciones (cuenta_id, cliente_texto, tipo, etapa, detalle, solicitado_at, es_prueba, created_at)
       values ($1, $2, $3::tipo_atencion, 'registro'::etapa_atencion, $4, ${horas(a.h)}, true, ${horas(a.h)})
       returning id`,
      [cuenta.id, cuenta.razon_social, a.tipo, a.detalle],
    );
    if (r.rowCount) nAt++;
  }

  for (const s of SERVICIOS) {
    const cuenta = cuentas[s.c % cuentas.length];
    const r = await bd.query(
      `insert into servicios_postventa
         (cuenta_id, cliente_texto, tipo_servicio, observaciones, fecha_confirmacion, responsable_id, es_prueba, origen)
       values ($1, $2, $3, $4, (current_date + $5::int), $6, true, 'crm') returning id`,
      [cuenta.id, cuenta.razon_social, s.tipo, s.nota, s.dias, pv],
    );
    if (r.rowCount) nSv++;
  }

  // Cotizaciones sobre las oportunidades que PV0 ya tiene.
  const ops = (await bd.query(
    `select o.id, c.razon_social from oportunidades o join cuentas c on c.id = o.cuenta_id
      where o.comercial_id = $1 and o.tipo_postventa is not null order by o.created_at limit 3`, [pv])).rows;
  let i = 0;
  for (const o of ops) {
    i++;
    const r = await bd.query(
      `insert into cotizaciones (oportunidad_id, serie, creada_por, estado, codigo, total, moneda, created_at)
       values ($1, 'EFAMEINSA'::serie_cotizacion, $2, 'borrador'::estado_cotizacion, $3, $4, 'USD', now())
       returning id`,
      [o.id, pv, `PRUEBA_${900 + i}-26`, [1250, 3480, 760][i - 1] ?? 1000],
    );
    if (r.rowCount) nCot++;
  }

  console.log(`atenciones nuevas en la bandeja: ${nAt}`);
  console.log(`servicios en la agenda:          ${nSv}`);
  console.log(`cotizaciones de práctica:        ${nCot}`);

  if (APLICAR) { await bd.query("commit"); console.log("\nAPLICADO"); }
  else { await bd.query("rollback"); console.log("\n(ensayo revertido)"); }
} catch (e) {
  await bd.query("rollback");
  console.log("revertido por error:", e.message.slice(0, 250));
}
await bd.end();
