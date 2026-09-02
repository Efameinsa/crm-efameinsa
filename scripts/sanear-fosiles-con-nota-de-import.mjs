// ============================================================
// CRM EFAMEINSA · Fósiles que el saneador no vio: la nota del import los delataba como "tocados"
// ============================================================
// Santos, 02-09, mirando Mi día de Katerine después del archivado: «271 recién
// asignadas, ¿quién le asignó? ¿lo asignó Central?». No: 269 vinieron del
// Excel del 21-08 con el estado en blanco. El importador les puso etapa
// `asignada` y les dejó UNA actividad tipo `nota` fechada el día del import
// («[Histórico PROSP., estado (vacío)]»). Para el saneador de la 0130 esa nota
// contaba como «alguien la tocó en el CRM desde el 18-08», y las dejó vivas.
// Lo mismo pasa con filas en filtrada/seguimiento/cotizada de todos los
// comerciales.
//
// CRITERIO (el mismo de la 0130, corregido): origen Excel, abierta, sin
// cotización propia, sin cierre proyectado, y TODA su actividad desde el
// 18-08 es la nota del importador (tipo nota, fechada el día del import y con
// el texto «[Histórico …]»). Ninguna gestión de persona.
//
// Uso:  node --env-file=.env.local scripts/sanear-fosiles-con-nota-de-import.mjs            (ensayo)
//       node --env-file=.env.local scripts/sanear-fosiles-con-nota-de-import.mjs --aplicar
//       node --env-file=.env.local scripts/sanear-fosiles-con-nota-de-import.mjs --revertir
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { Client } from "pg";
const APLICAR = process.argv.includes("--aplicar"), REVERTIR = process.argv.includes("--revertir");
const RESPALDO = "backups/oportunidades-fosiles-nota-import-02-09.json";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

if (REVERTIR) {
  if (!existsSync(RESPALDO)) { console.log("No hay respaldo."); process.exit(1); }
  const r = JSON.parse(readFileSync(RESPALDO, "utf8"));
  const { rowCount } = await bd.query(`update oportunidades o set etapa = x.etapa::etapa_oportunidad, updated_at = now() from jsonb_to_recordset($1::jsonb) as x(id uuid, etapa text) where o.id = x.id and o.etapa = 'historico'`, [JSON.stringify(r.filas)]);
  console.log(`revertidas ${rowCount} de ${r.filas.length}`); await bd.end(); process.exit(0);
}

const CANDIDATAS = `
  select o.id, o.etapa::text etapa, o.comercial_id
    from oportunidades o
   where o.origen = 'historico_excel'
     and o.etapa not in ('venta','rechazada','derivada','historico')
     and o.cierre_proyectado is null
     and not exists (select 1 from cotizaciones z where z.oportunidad_id = o.id)
     and not exists (
       select 1 from actividades a
        where a.oportunidad_id = o.id
          and (a.realizada_at at time zone 'America/Lima')::date >= '2026-08-18'
          and not (a.tipo = 'nota' and coalesce(a.nota,'') like '[Histórico%'
                   and (a.realizada_at at time zone 'America/Lima')::date = (o.created_at at time zone 'America/Lima')::date))
     and exists (select 1 from actividades a where a.oportunidad_id = o.id and a.tipo = 'nota' and coalesce(a.nota,'') like '[Histórico%')`;

const { rows } = await bd.query(CANDIDATAS);
console.log(`\nCandidatas: ${rows.length}`);
console.table((await bd.query(`select p.codigo_comercial cc, c.etapa, count(*)::int n from (${CANDIDATAS}) c join perfiles p on p.id = c.comercial_id group by 1,2 order by 1,2`)).rows);

if (!APLICAR) { console.log("\nEnsayo. No se escribió nada. Para aplicar: --aplicar"); await bd.end(); process.exit(0); }

writeFileSync(RESPALDO, JSON.stringify({ que_es: "Fósiles con solo la nota del importador, pasados a historico el 02-09-2026. Revertir con --revertir.", filas: rows.map(r => ({ id: r.id, etapa: r.etapa })) }, null, 1));
const { rowCount } = await bd.query(`update oportunidades o set etapa = 'historico', updated_at = now() where o.id = any($1::uuid[])`, [rows.map(r => r.id)]);
if (rowCount !== rows.length) throw new Error(`se movieron ${rowCount} y el respaldo tiene ${rows.length}`);
console.log(`\n✓ ${rowCount} pasadas al histórico. Respaldo → ${RESPALDO}`);
console.table((await bd.query(`select p.codigo_comercial cc,
   count(*) filter (where o.etapa not in ('venta','rechazada','derivada','historico'))::int abiertas,
   count(*) filter (where o.etapa='asignada' and o.proxima_accion_at is null)::int recien_asignadas,
   count(*) filter (where o.etapa not in ('venta','rechazada','derivada','historico') and o.proxima_accion_at < current_date)::int vencidas
   from oportunidades o join perfiles p on p.id=o.comercial_id where p.rol='comercial' and not p.es_prueba group by 1 order by 1`)).rows);
await bd.end();
