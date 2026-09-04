// DISTRIBUIDORA COMERCIAL NOR ORIENTAL E.I.R.L. (RUC 20453325432)
//
// Pedido de Brenda (C1) el 04-09-2026: no encuentra al cliente buscando su
// RUC y pide que se lo agreguen a su cartera. El diagnóstico, antes de tocar
// nada:
//
//   · La empresa está CUATRO veces en el CRM. Una ficha con el RUC bien
//     puesto y la razón social correcta, en la cartera de Ariana (C4) desde
//     abril de 2023, con el contacto Roler Vílchez y el correo de la empresa.
//     Y tres fichas sin documento, con la razón social mal escrita
//     («COMERCCIAL»), todas de Brenda y todas creadas el mismo día por el
//     import del Excel (11-08-2026).
//   · Por eso buscar «20453325432» en su cartera no devolvía nada: sus tres
//     fichas no tienen documento, y la única que lo tiene es de otra cartera.
//   · La historia quedó repartida: una de las tres tiene tres gestiones, otra
//     una, y la tercera es la que sostiene la cotización Presu_2148-26 del
//     11-08 y el teléfono 959238030.
//
// QUÉ SE HACE. Se fusionan las cuatro en la que tiene el RUC —el RUC manda
// sobre el nombre— y la cartera queda con Brenda, que es quien tuvo la
// actividad más reciente: cotizó en agosto de 2026, mientras que el registro
// de Ariana es de abril de 2023 y no volvió a moverse. Es la misma regla que
// ya aplica `lib-fusionar-cuentas.mjs`, y la de Carlos: el cliente es del
// comercial que lo trabajó.
//
// No se pierde nada: oportunidades, gestiones, la cotización del archivo, los
// leads y los contactos se mudan a la ficha que queda. El movimiento de
// cartera se registra en `asignaciones` para que se vea quién lo decidió.

import pg from "pg";
import { fusionar, historia, ultimaActividad } from "./lib-fusionar-cuentas.mjs";

const DESTINO = "2f6220cd-341e-4093-a2af-da9cb802a5c7"; // con RUC 20453325432, hoy de Ariana (C4)
const DUPLICADAS = [
  "3e2ac376-a518-44c5-8e0e-cb84d5894b52", // sin doc · 3 gestiones
  "cccc08b6-88cd-457b-9cab-ed70d51d2812", // sin doc · 1 gestión
  "c6ae6c71-087c-49df-8502-64c29c97b45c", // sin doc · cotización 2148-26 y teléfono
];
const BRENDA = "e03cde25-7d86-4e21-8abb-08c21a279ed4";
const ARIANA = "eaf777d9-280f-4d71-98c1-b98db80bf3d7";
const SANTOS = "13064ef8-3e96-45fc-9d72-c181cac5226f"; // Gerencia Comercial, quien decide
const NOMBRE_OFICIAL = "DISTRIBUIDORA COMERCIAL NOR ORIENTAL E.I.R.L.";

const bd = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p = []) => (await bd.query(s, p)).rows;

const foto = async (titulo) => {
  console.log(`\n== ${titulo} ==`);
  console.table(
    await q(
      `select cu.id, cu.razon_social, cu.tipo_doc, cu.num_doc, p.codigo_comercial dueno,
              (select count(*) from oportunidades o where o.cuenta_id = cu.id) ops,
              (select count(*) from cotizaciones_historicas h where h.cuenta_id = cu.id) cotizaciones,
              (select count(*) from contactos k where k.cuenta_id = cu.id) contactos,
              (select count(*) from actividades a join oportunidades o on o.id = a.oportunidad_id where o.cuenta_id = cu.id) gestiones
         from cuentas cu left join perfiles p on p.id = cu.comercial_id
        where cu.id = any($1)`,
      [[DESTINO, ...DUPLICADAS]],
    ),
  );
};

await foto("ANTES");
for (const id of [DESTINO, ...DUPLICADAS]) {
  console.log(id.slice(0, 8), "última actividad:", await ultimaActividad(bd, id), JSON.stringify(await historia(bd, id)));
}

try {
  await bd.query("begin");
  for (const origen of DUPLICADAS) {
    await fusionar(bd, DESTINO, origen, { carteraId: BRENDA, nombreOficial: NOMBRE_OFICIAL });
    console.log("fusionada", origen.slice(0, 8), "→", DESTINO.slice(0, 8));
  }
  // El cambio de cartera queda registrado: Ariana la tenía desde 2023 sin
  // volver a trabajarla; Brenda la cotizó en agosto de 2026.
  await bd.query(
    `insert into asignaciones (cuenta_id, de_comercial, a_comercial, motivo, decidida_por, notas)
     values ($1, $2, $3, 'decision_gerencia', $4, $5)`,
    [
      DESTINO,
      ARIANA,
      BRENDA,
      SANTOS,
      "Brenda lo trabajó en agosto de 2026 (Presu_2148-26 del 11-08) mientras la ficha con RUC seguía en la cartera de Ariana sin movimiento desde abril de 2023. Se fusionaron las cuatro fichas del mismo RUC. Pedido de Brenda el 04-09.",
    ],
  );
  await bd.query("commit");
  console.log("\nAplicado.");
} catch (e) {
  await bd.query("rollback");
  console.error("Revertido por error:", e.message);
  process.exit(1);
}

await foto("DESPUÉS");
console.log("\n== lo que ahora ve Brenda en esa ficha ==");
console.table(await q(`select codigo, serie, fecha, monto_sin_igv, archivo from cotizaciones_historicas where cuenta_id = $1`, [DESTINO]));
console.table(await q(`select nombre, telefono, email from contactos where cuenta_id = $1`, [DESTINO]));
console.table(
  await q(
    `select a.tipo, a.realizada_at::date fecha, left(coalesce(a.nota, ''), 60) nota
       from actividades a join oportunidades o on o.id = a.oportunidad_id
      where o.cuenta_id = $1 order by a.realizada_at desc`,
    [DESTINO],
  ),
);
await bd.end();
