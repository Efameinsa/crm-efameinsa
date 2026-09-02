// ============================================================
// CRM EFAMEINSA · Reponer lo que el archivado tomó por nota del importador
// ============================================================
// Santos, 02-09, 10:50: «devuélvele a Ariana a Becerra Rojas Sebastián, y
// reponer todos los casos que hayas causado de manera similar».
//
// QUÉ PASÓ. El segundo saneador del 02-09
// (`sanear-fosiles-con-nota-de-import.mjs`) trataba como «nota del
// importador» CUALQUIER actividad con prefijo «[Histórico …]» o
// «[Actualización 22-08 …]» fechada entre el 18 y el 22-08. Pero ese prefijo
// dice cuándo se leyó el Excel, no cuándo se hizo la gestión: la fecha real
// está en `realizada_at`, y una gestión escrita en el Excel el 19-08 («el Sr.
// Raúl está haciendo un estudio de mercado») entró con ese mismo prefijo.
// Resultado: trabajo vivo de la semana en que arrancó el CRM, archivado.
//
// CRITERIO DE REPOSICIÓN (medido con Santos, 02-09):
//   · pasó a `historico` el 02-09, y
//   · su ÚLTIMA actividad (por `realizada_at`) está fechada entre el 18 y el
//     22-08 y trae texto después del prefijo, y
//   · NO es un artefacto del primer import: notas «[Histórico …]» fechadas
//     exactamente el 21-08 (filas del Excel sin fecha, que recibieron la del
//     import; la mitad son «estado (vacío)» y el resto trae cotizaciones de
//     2023). Esas se quedan en el histórico, retomables a mano.
//   · más Becerra Rojas Sebastián (ficha con RUC 10757514678), a pedido
//     expreso: su última gestión real es del 18-07, no cumple el criterio,
//     pero Ariana la está trabajando.
//
// CÓMO SE REPONE: a la etapa que tenía ANTES del archivado, leída de los
// respaldos del propio archivado (31-08 y 02-09), no a un estado inventado.
// Y con una nota fechada hoy, para que ningún saneador la vuelva a tomar por
// fósil. NO se toca próxima acción ni intención.
//
// Uso:  node --env-file=.env.local scripts/reponer-gestiones-semana-del-import.mjs            (ensayo)
//       node --env-file=.env.local scripts/reponer-gestiones-semana-del-import.mjs --aplicar
//       node --env-file=.env.local scripts/reponer-gestiones-semana-del-import.mjs --revertir
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar"), REVERTIR = process.argv.includes("--revertir");
const RESPALDO = "backups/repuestas-semana-del-import-02-09.json";
const BECERRA = "891cde04-7bfb-45cd-9e41-01b12afd979b";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

if (REVERTIR) {
  if (!existsSync(RESPALDO)) { console.log("No hay respaldo."); process.exit(1); }
  const r = JSON.parse(readFileSync(RESPALDO, "utf8"));
  const { rowCount } = await bd.query(
    `update oportunidades o set etapa = 'historico', updated_at = now()
       from jsonb_to_recordset($1::jsonb) as x(id uuid, etapa_repuesta text)
      where o.id = x.id and o.etapa::text = x.etapa_repuesta`, [JSON.stringify(r.filas)]);
  console.log(`revertidas ${rowCount} de ${r.filas.length} (las que seguían en la etapa repuesta)`);
  await bd.end(); process.exit(0);
}

// La etapa que tenía cada una antes del archivado, según los respaldos.
const previa = new Map();
for (const o of JSON.parse(readFileSync("backups/oportunidades-fosiles-31-08.json", "utf8")).oportunidades) previa.set(o.id, o.etapa_previa);
for (const f of ["backups/oportunidades-fosiles-nota-import-02-09.json", "backups/oportunidades-fosiles-nota-import-02-09-b.json"].filter(existsSync))
  for (const o of JSON.parse(readFileSync(f, "utf8")).filas) previa.set(o.id, o.etapa);

const CANDIDATAS = `
  with u as (
    select distinct on (o.id) o.id, o.comercial_id, o.cuenta_id,
           (a.realizada_at at time zone 'America/Lima')::date ultima,
           trim(case when coalesce(a.nota,'') like '[%' and position(']' in a.nota) > 0
                     then substring(a.nota from position(']' in a.nota) + 1) else coalesce(a.nota,'') end) texto,
           a.nota nota_cruda
      from oportunidades o join actividades a on a.oportunidad_id = o.id
     where o.etapa = 'historico' and o.updated_at::date = '2026-09-02'
     order by o.id, a.realizada_at desc)
  select u.id, u.comercial_id, p.codigo_comercial cc, c.razon_social, u.ultima, left(u.texto, 90) texto
    from u join perfiles p on p.id = u.comercial_id join cuentas c on c.id = u.cuenta_id
   where (
           u.ultima between '2026-08-18' and '2026-08-22'
           and length(u.texto) > 0
           and not (u.nota_cruda like '[Histórico%' and u.ultima = '2026-08-21')
           -- y no un texto que empieza con una fecha de otro año («9-11-18 entregaron
           -- prospecto»: HOSTAL MARVIN, el caso que destapó el segundo saneador)
           and u.texto !~ '^\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}'
         )
      or u.id = '${BECERRA}'
   order by p.codigo_comercial, u.ultima, c.razon_social`;

const { rows } = await bd.query(CANDIDATAS);
if (!rows.some(r => r.id === BECERRA)) throw new Error("Becerra Rojas (891cde04) no está en historico: ¿ya la retomaron?");
const sinPrevia = rows.filter(r => !previa.has(r.id));
if (sinPrevia.length) throw new Error(`${sinPrevia.length} sin etapa previa en los respaldos: ${sinPrevia.map(r => r.id).join(", ")}`);
const filas = rows.map(r => ({ id: r.id, etapa_repuesta: previa.get(r.id), cc: r.cc, razon_social: r.razon_social, ultima: r.ultima.toISOString().slice(0, 10), texto: r.texto }));

console.log(`\nA reponer: ${filas.length}`);
console.table((await bd.query(`select cc, etapa_repuesta, count(*)::int n from jsonb_to_recordset($1::jsonb) as x(cc text, etapa_repuesta text) group by 1,2 order by 1,2`, [JSON.stringify(filas)])).rows);
for (const f of filas) console.log(`  ${f.cc} ${f.ultima} → ${f.etapa_repuesta.padEnd(12)} ${f.razon_social.slice(0, 45).padEnd(45)} ${f.texto.slice(0, 60)}`);

if (!APLICAR) { console.log("\nEnsayo. No se escribió nada. Para aplicar: --aplicar"); await bd.end(); process.exit(0); }

const { rows: [admin] } = await bd.query(`select p.id from perfiles p join auth.users u on u.id = p.id where u.email = 'admin@efameinsa.com' and p.rol = 'admin'`);
if (!admin) throw new Error("no encuentro el perfil admin@efameinsa.com para firmar la nota");

writeFileSync(RESPALDO, JSON.stringify({ que_es: "Repuestas del histórico el 02-09-2026 (gestión real de la semana del import + Becerra). Revertir con --revertir.", filas }, null, 1));
await bd.query("begin");
try {
  const { rowCount } = await bd.query(
    `update oportunidades o set etapa = x.etapa_repuesta::etapa_oportunidad, updated_at = now()
       from jsonb_to_recordset($1::jsonb) as x(id uuid, etapa_repuesta text)
      where o.id = x.id and o.etapa = 'historico'`, [JSON.stringify(filas)]);
  if (rowCount !== filas.length) throw new Error(`se repusieron ${rowCount} y el respaldo tiene ${filas.length}`);
  await bd.query(
    `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
     select x.id, 'nota',
            case when x.id = $2::uuid
              then 'Repuesta del histórico el 02/09/2026 a pedido de Santos para Ariana: el archivado de fósiles la tomó por trabajo sin tocar; vuelve a ' || x.etapa_repuesta || ' tal como estaba.'
              else 'Repuesta del histórico el 02/09/2026 (Santos): el archivado la tomó por una nota del importador, pero la gestión del ' || to_char(x.ultima::date, 'DD/MM') || ' en el Excel era real. Vuelve a ' || x.etapa_repuesta || ' tal como estaba.'
            end,
            $3::uuid, now()
       from jsonb_to_recordset($1::jsonb) as x(id uuid, etapa_repuesta text, ultima text)`,
    [JSON.stringify(filas), BECERRA, admin.id]);
  await bd.query("commit");
} catch (e) { await bd.query("rollback"); throw e; }
console.log(`\n✓ ${filas.length} repuestas. Respaldo → ${RESPALDO}`);
console.table((await bd.query(`select p.codigo_comercial cc,
   count(*) filter (where o.etapa not in ('venta','rechazada','derivada','historico'))::int abiertas,
   count(*) filter (where o.etapa = 'historico')::int historico
   from oportunidades o join perfiles p on p.id = o.comercial_id where p.rol = 'comercial' and not p.es_prueba group by 1 order by 1`)).rows);
await bd.end();
