// ============================================================
// CRM EFAMEINSA · Sacar lo que se creó como ejemplo durante la capacitación
// ============================================================
// Darwin, 24-08: «desde la hora que inició la capacitación hasta que terminó
// pasaron como 40 minutos, y ahí creé algunas cosas como haciendo pruebas
// mientras todos veían el funcionamiento. Retira eso del sistema».
//
// La capacitación al área comercial fue de 9:30 a 10:30 de la mañana. En esa
// hora el sistema ya estaba en producción, así que lo que se creó de ejemplo
// quedó mezclado con lo real: cotizaciones, gestiones y oportunidades que
// ensucian el tablero, el reporte diario y los indicadores de gerencia.
//
// ⚠️ ESTE SCRIPT NO ADIVINA. Muestra TODO lo creado en esa ventana y no borra
// nada salvo que se le pasen los identificadores a mano. Durante esa hora
// también pudo entrar trabajo de verdad —Central recibiendo contactos, alguien
// que no estaba en la capacitación—, y borrar por horario se llevaría eso por
// delante.
//
// Uso:
//   node --env-file=.env.local scripts/limpiar-pruebas-capacitacion.mjs
//   node --env-file=.env.local scripts/limpiar-pruebas-capacitacion.mjs --borrar <id> <id> …

import { Client } from "pg";

const IDS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const BORRAR = process.argv.includes("--borrar");

// La ventana de la capacitación, en hora de Lima. Se toma con holgura por
// delante y por detrás.
const DESDE = "2026-08-24 09:25:00-05";
const HASTA = "2026-08-24 10:35:00-05";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

if (!BORRAR) {
  console.log(`Todo lo creado entre las 9:25 y las 10:35 de hoy (hora de Lima):\n`);

  const { rows: cot } = await bd.query(
    `select c.id, coalesce(c.codigo, 'sin número') codigo, c.estado, c.total, c.moneda,
            to_char(c.created_at at time zone 'America/Lima', 'HH24:MI') t,
            cu.razon_social, pf.nombre comercial
       from cotizaciones c
       join oportunidades o on o.id = c.oportunidad_id
       join cuentas cu on cu.id = o.cuenta_id
       left join perfiles pf on pf.id = o.comercial_id
      where c.created_at between $1::timestamptz
                             and $2::timestamptz
      order by c.created_at`,
    [DESDE, HASTA],
  );
  console.log(`COTIZACIONES: ${cot.length}`);
  for (const r of cot) {
    console.log(`  ${r.t}  ${r.codigo.padEnd(14)} ${r.estado.padEnd(9)} ${r.moneda} ${r.total}  ${r.razon_social} · ${r.comercial}`);
    console.log(`        id: ${r.id}`);
  }

  const { rows: act } = await bd.query(
    `select a.id, a.tipo, coalesce(a.nota, '') nota,
            to_char(a.realizada_at at time zone 'America/Lima', 'HH24:MI') t,
            cu.razon_social, pf.nombre comercial
       from actividades a
       join oportunidades o on o.id = a.oportunidad_id
       join cuentas cu on cu.id = o.cuenta_id
       left join perfiles pf on pf.id = o.comercial_id
      where a.realizada_at between $1::timestamptz
                               and $2::timestamptz
      order by a.realizada_at`,
    [DESDE, HASTA],
  );
  console.log(`\nGESTIONES: ${act.length}`);
  for (const r of act) {
    console.log(`  ${r.t}  ${String(r.tipo).padEnd(10)} ${String(r.nota).replace(/\s+/g, " ").slice(0, 46).padEnd(48)} ${r.razon_social} · ${r.comercial}`);
    console.log(`        id: ${r.id}`);
  }

  const { rows: leads } = await bd.query(
    `select l.id, coalesce(l.codigo, 'sin código') codigo, l.canal, l.estado,
            coalesce(l.nombre_contacto, '') nombre, coalesce(l.razon_social, '') empresa,
            to_char(l.recibido_at at time zone 'America/Lima', 'HH24:MI') t
       from leads l
      where l.recibido_at between $1::timestamptz
                              and $2::timestamptz
      order by l.recibido_at`,
    [DESDE, HASTA],
  );
  console.log(`\nCONTACTOS NUEVOS: ${leads.length}`);
  for (const r of leads) {
    console.log(`  ${r.t}  ${r.codigo.padEnd(12)} ${r.canal.padEnd(14)} ${r.estado.padEnd(17)} ${r.nombre} ${r.empresa}`);
    console.log(`        id: ${r.id}`);
  }

  console.log(`\n${"─".repeat(74)}`);
  console.log("Nada se borró. Para quitar lo que sea de ejemplo, pasar sus id:");
  console.log("  node --env-file=.env.local scripts/limpiar-pruebas-capacitacion.mjs --borrar <id> <id> …");
  await bd.end();
  process.exit(0);
}

if (IDS.length === 0) {
  console.error("Falta indicar qué borrar. Correr sin --borrar para ver la lista.");
  await bd.end();
  process.exit(1);
}

// Se borra por id y se dice exactamente qué se fue. Una cotización enviada no
// se toca: su número ya está comprometido con contabilidad (migración 0065).
for (const id of IDS) {
  const { rows: c } = await bd.query(
    `select codigo, estado, enviada_at from cotizaciones where id = $1`,
    [id],
  );
  if (c.length > 0) {
    if (c[0].estado !== "borrador" || c[0].enviada_at) {
      console.log(`  ✗ ${id} · ${c[0].codigo} ya salió al cliente: no se borra`);
      continue;
    }
    await bd.query(`delete from cotizaciones where id = $1`, [id]);
    console.log(`  ✓ cotización ${c[0].codigo ?? "sin número"} eliminada`);
    continue;
  }

  const { rowCount: nAct } = await bd.query(`delete from actividades where id = $1`, [id]);
  if (nAct > 0) {
    console.log(`  ✓ gestión ${id} eliminada`);
    continue;
  }

  const { rows: l } = await bd.query(`select codigo, estado from leads where id = $1`, [id]);
  if (l.length > 0) {
    const { rows: ops } = await bd.query(`select count(*)::int n from oportunidades where lead_id = $1`, [id]);
    if (ops[0].n > 0) {
      console.log(`  ✗ ${id} · ${l[0].codigo} ya tiene una oportunidad abierta: revisar a mano`);
      continue;
    }
    await bd.query(`delete from leads where id = $1`, [id]);
    console.log(`  ✓ contacto ${l[0].codigo} eliminado`);
    continue;
  }

  console.log(`  ? ${id} no corresponde a ninguna cotización, gestión ni contacto`);
}

await bd.end();
