// ============================================================
// CRM EFAMEINSA · «CORDOVA VENTURO LUIS HARRY» estaba dos veces (y era el pedazo que faltaba)
// ============================================================
// Ariana, 10-09, con las dos fichas abiertas: «Aquí es lo mismo, no entiendo
// por qué están separados». Santos, 11-09: «júntalos».
//
// Las dos nacieron el mismo segundo (22-08 18:31, corrida «Actualización
// 22-08» del Excel de C4) y guardan LA MISMA llamada del 19-08 palabra por
// palabra. La diferencia es la hoja: en COTIZ. la fila iba a nombre de la
// persona con su RUC 10; en PROSP., a nombre de «SERVICIOS MEDICOS SAN CARLOS
// E.I.R.L.» sin documento. El importador identifica por documento y, si no
// hay, por nombre: dos nombres y un solo RUC son dos clientes para él, y como
// las dos eran nuevas en la misma corrida, el cruce por teléfono (929 552 308,
// el mismo en las dos) no llegó a compararlas. A este señor ya se le había
// unido una tercera ficha el 09-09; esta es la que quedó.
//
// QUEDA LA DEL RUC 10062373763 (regla de la casa: el RUC manda) y el nombre
// de la EIRL se guarda como nombre comercial: si algún día la compra se
// factura a la EIRL, ahí se le pone su RUC 20 real. La cartera no se mueve:
// las dos son de C4.
//
// DE PASO: la cotización 443-26 del 19-08 salió a nombre de él y está suelta
// en el archivo (sin cliente). Se amarra a la ficha que queda. La 2172-26 NO:
// dice «Córdova Venturo» pero su PDF es de BAHIA CAMANA E.I.R.L. (el Word
// reciclado como plantilla), y ese es otro arreglo.
//
// Uso:
//   node --env-file=.env.local scripts/fusionar-cordova-venturo.mjs
//   node --env-file=.env.local scripts/fusionar-cordova-venturo.mjs --aplicar

import { Client } from "pg";
import { fusionar, historia } from "./lib-fusionar-cuentas.mjs";

const APLICAR = process.argv.includes("--aplicar");
const DESTINO = "1de4ea5f-6fc3-4b0e-9776-bb952d48e1a2"; // CORDOVA VENTURO LUIS HARRY · RUC 10062373763
const ORIGEN = "78d847f3-ecc3-4685-a699-35ef7fffa1ee"; // SERVICIOS MEDICOS SAN CARLOS EIRL · sin RUC

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(
  `select cu.id, cu.razon_social, cu.num_doc, cu.comercial_id, p.codigo_comercial codigo
     from cuentas cu left join perfiles p on p.id = cu.comercial_id where cu.id in ($1, $2)`,
  [DESTINO, ORIGEN],
);
const destino = rows.find((r) => r.id === DESTINO);
const origen = rows.find((r) => r.id === ORIGEN);
if (!destino || !origen) {
  console.log("ABORTA: alguna de las dos fichas ya no existe (¿ya se fusionó?).");
  await bd.end();
  process.exit(1);
}
if (destino.num_doc !== "10062373763" || origen.num_doc) {
  console.log("ABORTA: los documentos no son los esperados — revisar a mano.", { destino: destino.num_doc, origen: origen.num_doc });
  await bd.end();
  process.exit(1);
}
if (destino.comercial_id !== origen.comercial_id) {
  console.log("ABORTA: no son de la misma cartera; eso lo decide gerencia.", { destino: destino.codigo, origen: origen.codigo });
  await bd.end();
  process.exit(1);
}

console.log("QUEDA:\n  " + destino.razon_social + " · RUC " + destino.num_doc + " · " + destino.codigo);
console.log("  " + JSON.stringify(await historia(bd, DESTINO)));
console.log("\nSE FUSIONA Y DESAPARECE (queda como nombre comercial):\n  " + origen.razon_social + " · sin RUC · " + origen.codigo);
console.log("  " + JSON.stringify(await historia(bd, ORIGEN)));

const { rows: sueltas } = await bd.query(
  `select id, codigo, cliente, archivo from cotizaciones_historicas
    where codigo = '443-26' and cuenta_id is null and cliente ilike 'CORDOVA VENTURO%'`,
);
console.log(`\nCotización suelta que se amarra a la ficha: ${sueltas.map((s) => s.codigo + " (" + s.archivo + ")").join(", ") || "ninguna"}`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN — no se escribió nada. Para aplicarlo: --aplicar\n");
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  await fusionar(bd, DESTINO, ORIGEN, { carteraId: destino.comercial_id, nombreOficial: destino.razon_social });
  const amarradas = await bd.query(
    `update cotizaciones_historicas set cuenta_id = $1
      where codigo = '443-26' and cuenta_id is null and cliente ilike 'CORDOVA VENTURO%'`,
    [DESTINO],
  );
  await bd.query("commit");
  console.log(`\n✓ Fusionada. Cotizaciones amarradas: ${amarradas.rowCount}`);
} catch (e) {
  await bd.query("rollback");
  console.log(`\nSE REVIRTIÓ TODO — ${e.message}`);
  await bd.end();
  process.exit(1);
}

const { rows: [final] } = await bd.query(
  `select cu.razon_social, cu.nombre_comercial, cu.num_doc, p.codigo_comercial duenio,
          (select count(*) from oportunidades o where o.cuenta_id=cu.id)::int expedientes,
          (select count(*) from contactos ct where ct.cuenta_id=cu.id)::int contactos,
          (select count(*) from cotizaciones_historicas ch where ch.cuenta_id=cu.id)::int cotiz_archivo,
          (select count(*) from actividades a join oportunidades o2 on o2.id=a.oportunidad_id where o2.cuenta_id=cu.id)::int gestiones
     from cuentas cu left join perfiles p on p.id = cu.comercial_id where cu.id = $1`,
  [DESTINO],
);
console.log("\nCómo quedó la ficha única:");
console.table([final]);
console.log(`Ficha: /comercial/cartera/${DESTINO}`);
await bd.end();
