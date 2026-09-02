// ============================================================
// CRM EFAMEINSA · Un contacto de práctica para ensayar la corrección
// ============================================================
// Pedido de Darwin el 28-08: poder entrar con la cuenta de Central, corregir
// una derivación hacia el comercial de pruebas (C0) y ver cómo le llega, sin
// manchar nada.
//
// QUÉ DEJA, todo marcado como práctica (`leads.es_prueba`), que es lo que lo
// mantiene fuera de los reportes, del resumen de gerencia y de la lista de
// todos los días de Central:
//
//   · Una cuenta inventada, con RUC que no existe en SUNAT.
//   · Un contacto DERIVADO al comercial de práctica LOG2, con su oportunidad.
//   · Una gestión registrada por ese comercial — a propósito: es justo lo que
//     antes hacía imposible corregir («ese comercial ya registró 1 gestión»).
//     Así el ensayo prueba de verdad el camino que se arregló hoy (0113).
//
// CÓMO SE VE: la lista de Central lo muestra solo pidiéndolo,
//   https://crm.efameinsa.com/central/derivados?practica=1
// y ahí el diálogo de corregir ofrece a «C0 · Comercial de pruebas», que en una
// derivación real no aparece.
//
// Es idempotente: si el contacto de práctica ya existe y sigue sin corregirse,
// no crea otro. Con --rehacer lo borra y lo vuelve a sembrar.
//
// Uso:
//   node --env-file=.env.local scripts/crear-derivacion-de-practica.mjs [--rehacer]

import { Client } from "pg";

const REHACER = process.argv.includes("--rehacer");
const MARCA = "(PRÁCTICA CORRECCIÓN)";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const uno = async (sql, params = []) => (await bd.query(sql, params)).rows[0] ?? null;

const central = await uno("select id, nombre from perfiles where rol = 'central' and not es_prueba limit 1");
const origen = await uno(
  "select id, nombre, codigo_comercial from perfiles where codigo_comercial = 'LOG2' and rol = 'comercial'",
);
const destino = await uno(
  "select id, nombre, codigo_comercial from perfiles where codigo_comercial = 'C0' and rol = 'comercial'",
);
if (!central || !origen || !destino) {
  console.error("Falta alguna cuenta: Central real, LOG2 o C0.");
  process.exit(1);
}

if (REHACER) {
  const { rowCount } = await bd.query(
    `delete from leads where es_prueba and nombre_contacto like $1`,
    [`%${MARCA}%`],
  );
  console.log(`Contactos de práctica borrados: ${rowCount}`);
}

const yaEsta = await uno(
  `select l.id, l.codigo, p.codigo_comercial as en_manos_de
     from leads l left join perfiles p on p.id = l.asignado_a
    where l.es_prueba and l.nombre_contacto like $1 and l.estado = 'asignado'
    order by l.created_at desc limit 1`,
  [`%${MARCA}%`],
);
if (yaEsta && yaEsta.en_manos_de !== destino.codigo_comercial) {
  console.log(`Ya hay un contacto de práctica listo: ${yaEsta.codigo} · en manos de ${yaEsta.en_manos_de}`);
  console.log("Con --rehacer se borra y se siembra otro.");
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  // 1 · El cliente inventado. RUC con dígito verificador válido pero que no
  //     existe: si alguien lo busca en SUNAT, no aparece.
  const cuenta = await uno(
    `insert into cuentas (razon_social, tipo_doc, num_doc, comercial_id, cartera_desde, direccion)
     values ($1, 'RUC', $2, $3, current_date, 'Av. de Prueba 123, Lima')
     on conflict (num_doc) where num_doc is not null and tipo_doc = 'RUC' and cuenta_padre_id is null
       do update set razon_social = excluded.razon_social, comercial_id = excluded.comercial_id
     returning id, razon_social`,
    [`LAVANDERÍA DEMO ${MARCA}`, "20000000012", origen.id],
  );

  // 2 · El contacto, ya derivado al comercial de práctica LOG2.
  const lead = await uno(
    `insert into leads (
       canal, nombre_contacto, razon_social, telefono, email, mensaje,
       estado, asignado_a, asignado_por, asignado_at, recibido_at, recibido_por,
       cuenta_id, es_prueba
     ) values (
       'llamada', $1, $2, '999 000 111', 'practica@efameinsa.com',
       'Consulta de práctica: quiere una lavadora de 25 kg. Sirve para ensayar la corrección de derivación.',
       'asignado', $3, $4, now(), now(), $4, $5, true
     ) returning id, codigo`,
    [`Sra. Ensayo ${MARCA}`, `LAVANDERÍA DEMO ${MARCA}`, origen.id, central.id, cuenta.id],
  );

  // 3 · Su oportunidad, en manos del mismo comercial.
  const oportunidad = await uno(
    `insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa, origen)
     values ($1, $2, $3, 'asignada', 'crm')
     returning id`,
    [cuenta.id, lead.id, origen.id],
  );

  // 4 · Y una gestión suya: es la que antes bloqueaba la corrección.
  await bd.query(
    `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at, proxima_accion, proxima_accion_at)
     values ($1, 'llamada', 'Gestión de práctica: se llamó al cliente. Existe a propósito, para que la corrección tenga que pasar por la autorización del supervisor.', $2, now(), 'Enviar la cotización', current_date + 1)`,
    [oportunidad.id, origen.id],
  );

  await bd.query("commit");
  console.log(`\n✓ Contacto de práctica listo: ${lead.codigo}`);
  console.log(`   Cliente ....... ${cuenta.razon_social}`);
  console.log(`   Ahora está con  ${origen.codigo_comercial} · ${origen.nombre}`);
  console.log(`   Hay que pasarlo a ${destino.codigo_comercial} · ${destino.nombre}`);
  console.log(`\nEntre con la cuenta de Central a:`);
  console.log(`   /central/derivados?practica=1   →  «Corregir derivación» en la tarjeta de ${lead.codigo}`);
  console.log(`Y para auditar desde gerencia, después de corregirla:`);
  console.log(`   node --env-file=.env.local scripts/_auditar-correccion-derivacion.mjs`);
} catch (e) {
  await bd.query("rollback");
  console.error("Se deshizo todo:", e.message);
  process.exitCode = 1;
}
await bd.end();
