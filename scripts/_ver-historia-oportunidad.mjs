// La historia de una oportunidad: cuándo se movió de etapa y cuándo salió su
// cotización. Uso: node --env-file=.env.local scripts/_ver-historia-oportunidad.mjs Presu_506-26 [...]
import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

for (const codigo of process.argv.slice(2)) {
  const { rows: cot } = await bd.query(
    `select c.id, c.codigo, c.estado, c.created_at, c.enviada_at, c.oportunidad_id,
            o.etapa, o.created_at as op_creada, o.updated_at as op_tocada, o.origen, o.proxima_accion,
            cu.razon_social
       from cotizaciones c join oportunidades o on o.id = c.oportunidad_id
       join cuentas cu on cu.id = o.cuenta_id where c.codigo = $1`,
    [codigo],
  );
  if (!cot[0]) { console.log(`${codigo}: no existe`); continue; }
  const c = cot[0];
  console.log(`\n=== ${codigo} · ${c.razon_social} · etapa HOY: ${c.etapa} · origen ${c.origen}`);
  console.log(`   oportunidad creada ${c.op_creada.toISOString().slice(0, 16)} · cotización creada ${c.created_at.toISOString().slice(0, 16)} · enviada ${c.enviada_at?.toISOString().slice(0, 16) ?? "—"}`);
  const { rows: act } = await bd.query(
    `select tipo, nota, realizada_at, proxima_accion from actividades where oportunidad_id = $1 order by realizada_at`,
    [c.oportunidad_id],
  );
  for (const a of act)
    console.log(`   ${a.realizada_at.toISOString().slice(0, 16)}  ${String(a.tipo).padEnd(18)} ${(a.nota ?? "").slice(0, 60).padEnd(62)} → ${a.proxima_accion ?? ""}`);
}
await bd.end();
