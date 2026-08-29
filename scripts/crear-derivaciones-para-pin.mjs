// ============================================================
// CRM EFAMEINSA · Contactos de práctica para ensayar el PIN
// ============================================================
// Pedido de Darwin el 28-08: contactos derivados de práctica para volver a
// probar la corrección con el código del supervisor, cuantas veces haga falta.
// El primero (PRO-09048) ya se usó: la corrección de LOG2 a C0 quedó hecha y
// registrada, así que hace falta munición nueva.
//
// SON CUATRO, y cada uno choca contra un candado distinto de los que antes
// hacían imposible corregir (migración 0079). Con el código del supervisor los
// cuatro tienen que pasar (migración 0113); sin código, ninguno.
//
//   1. Recién derivado, sin nada hecho ....... el caso simple.
//   2. El comercial ya registró una gestión .. «ya registró N gestión(es)».
//   3. El comercial ya envió una cotización .. «ya hizo N cotización(es)».
//   4. El cliente ya tenía otra oportunidad .. «ya tenía N oportunidad(es)».
//
// Van y vienen entre las dos cuentas de práctica —LOG2 y C0—, así que se pueden
// corregir en un sentido y en el otro sin tocar a ningún comercial de verdad.
// Todo marcado `es_prueba`: no entra en ningún reporte.
//
// OJO CON EL CÓDIGO: se quema al usarse y la ventana es de diez minutos, así
// que un mismo supervisor entrega uno cada diez minutos. Para cuatro seguidas,
// usar códigos de supervisores distintos (hay cuatro) o esperar la ventana.
//
// Es idempotente; con --rehacer borra los suyos y los vuelve a sembrar.
//
// Uso: node --env-file=.env.local scripts/crear-derivaciones-para-pin.mjs [--rehacer]

import { Client } from "pg";

const REHACER = process.argv.includes("--rehacer");
const MARCA = "ENSAYO PIN";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const uno = async (sql, p = []) => (await bd.query(sql, p)).rows[0] ?? null;

const central = await uno("select id, nombre from perfiles where rol = 'central' and not es_prueba limit 1");
const log2 = await uno("select id, nombre, codigo_comercial from perfiles where codigo_comercial = 'LOG2'");
const c0 = await uno("select id, nombre, codigo_comercial from perfiles where codigo_comercial = 'C0'");
if (!central || !log2 || !c0) {
  console.error("Falta alguna cuenta: Central real, LOG2 o C0.");
  process.exit(1);
}

if (REHACER) {
  const { rowCount } = await bd.query(`delete from leads where es_prueba and nombre_contacto like $1`, [`%${MARCA}%`]);
  await bd.query(`delete from cuentas where razon_social like $1`, [`%${MARCA}%`]);
  console.log(`Contactos de ensayo borrados: ${rowCount}`);
}

const yaHay = await uno(
  `select count(*)::int as n from leads where es_prueba and estado = 'asignado' and nombre_contacto like $1`,
  [`%${MARCA}%`],
);
if (yaHay.n > 0 && !REHACER) {
  console.log(`Ya hay ${yaHay.n} contacto(s) de ensayo sin usar. Con --rehacer se rehacen los cuatro.`);
  await bd.end();
  process.exit(0);
}

const equipo = await uno(
  `select p.id, p.nombre, (select precio from precios_producto x where x.producto_id = p.id and x.vigente_hasta is null) precio
     from productos p where p.sku = 'LAVMA17'`,
);

/** Siembra un contacto derivado, con lo que haga falta para chocar su candado. */
async function sembrar({ n, cliente, ruc, de, a, gestion, cotizacion, oportunidadPrevia, choca }) {
  const cuenta = await uno(
    `insert into cuentas (razon_social, tipo_doc, num_doc, comercial_id, cartera_desde, direccion)
     values ($1, 'RUC', $2, $3, current_date, 'Av. de Prueba 123, Lima') returning id`,
    [`${cliente} (${MARCA} ${n})`, ruc, de.id],
  );

  // Una oportunidad anterior del mismo cliente: eso solo ya bloqueaba la
  // corrección antes de la 0113.
  if (oportunidadPrevia) {
    // Cerrada y con motivo: la base exige el motivo para dar algo por rechazado.
    await bd.query(
      `insert into oportunidades (cuenta_id, comercial_id, etapa, origen, motivo_rechazo_id, cerrada_at)
       values ($1, $2, 'rechazada', 'crm', 4, now() - interval '20 days')`,
      [cuenta.id, de.id],
    );
  }

  const lead = await uno(
    `insert into leads (canal, nombre_contacto, razon_social, telefono, email, mensaje,
                        estado, asignado_a, asignado_por, asignado_at, recibido_at, recibido_por, cuenta_id, es_prueba)
     values ('llamada', $1, $2, $3, 'ensayo@efameinsa.com', $4,
             'asignado', $5, $6, now(), now(), $6, $7, true)
     returning id, codigo`,
    [
      `Contacto ${MARCA} ${n}`,
      `${cliente} (${MARCA} ${n})`,
      `999 000 11${n}`,
      `Contacto de ensayo ${n}: sirve para probar la corrección con el código del supervisor.`,
      de.id,
      central.id,
      cuenta.id,
    ],
  );

  const op = await uno(
    `insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa, origen)
     values ($1, $2, $3, $4, 'crm') returning id`,
    [cuenta.id, lead.id, de.id, cotizacion ? "cotizada" : "asignada"],
  );

  if (gestion) {
    await bd.query(
      `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at, proxima_accion, proxima_accion_at)
       values ($1, 'llamada', 'Gestión de ensayo: existe para que la corrección tenga que pasar por la autorización.', $2, now(), 'Enviar la cotización', current_date + 1)`,
      [op.id, de.id],
    );
  }

  if (cotizacion && equipo) {
    const cot = await uno(
      `insert into cotizaciones (oportunidad_id, serie, codigo, estado, estado_aprobacion, subtotal, total, moneda,
                                 creada_por, enviada_at, vigencia_dias)
       values ($1, 'EFAMEINSA', $2, 'enviada', 'auto_aprobada', $3, $4, 'USD', $5, now(), 15) returning id`,
      [op.id, `Presu_ENS${n}-26`, equipo.precio, Math.round(Number(equipo.precio) * 1.18 * 100) / 100, de.id],
    );
    await bd.query(
      `insert into cotizacion_items (cotizacion_id, producto_id, cantidad, precio_unitario, aprobado, descripcion)
       values ($1, $2, 1, $3, true, $4)`,
      [cot.id, equipo.id, equipo.precio, equipo.nombre],
    );
  }

  console.log(
    `   ${lead.codigo.padEnd(11)} ${de.codigo_comercial} → ${a.codigo_comercial.padEnd(5)} ${choca}`,
  );
  return lead;
}

await bd.query("begin");
try {
  console.log("Contactos de ensayo para el PIN (todos de práctica):\n");
  await sembrar({
    n: 1, cliente: "LAVANDERÍA UNO", ruc: "20000000201", de: log2, a: c0,
    choca: "recién derivado, sin nada hecho",
  });
  await sembrar({
    n: 2, cliente: "HOTEL DOS", ruc: "20000000202", de: log2, a: c0, gestion: true,
    choca: "el comercial ya registró una gestión",
  });
  await sembrar({
    n: 3, cliente: "TEXTIL TRES", ruc: "20000000203", de: c0, a: log2, cotizacion: true,
    choca: "el comercial ya envió una cotización",
  });
  await sembrar({
    n: 4, cliente: "CLÍNICA CUATRO", ruc: "20000000204", de: c0, a: log2, oportunidadPrevia: true,
    choca: "el cliente ya tenía otra oportunidad",
  });

  await bd.query("commit");
  console.log("\n✓ Los cuatro están en «Lo que derivé» de Central, con el distintivo PRÁCTICA.");
  console.log("   Sin código no entra ninguno; con el código del supervisor, los cuatro.");
  console.log("   El código se quema: uno por corrección. Cada supervisor entrega uno cada 10 minutos.");
  console.log("\nPara ver los códigos: node --env-file=.env.local scripts/_pin-supervisor-ahora.mjs <nombre>");
  console.log("Para auditar después: node --env-file=.env.local scripts/_auditar-correccion-derivacion.mjs");
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}
await bd.end();
