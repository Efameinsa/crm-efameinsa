// Un cliente potencial de mentira para la cuenta de práctica.
//
// PARA QUÉ. Las cuentas de práctica (`comercial0@gmail.com`, `central0@`,
// `postventa2@`) sirven para capacitar y para probar sin ensuciar los reportes
// —`perfiles.es_prueba` deja fuera todo lo que hagan—, pero la de comercial
// estaba VACÍA: sin un cliente asignado no se puede cotizar, y sin cotizar no
// se puede probar nada de lo que viene después (confirmar, corregir, cerrar).
//
// Esto le pone uno. Se puede correr las veces que haga falta: si el prospecto
// ya existe, lo dice y no duplica nada.
//
// LO QUE HACE QUE SEA DE MENTIRA, y que se note:
//   · el lead va con `es_prueba` = true, que es lo que lo saca de los reportes
//     de gerencia y del maestro de Central (migración 0072);
//   · queda asignado a un comercial que también es de práctica, así que todo
//     lo que cuelgue de él tampoco cuenta;
//   · la razón social lleva «(PRÁCTICA)» delante para que nadie lo confunda
//     mirando una lista, y el RUC es uno imposible (20999999999).
//
//   node --env-file=.env.local scripts/crear-prospecto-de-practica.mjs
//   node --env-file=.env.local scripts/crear-prospecto-de-practica.mjs --borrar
import { Client } from "pg";

const CORREO = "comercial0@gmail.com";
const RUC = "20999999999";
const RAZON = "(PRÁCTICA) LAVANDERÍA SAN MARTÍN S.A.C.";
const borrar = process.argv.includes("--borrar");

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const { rows: perfil } = await pg.query(
  `select p.id, p.nombre, p.es_prueba
     from perfiles p join auth.users u on u.id = p.id
    where u.email = $1`,
  [CORREO],
);
if (perfil.length === 0) throw new Error(`No existe la cuenta ${CORREO}`);
if (!perfil[0].es_prueba) {
  // El aislamiento entero cuelga de esta bandera: sin ella, lo que se haga
  // practicando entra en los reportes de gerencia.
  throw new Error(`${CORREO} NO está marcada como cuenta de práctica: no se le cuelga nada de mentira`);
}
const comercial = perfil[0];

const { rows: yaEsta } = await pg.query(`select id from cuentas where num_doc = $1`, [RUC]);

if (borrar) {
  if (yaEsta.length === 0) {
    console.log("No había nada que borrar.");
  } else {
    const cuenta = yaEsta[0].id;
    const { rows: cots } = await pg.query(
      `select c.codigo from cotizaciones c join oportunidades o on o.id = c.oportunidad_id
        where o.cuenta_id = $1 and c.correlativo is not null`,
      [cuenta],
    );
    if (cots.length > 0) {
      // Una cotización emitida gastó un número de la serie real: borrarla deja
      // un hueco que la contadora ve. Se avisa y no se borra sola.
      console.log(
        `⚠ Este prospecto tiene ${cots.length} cotización(es) YA NUMERADA(S): ${cots.map((c) => c.codigo).join(", ")}.`,
      );
      console.log("  Borrarlo dejaría esos números sin documento. Decidan qué hacer antes de seguir.");
      await pg.end();
      process.exit(1);
    }
    await pg.query("begin");
    await pg.query(`delete from leads where cuenta_id = $1`, [cuenta]);
    await pg.query(
      `delete from cotizacion_items where cotizacion_id in
         (select c.id from cotizaciones c join oportunidades o on o.id = c.oportunidad_id where o.cuenta_id = $1)`,
      [cuenta],
    );
    await pg.query(
      `delete from cotizaciones where oportunidad_id in (select id from oportunidades where cuenta_id = $1)`,
      [cuenta],
    );
    await pg.query(`delete from oportunidades where cuenta_id = $1`, [cuenta]);
    await pg.query(`delete from contactos where cuenta_id = $1`, [cuenta]);
    await pg.query(`delete from cuentas where id = $1`, [cuenta]);
    await pg.query("commit");
    console.log("Prospecto de práctica borrado.");
  }
  await pg.end();
  process.exit(0);
}

if (yaEsta.length > 0) {
  const { rows: op } = await pg.query(
    `select o.id, o.etapa::text from oportunidades o where o.cuenta_id = $1 order by o.created_at limit 1`,
    [yaEsta[0].id],
  );
  console.log(`Ya existía. ${RAZON}`);
  if (op.length > 0) {
    console.log(`  Oportunidad: ${op[0].id} (${op[0].etapa})`);
    console.log(`  Cotizar:     /comercial/oportunidades/${op[0].id}/cotizar`);
  }
  await pg.end();
  process.exit(0);
}

await pg.query("begin");
try {
  const { rows: cuenta } = await pg.query(
    `insert into cuentas (tipo_doc, num_doc, razon_social, direccion)
     values ('RUC', $1, $2, $3) returning id`,
    [RUC, RAZON, "Av. de Prácticas 123, Ate, Lima"],
  );
  const cuentaId = cuenta[0].id;

  await pg.query(
    `insert into contactos (cuenta_id, nombre, cargo, telefono, email, es_principal)
     values ($1, $2, $3, $4, $5, true)`,
    [cuentaId, "Rosa Quispe (contacto de práctica)", "Jefa de operaciones", "999888777", "practica@example.com"],
  );

  // El lead es la parte que de verdad lleva la marca de prueba: es la columna
  // que miran los reportes para dejarlo fuera.
  const { rows: lead } = await pg.query(
    `insert into leads (
       estado, area_destino, canal, fuente, nombre_contacto, telefono, email,
       num_doc, razon_social, mensaje, cuenta_id, asignado_a, asignado_at, es_prueba)
     values ('asignado', 'comercial', 'formulario_web', 'práctica', $1, $2, $3,
             $4, $5, $6, $7, $8, now(), true)
     returning id`,
    [
      "Rosa Quispe (contacto de práctica)",
      "999888777",
      "practica@example.com",
      RUC,
      RAZON,
      "PRUEBA — Necesito cotizar una lavadora y una secadora industriales de 25 kg para una lavandería nueva en Ate. La lavadora la quiero APILABLE.",
      cuentaId,
      comercial.id,
    ],
  );

  // La oportunidad cuelga del lead: de ahí sale «Lo que pidió el cliente», que
  // es lo que el comercial relee mientras cotiza. Sin `lead_id` la ficha sale
  // muda y la práctica pierde la mitad de la gracia.
  const { rows: op } = await pg.query(
    `insert into oportunidades (cuenta_id, comercial_id, lead_id, etapa, intencion, moneda, origen)
     values ($1, $2, $3, 'asignada', 'medio', 'USD', 'crm') returning id`,
    [cuentaId, comercial.id, lead[0].id],
  );

  await pg.query("commit");
  console.log(`\nListo. ${RAZON}`);
  console.log(`  RUC:         ${RUC}`);
  console.log(`  Comercial:   ${comercial.nombre} (${CORREO})`);
  console.log(`  Oportunidad: ${op[0].id}`);
  console.log(`\n  Entrar a cotizar:`);
  console.log(`  https://crm.efameinsa.com/comercial/oportunidades/${op[0].id}/cotizar\n`);
} catch (e) {
  await pg.query("rollback");
  throw e;
} finally {
  await pg.end();
}
