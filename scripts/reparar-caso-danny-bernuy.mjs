// ============================================================
// Reparación del 01-09: el caso de DANNY BERNUY quedó archivado en la ficha
// equivocada, y esa ficha además tenía el nombre roto.
// ============================================================
// QUÉ PASÓ. El contacto PRO-09093 entró como «DANNY BERNUY · PERUVIAN NATURE ·
// 985 290 984», sin RUC. `asignar_lead` busca la ficha del cliente por
// documento o por TELÉFONO, y ese teléfono figuraba en la ficha de LOGISMINSA
// —cargado ahí el 27-08 junto con el contacto «KAREN VIERA»—, así que el caso
// de garantía se archivó bajo LOGISMINSA: otro RUC, otro cliente y otra
// máquina. Postventa recibió el aviso «DANNY BERNUY está esperando» y al
// abrirlo veía LOGISMINSA.
//
// DE QUIÉN ES EL TELÉFONO. De Danny Bernuy, sin duda: cuatro contactos entre
// 2024 y 2026 (PRO4131-24, PRO7912-25, PRO11323-26, PRO11712-26) llegaron con
// ese mismo número diciendo PERUVIAN NATURE S & S S.A.C. Y la avería que
// describe —la puerta que vuelve a fallar, error OF ED32— es de una lavadora:
// PERUVIAN NATURE tiene una UNIMAC UW065; LOGISMINSA tiene una secadora.
//
// EL NOMBRE ROTO. La razón social de LOGISMINSA quedó como
// «LOGISTIC LOGISTIC INDUSTRY & MINING … - LOGISMINSA S.A. & MINING … -
// LOGISMINSA S.A.»: es el nombre bueno con la palabra INDUSTRY reemplazada por
// el nombre entero. Doble clic sobre esa palabra —que la selecciona— y pegar
// encima. Pasó el 28-08 al corregir los datos del cliente.
//
// Se corre una sola vez. Deja respaldo del estado anterior en
// scripts/data/_reparacion-danny-0109.json.

import { writeFileSync } from "node:fs";
import { Client } from "pg";

const LOGISMINSA = "503018d3-6cec-4d64-baee-b33daccd9e58";
const PERUVIAN_NATURE = "8b641a10-4a63-4efe-8ac8-d4c3a861d661";
const CONTACTO_KAREN = "bd71b772-26f5-4466-96e1-4409bfc2f72f";
const LEAD = "327b4fa4-b687-4501-ae0e-cf970afbded8";
const OPORTUNIDAD = "17d67bd7-be1c-4939-8e49-b9713f6e5df6";
const NOMBRE_BUENO = "LOGISTIC INDUSTRY & MINING SOCIEDAD ANONIMA - LOGISMINSA S.A.";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const antes = {
  cuenta: (await bd.query(`select id, razon_social, num_doc from cuentas where id=$1`, [LOGISMINSA])).rows[0],
  contacto: (await bd.query(`select id, nombre, telefono from contactos where id=$1`, [CONTACTO_KAREN])).rows[0],
  lead: (await bd.query(`select id, codigo, cuenta_id from leads where id=$1`, [LEAD])).rows[0],
  oportunidad: (await bd.query(`select id, cuenta_id from oportunidades where id=$1`, [OPORTUNIDAD])).rows[0],
  atenciones: (await bd.query(`select id, cuenta_id from atenciones where oportunidad_id=$1`, [OPORTUNIDAD])).rows,
};
writeFileSync("scripts/data/_reparacion-danny-0109.json", JSON.stringify(antes, null, 2));
console.log("Respaldo guardado en scripts/data/_reparacion-danny-0109.json\n");

await bd.query("begin");
try {
  // 1. El nombre de la ficha, como lo tiene SUNAT.
  await bd.query(`update cuentas set razon_social = $2 where id = $1`, [LOGISMINSA, NOMBRE_BUENO]);

  // 2. El teléfono de Danny sale de la ficha de LOGISMINSA. El contacto se
  //    queda —puede ser una persona real de esa empresa—, pero sin ese número:
  //    mientras esté ahí, vuelve a arrastrar los contactos de Danny a la ficha
  //    equivocada. `telefono_normalizado` es columna generada y se limpia sola.
  await bd.query(`update contactos set telefono = null where id = $1`, [CONTACTO_KAREN]);

  // 3. El caso se muda a su cliente: el contacto, la oportunidad y la atención.
  //    No hay equipo ni gestiones colgando (se comprobó), así que no queda nada
  //    apuntando a la ficha vieja.
  await bd.query(`update leads set cuenta_id = $2 where id = $1`, [LEAD, PERUVIAN_NATURE]);
  await bd.query(`update oportunidades set cuenta_id = $2 where id = $1`, [OPORTUNIDAD, PERUVIAN_NATURE]);
  await bd.query(`update atenciones set cuenta_id = $2 where oportunidad_id = $1`, [OPORTUNIDAD, PERUVIAN_NATURE]);

  // 4. Danny queda como contacto de su empresa. Sin esto, el próximo contacto
  //    suyo tampoco encuentra ficha y se abre una nueva.
  await bd.query(
    `insert into contactos (cuenta_id, nombre, telefono, es_principal)
     select $1, 'DANNY BERNUY', '985 290 984', false
      where not exists (select 1 from contactos where cuenta_id = $1 and telefono_normalizado = '985290984')`,
    [PERUVIAN_NATURE],
  );

  await bd.query("commit");
  console.log("Aplicado.\n");
} catch (e) {
  await bd.query("rollback");
  console.error("Falló, no se cambió nada:", e.message);
  process.exit(1);
}

const { rows: [c] } = await bd.query(`select razon_social, num_doc from cuentas where id=$1`, [LOGISMINSA]);
console.log("Ficha 20552956461 :", c.razon_social);
const { rows: [k] } = await bd.query(`select nombre, telefono from contactos where id=$1`, [CONTACTO_KAREN]);
console.log("Contacto de esa ficha:", k.nombre, "· teléfono:", k.telefono ?? "(sin teléfono)");
const { rows: [caso] } = await bd.query(
  `select l.codigo, cu.razon_social, cu.num_doc, o.etapa, o.tipo_postventa,
          (select count(*) from atenciones a where a.oportunidad_id=o.id and a.cuenta_id=cu.id) atenciones
     from oportunidades o join cuentas cu on cu.id=o.cuenta_id join leads l on l.id=o.lead_id
    where o.id=$1`, [OPORTUNIDAD]);
console.log(`Caso ${caso.codigo} ahora en: ${caso.razon_social} (RUC ${caso.num_doc}) · ${caso.etapa}/${caso.tipo_postventa} · atenciones mudadas: ${caso.atenciones}`);
const { rows: ct } = await bd.query(
  `select nombre, telefono from contactos where cuenta_id=$1 order by es_principal desc`, [PERUVIAN_NATURE]);
console.log("Contactos de PERUVIAN NATURE:", ct.map((r) => `${r.nombre} (${r.telefono})`).join(" · "));
await bd.end();
