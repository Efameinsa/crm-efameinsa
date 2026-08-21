// Aplica los candidatos de SUNAT que ya tienen luz verde. Dos cosas distintas:
//
//   1. La cuenta no tenía documento y el RUC no existe en ninguna otra: se le
//      pone el RUC. Cambio chico y reversible.
//   2. `duplicado_confirmado`: el RUC ya está en OTRA cuenta del CRM, o sea que
//      las dos son la misma empresa. Ahí se FUSIONAN.
//
// La fusión es lo delicado: mueve historia entre cuentas y decide de quién es
// el cliente. Reglas, todas explícitas:
//
//   · SOBREVIVE la cuenta que ya tenía el RUC — es la que tiene identidad
//     comprobada. La otra entrega todo y desaparece.
//   · LA CARTERA se queda con quien tuvo la ACTIVIDAD MÁS RECIENTE, no con
//     quien sobrevive. Si no, un registro viejo con RUC le robaría el cliente
//     al comercial que lo está trabajando hoy. Cada vez que el dueño cambia
//     se anota en el reporte para que gerencia lo pueda revisar.
//   · NO SE PIERDE NADA: oportunidades, cotizaciones del archivo, contactos,
//     leads y asignaciones se mudan; dirección, rubro y notas se completan
//     desde la que se va cuando a la que queda le faltaban.
//
// Por defecto solo muestra el plan. Para ejecutarlo: --ejecutar
// Uso:
//   node --env-file=.env.local scripts/aplicar-ruc-aprobados.mjs [--ejecutar] [--confianza alta]

import { writeFileSync } from "node:fs";
import { Client } from "pg";

const EJECUTAR = process.argv.includes("--ejecutar");
const i = process.argv.indexOf("--confianza");
const CONFIANZA = i !== -1 ? process.argv[i + 1] : "alta";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// `decision` se respeta si gerencia ya marcó algo; si está en null, manda la
// confianza. Lo rechazado no se toca nunca.
const { rows: candidatos } = await bd.query(
  `select s.*, c.razon_social, c.comercial_id, c.tipo_doc
   from sunat_candidatos s join cuentas c on c.id = s.cuenta_id
   where s.confianza = $1 and coalesce(s.decision, 'aprobado') = 'aprobado'
   order by s.resultado, s.razon_social_crm`,
  [CONFIANZA],
);

const soloRuc = candidatos.filter((c) => c.resultado !== "duplicado_confirmado" && c.ruc_sugerido);
const fusiones = candidatos.filter((c) => c.resultado === "duplicado_confirmado" && c.ruc_ya_en_cuenta);

// Actividad más reciente de una cuenta: sirve para decidir de quién es la
// cartera cuando las dos copias están en manos distintas.
async function ultimaActividad(cuentaId) {
  const { rows } = await bd.query(
    `select greatest(
       coalesce((select max(v.fecha_venta)::timestamptz from ventas v
                 join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = $1), 'epoch'),
       coalesce((select max(ch.fecha)::timestamptz from cotizaciones_historicas ch where ch.cuenta_id = $1), 'epoch'),
       coalesce((select max(o.updated_at) from oportunidades o where o.cuenta_id = $1), 'epoch')
     ) ultima`,
    [cuentaId],
  );
  return rows[0].ultima;
}

async function historia(cuentaId) {
  const { rows } = await bd.query(
    `select (select count(*) from oportunidades where cuenta_id = $1)::int ops,
            (select count(*) from cotizaciones_historicas where cuenta_id = $1)::int cots,
            (select count(*) from contactos where cuenta_id = $1)::int contactos,
            (select count(*) from leads where cuenta_id = $1)::int leads`,
    [cuentaId],
  );
  return rows[0];
}

console.log(EJECUTAR ? "EJECUTANDO\n" : "PLAN (nada se toca; agregue --ejecutar)\n");
console.log(`Confianza ${CONFIANZA}: ${soloRuc.length} para completar el RUC · ${fusiones.length} para fusionar\n`);

const reporte = { completados: [], fusionados: [], cambiosDeCartera: [] };

for (const c of soloRuc) {
  console.log(`RUC  ${c.razon_social_crm.slice(0, 52).padEnd(52)} → ${c.ruc_sugerido}`);
  reporte.completados.push({ cuenta: c.razon_social_crm, ruc: c.ruc_sugerido, nombreSunat: c.nombre_sunat });
}

const planFusiones = [];
for (const c of fusiones) {
  const { rows: dest } = await bd.query("select id, razon_social, comercial_id, num_doc from cuentas where id = $1", [
    c.ruc_ya_en_cuenta,
  ]);
  if (!dest[0]) continue;
  const queda = dest[0];
  const seVa = { id: c.cuenta_id, razon_social: c.razon_social, comercial_id: c.comercial_id };

  const [hQueda, hSeVa] = await Promise.all([historia(queda.id), historia(seVa.id)]);
  const [aQueda, aSeVa] = await Promise.all([ultimaActividad(queda.id), ultimaActividad(seVa.id)]);
  const carteraGanadora = aSeVa > aQueda ? seVa.comercial_id : queda.comercial_id;
  const cambiaCartera = carteraGanadora !== queda.comercial_id;

  planFusiones.push({ queda, seVa, hQueda, hSeVa, carteraGanadora, cambiaCartera, nombreOficial: c.nombre_sunat });

  console.log(`FUSIÓN  "${seVa.razon_social.slice(0, 44)}" → "${queda.razon_social.slice(0, 44)}" (${queda.num_doc})`);
  console.log(`        se va: ${hSeVa.ops} op · ${hSeVa.cots} cot · ${hSeVa.contactos} cont · ${hSeVa.leads} leads`);
  console.log(`        queda: ${hQueda.ops} op · ${hQueda.cots} cot · ${hQueda.contactos} cont · ${hQueda.leads} leads`);
  if (cambiaCartera) console.log(`        ⚠️ la cartera cambia de dueño (gana quien tuvo la actividad más reciente)`);
  if (c.nombre_sunat && c.nombre_sunat.toUpperCase() !== queda.razon_social.toUpperCase()) {
    console.log(`        nombre: "${queda.razon_social.slice(0, 40)}" → "${c.nombre_sunat.slice(0, 40)}" (oficial de SUNAT)`);
  }
}

if (!EJECUTAR) {
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  for (const c of soloRuc) {
    // La razón social pasa a ser la OFICIAL de SUNAT y la que traía el CRM se
    // guarda como nombre comercial — que para eso está la columna. Así se
    // corrigen de paso los tipeos del Excel, y no se pierde el nombre con el
    // que el comercial reconoce al cliente ("HOTEL LAS DUNAS SUN RESORT").
    await bd.query(
      `update cuentas set tipo_doc = 'RUC', num_doc = $2,
              razon_social = coalesce($3, razon_social),
              nombre_comercial = case
                when nombre_comercial is not null and nombre_comercial <> '' then nombre_comercial
                when $3 is not null and upper($3) <> upper(razon_social) then razon_social
                else nombre_comercial end
        where id = $1`,
      [c.cuenta_id, c.ruc_sugerido, c.nombre_sunat]);
    await bd.query(
      "update sunat_candidatos set decision = 'aprobado', decidido_at = now(), nota_decision = 'RUC aplicado automáticamente (confianza alta)' where cuenta_id = $1",
      [c.cuenta_id],
    );
  }

  for (const f of planFusiones) {
    const { queda, seVa } = f;
    // La historia se muda antes de borrar nada.
    await bd.query("update oportunidades set cuenta_id = $1 where cuenta_id = $2", [queda.id, seVa.id]);
    await bd.query("update cotizaciones_historicas set cuenta_id = $1 where cuenta_id = $2", [queda.id, seVa.id]);
    await bd.query("update leads set cuenta_id = $1 where cuenta_id = $2", [queda.id, seVa.id]);
    await bd.query("update asignaciones set cuenta_id = $1 where cuenta_id = $2", [queda.id, seVa.id]);
    await bd.query("update informes_cierre set cuenta_id = $1 where cuenta_id = $2", [queda.id, seVa.id]);

    // Contactos: se mudan los que la cuenta que queda no tiene ya (mismo
    // teléfono normalizado o mismo nombre); el resto se descarta para no
    // duplicar a la misma persona dentro de la ficha fusionada.
    await bd.query(
      `update contactos c set cuenta_id = $1, es_principal = false
       where c.cuenta_id = $2
         and not exists (
           select 1 from contactos d where d.cuenta_id = $1
             and ((d.telefono_normalizado is not null and d.telefono_normalizado = c.telefono_normalizado)
                  or upper(d.nombre) = upper(c.nombre)))`,
      [queda.id, seVa.id],
    );
    await bd.query("delete from contactos where cuenta_id = $1", [seVa.id]);

    // Lo que a la que queda le falte, se completa con lo de la que se va.
    await bd.query(
      `update cuentas q set
         direccion    = coalesce(q.direccion, v.direccion),
         departamento = coalesce(q.departamento, v.departamento),
         provincia    = coalesce(q.provincia, v.provincia),
         distrito     = coalesce(q.distrito, v.distrito),
         rubro_id     = coalesce(q.rubro_id, v.rubro_id),
         comercial_id = $3,
         -- El nombre oficial de SUNAT manda: en "OSWIL GROUP S.A.C." contra
         -- "OSWILL GROUP SAC" sobrevive la ficha con RUC, que justamente es la
         -- del tipeo malo. Sin esto la fusión conservaría el error.
         razon_social = coalesce($4, q.razon_social),
         nombre_comercial = coalesce(
           nullif(q.nombre_comercial, ''), nullif(v.nombre_comercial, ''),
           case when $4 is not null and upper($4) <> upper(v.razon_social) then v.razon_social end),
         notas = case
           when v.notas is null or v.notas = '' then q.notas
           when q.notas is null or q.notas = '' then v.notas
           else q.notas || E'\\n\\n[de la ficha fusionada] ' || v.notas end,
         ultima_venta_at = greatest(coalesce(q.ultima_venta_at, 'epoch'), coalesce(v.ultima_venta_at, 'epoch')),
         cartera_desde = least(coalesce(q.cartera_desde, now()), coalesce(v.cartera_desde, now()))
       from cuentas v
       where q.id = $1 and v.id = $2`,
      [queda.id, seVa.id, f.carteraGanadora, f.nombreOficial],
    );

    await bd.query("delete from sunat_candidatos where cuenta_id = $1", [seVa.id]);
    await bd.query("delete from cuentas where id = $1", [seVa.id]);

    reporte.fusionados.push({
      seVa: seVa.razon_social,
      queda: queda.razon_social,
      ruc: queda.num_doc,
      historiaMudada: f.hSeVa,
    });
    if (f.cambiaCartera) {
      reporte.cambiosDeCartera.push({ cuenta: queda.razon_social, ruc: queda.num_doc });
    }
  }

  await bd.query("commit");
  console.log(`\nRUC completados: ${reporte.completados.length} · fusiones: ${reporte.fusionados.length}`);
  if (reporte.cambiosDeCartera.length) {
    console.log(`⚠️ En ${reporte.cambiosDeCartera.length} la cartera cambió de dueño — están en el reporte para gerencia.`);
  }
  const ruta = `scripts/data/fusiones-aplicadas.json`;
  writeFileSync(ruta, JSON.stringify(reporte, null, 1));
  console.log(`Detalle en ${ruta}`);
} catch (e) {
  await bd.query("rollback");
  console.error("\nNADA se aplicó — la transacción se revirtió:", e.message);
  process.exitCode = 1;
}
await bd.end();
