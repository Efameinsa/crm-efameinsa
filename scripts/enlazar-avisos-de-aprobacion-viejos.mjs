// LOS AVISOS DE APROBACIÓN VIEJOS APRENDEN A DÓNDE LLEVAR.
//
// Hasta la 0237 (16-09) el aviso «Gerencia aprobó los precios de su cotización»
// salía sin número, sin cliente y con destino «/comercial/oportunidades» —la
// lista general—. Brenda (17-09) los tenía en la campana y al tocarlos «no
// aparece nada»: la llevaba a la pantalla en la que ya estaba.
//
// Cada uno de esos avisos se creó en el mismo segundo en que gerencia resolvió
// la cotización (`cotizaciones.aprobada_at`), para el comercial dueño de la
// oportunidad. Con eso se casan: un aviso ↔ la única cotización de ese
// comercial resuelta entre 3 s antes y 1 s después. Se comprobó el 17-09:
// 129 de 138 aprobaciones casan con exactamente una; ninguna con varias.
// Los que no casan son cotizaciones que se volvieron a resolver después
// (rechazo → corrección → aprobación pisa `aprobada_at`) o que ya no existen:
// esos quedan como están, y la campana les explica por qué (ventana de detalle).
//
// Uso:
//   node --env-file=.env.local scripts/enlazar-avisos-de-aprobacion-viejos.mjs            (mide, no toca)
//   node --env-file=.env.local scripts/enlazar-avisos-de-aprobacion-viejos.mjs --aplicar  (escribe)
//
// Antes de escribir guarda cómo estaban en scripts/data/_avisos-aprobacion-antes-<fecha>.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { Client } from "pg";

const aplicar = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(`
  with viejos as (
    select n.id, n.user_id, n.tipo, n.titulo, n.url, n.created_at
      from notificaciones n
     where n.tipo in ('cotizacion_aprobada', 'cotizacion_rechazada')
       and n.url = '/comercial/oportunidades'
  ),
  casados as (
    select v.*,
           (select jsonb_agg(jsonb_build_object('cot', c.id, 'op', o.id, 'codigo', c.codigo, 'cliente', cu.razon_social))
              from cotizaciones c
              join oportunidades o on o.id = c.oportunidad_id
              join cuentas cu on cu.id = o.cuenta_id
             where o.comercial_id = v.user_id
               and c.aprobada_at between v.created_at - interval '3 seconds' and v.created_at + interval '1 second') candidatos
      from viejos v
  )
  select * from casados order by created_at`);

const unicos = rows.filter((r) => r.candidatos && r.candidatos.length === 1);
const sinPar = rows.filter((r) => !r.candidatos);
const ambiguos = rows.filter((r) => r.candidatos && r.candidatos.length > 1);
console.log(`Avisos con destino genérico: ${rows.length} · casan con una cotización: ${unicos.length} · sin par: ${sinPar.length} · ambiguos: ${ambiguos.length}`);

const cambios = unicos.map((r) => {
  const c = r.candidatos[0];
  // Mismo formato que arma resolverAprobacionCotizacion desde la 0237.
  const cual = [c.codigo ? `la cotización ${c.codigo}` : "su cotización", c.cliente].filter(Boolean).join(" · ");
  return {
    id: r.id,
    antes: { titulo: r.titulo, url: r.url },
    titulo: r.tipo === "cotizacion_rechazada" ? `Gerencia rechazó ${cual}` : `Gerencia aprobó los precios de ${cual}`,
    url: `/comercial/oportunidades/${c.op}/cotizar/${c.cot}`,
  };
});
for (const c of cambios.slice(0, 5)) console.log(`  ${c.antes.titulo}  →  ${c.titulo}\n     ${c.url}`);
if (cambios.length > 5) console.log(`  … y ${cambios.length - 5} más`);

if (!aplicar) {
  console.log("\nNo se escribió nada. Con --aplicar se enlazan.");
  await bd.end();
  process.exit(0);
}

mkdirSync("scripts/data", { recursive: true });
const respaldo = `scripts/data/_avisos-aprobacion-antes-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(respaldo, JSON.stringify(cambios, null, 2));
console.log(`\nRespaldo de cómo estaban: ${respaldo}`);

await bd.query("begin");
let n = 0;
for (const c of cambios) {
  const { rowCount } = await bd.query(`update notificaciones set titulo = $2, url = $3 where id = $1 and url = '/comercial/oportunidades'`, [
    c.id,
    c.titulo,
    c.url,
  ]);
  n += rowCount;
}
await bd.query("commit");
console.log(`Enlazados: ${n} avisos.`);
await bd.end();
