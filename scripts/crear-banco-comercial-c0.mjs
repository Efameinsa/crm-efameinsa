// ============================================================
// CRM EFAMEINSA · El banco de pruebas del lado comercial (C0)
// ============================================================
// Pedido de Darwin el 28-08: poder recorrer TODO el circuito del comercial sin
// tocar nada real. La cuenta C0 ya tenía clientes, ventas y borradores, pero le
// faltaba justo lo que hace falta para auditar de punta a punta:
//
//   · nada en «Seguimiento» ni en «Potencial» — dos columnas del tablero salían
//     vacías;
//   · ninguna oportunidad con fecha de cierre — el cuadro «Mis potenciales de
//     la semana» no tenía nada que mostrar, ni siquiera para ver la sección de
//     las proyectadas para otra fecha;
//   · ninguna cotización esperando el visto bueno de gerencia — sin eso no se
//     puede ensayar la aprobación ni el aviso que le llega al comercial;
//   · ninguna enviada sin respuesta, ni ninguna rechazada con motivo.
//
// Todo cuelga de C0, que está marcada `es_prueba`: no entra en reportes, ni en
// el resumen de gerencia, ni en la supervisión diaria. Los clientes llevan
// «(PRÁCTICA)» en el nombre y RUC inventado. Las cotizaciones NO consumen
// correlativo real: van con código «Presu_PR#-26», que no existe en la serie.
//
// Es idempotente: si ya sembró, no duplica. Con --rehacer borra lo suyo y lo
// vuelve a crear.
//
// Uso: node --env-file=.env.local scripts/crear-banco-comercial-c0.mjs [--rehacer]

import { Client } from "pg";

const REHACER = process.argv.includes("--rehacer");
const MARCA = "(PRÁCTICA)";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const uno = async (sql, p = []) => (await bd.query(sql, p)).rows[0] ?? null;

const c0 = await uno("select id, nombre from perfiles where codigo_comercial = 'C0'");
if (!c0) {
  console.error("No existe la cuenta C0. Córrala primero: scripts/crear-cuenta-pruebas-c0.mjs");
  process.exit(1);
}

/** Los equipos con los que se arman las cotizaciones de práctica. */
const equipos = (
  await bd.query(
    `select p.id, p.sku, p.nombre,
            (select precio from precios_producto x where x.producto_id = p.id and x.vigente_hasta is null) as precio
       from productos p where p.sku = any($1)`,
    [["LAVMA17", "SECMAX15", "SECU752", "CO402G"]],
  )
).rows;
const equipo = (sku) => equipos.find((e) => e.sku === sku);

const lunes = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
const dia = (n) => {
  const d = new Date(lunes);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoyISO = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })).toISOString().slice(0, 10);

if (REHACER) {
  const { rowCount } = await bd.query(`delete from cuentas where razon_social like $1`, [`%${MARCA}%`]);
  console.log(`Clientes de práctica borrados: ${rowCount}`);
}

const yaHay = await uno(`select count(*)::int as n from cuentas where razon_social like $1`, [`%${MARCA}%`]);
if (yaHay.n > 0 && !REHACER) {
  console.log(`Ya hay ${yaHay.n} cliente(s) de práctica sembrados. Con --rehacer se rehacen.`);
  await bd.end();
  process.exit(0);
}

/** Un caso completo: cliente + oportunidad (+ cotización, si se pide). */
async function sembrar(caso) {
  const cuenta = await uno(
    `insert into cuentas (razon_social, tipo_doc, num_doc, comercial_id, cartera_desde, direccion)
     values ($1, 'RUC', $2, $3, current_date, 'Av. de Prueba 123, Lima') returning id`,
    [`${caso.cliente} ${MARCA}`, caso.ruc, c0.id],
  );
  const op = await uno(
    `insert into oportunidades (cuenta_id, comercial_id, etapa, origen, intencion, monto_estimado, moneda,
                                cierre_proyectado, proxima_accion, proxima_accion_at, motivo_rechazo_id, cerrada_at)
     values ($1, $2, $3, 'crm', $4, $5, 'USD', $6, $7, $8, $9, $10) returning id`,
    [
      cuenta.id,
      c0.id,
      caso.etapa,
      caso.intencion ?? "medio",
      caso.monto ?? null,
      caso.cierre ?? null,
      caso.accion ?? null,
      caso.accionAt ?? null,
      caso.motivoRechazo ?? null,
      caso.etapa === "rechazada" ? new Date().toISOString() : null,
    ],
  );
  if (caso.gestion) {
    await bd.query(
      `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at, proxima_accion, proxima_accion_at)
       values ($1, 'llamada', $2, $3, now() - interval '1 day', $4, $5)`,
      [op.id, caso.gestion, c0.id, caso.accion, caso.accionAt],
    );
  }
  if (caso.cotizacion) {
    const items = caso.cotizacion.items.map((i) => ({ ...i, eq: equipo(i.sku) })).filter((i) => i.eq);
    const subtotal = items.reduce((s, i) => s + Number(i.eq.precio ?? 0) * i.cantidad, 0);
    const cot = await uno(
      `insert into cotizaciones (oportunidad_id, serie, codigo, estado, estado_aprobacion, subtotal, total, moneda,
                                 creada_por, enviada_at, vigencia_dias)
       values ($1, 'EFAMEINSA', $2, $3, $4, $5, $6, 'USD', $7, $8, 15) returning id`,
      [
        op.id,
        caso.cotizacion.codigo ?? null,
        caso.cotizacion.estado,
        caso.cotizacion.aprobacion,
        subtotal,
        Math.round(subtotal * 1.18 * 100) / 100,
        c0.id,
        caso.cotizacion.enviada ? new Date().toISOString() : null,
      ],
    );
    for (const i of items) {
      await bd.query(
        // `subtotal` es columna calculada por la base: no se inserta.
        `insert into cotizacion_items (cotizacion_id, producto_id, cantidad, precio_unitario,
                                       requiere_aprobacion, aprobado, descripcion)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          cot.id,
          i.eq.id,
          i.cantidad,
          i.precio ?? i.eq.precio,
          Boolean(i.requiereAprobacion),
          i.requiereAprobacion ? null : true,
          i.eq.nombre,
        ],
      );
    }
  }
  console.log(`   · ${caso.cliente.padEnd(28)} ${caso.etapa.padEnd(12)} ${caso.para}`);
}

await bd.query("begin");
try {
  console.log("Sembrando el banco de pruebas del comercial C0:\n");

  await sembrar({
    cliente: "LAVANDERÍA SEGUIMIENTO",
    ruc: "20000000021",
    etapa: "seguimiento",
    monto: 8500,
    accion: "Llamar para confirmar la recepción",
    accionAt: hoyISO,
    gestion: "Se envió la cotización y quedó en revisarla con su socio.",
    para: "«Mi día» de hoy y la columna Seguimiento del tablero",
    cotizacion: {
      codigo: "Presu_PR1-26",
      estado: "enviada",
      aprobacion: "auto_aprobada",
      enviada: true,
      items: [{ sku: "LAVMA17", cantidad: 1 }],
    },
  });

  await sembrar({
    cliente: "HOTEL POTENCIAL ESTA SEMANA",
    ruc: "20000000039",
    etapa: "potencial",
    intencion: "alto_potencial",
    monto: 15100,
    cierre: dia(4),
    accion: "Confirmar el depósito",
    accionAt: dia(4),
    gestion: "Pidió la factura para tramitar el pago; cierra esta semana.",
    para: "cuadro «Mis potenciales» — columna del viernes",
    cotizacion: {
      codigo: "Presu_PR2-26",
      estado: "enviada",
      aprobacion: "auto_aprobada",
      enviada: true,
      items: [
        { sku: "SECMAX15", cantidad: 1 },
        { sku: "LAVMA17", cantidad: 3 },
      ],
    },
  });

  await sembrar({
    cliente: "TEXTIL POTENCIAL OTRA FECHA",
    ruc: "20000000047",
    etapa: "potencial",
    intencion: "alto_potencial",
    monto: 11950,
    cierre: dia(9),
    accion: "Volver a llamar la próxima semana",
    accionAt: dia(9),
    para: "sección «proyectadas para otra fecha» (lo que antes se escondía)",
    cotizacion: {
      codigo: "Presu_PR3-26",
      estado: "enviada",
      aprobacion: "auto_aprobada",
      enviada: true,
      items: [{ sku: "SECU752", cantidad: 1 }],
    },
  });

  await sembrar({
    cliente: "CLÍNICA ESPERA APROBACIÓN",
    ruc: "20000000055",
    etapa: "cotizada",
    monto: 3400,
    accion: "Avisar en cuanto gerencia apruebe",
    accionAt: hoyISO,
    para: "bandeja de aprobaciones de gerencia + aviso al comercial",
    cotizacion: {
      // Borrador con un ítem por debajo de lista: espera el visto bueno.
      estado: "borrador",
      aprobacion: "pendiente_gerencia",
      enviada: false,
      items: [{ sku: "SECMAX15", cantidad: 1, precio: 2600, requiereAprobacion: true }],
    },
  });

  await sembrar({
    cliente: "COMERCIO RECHAZADO",
    ruc: "20000000063",
    etapa: "rechazada",
    motivoRechazo: 2,
    monto: 6200,
    gestion: "Le pareció caro frente a otra marca; se pierde por precio.",
    para: "embudo y reporte de rechazos, con su motivo",
  });

  await sembrar({
    cliente: "PANADERÍA VENCIDA",
    ruc: "20000000071",
    etapa: "seguimiento",
    monto: 4100,
    accion: "Reintentar la llamada — quedó pendiente",
    accionAt: dia(-3),
    gestion: "No contestó dos veces; se vuelve a intentar.",
    para: "«Mi día»: lo vencido, en rojo",
  });

  await bd.query("commit");
  console.log("\n✓ Listo. Entre como C0 (comercial0@gmail.com) y recorra:");
  console.log("   · Mi día ............ una acción de hoy y una vencida");
  console.log("   · Oportunidades ..... Seguimiento, Potencial, Cotizada y una Rechazada con motivo");
  console.log("   · Mis potenciales ... una para el viernes y otra fuera de la semana");
  console.log("   · Mis cotizaciones .. tres enviadas y una esperando a gerencia");
  console.log("\nY desde gerencia: la cotización de CLÍNICA ESPERA APROBACIÓN espera su visto bueno.");
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}
await bd.end();
