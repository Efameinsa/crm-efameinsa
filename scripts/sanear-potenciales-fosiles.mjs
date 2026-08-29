// ============================================================
// CRM EFAMEINSA · Los «potenciales» que nadie puso ahí (29-08)
// ============================================================
// EL RECLAMO. Brenda (C1) y Katerine (C5) abren su reporte semanal y en
// «3. LO QUE QUEDÓ PENDIENTE» les aparecen clientes que no están negociando:
// 9 a Brenda, 25 a Katerine. Textual: «no sabemos por qué nos sale como
// potenciales». Tienen razón — no lo pusieron ellas.
//
// LA CAUSA: la palabra «potencial» significa DOS cosas distintas, y el CRM
// las juntó en la misma etapa.
//
//   1) En los Excel históricos, el estado `C3_Seg_Potencial` era una etiqueta
//      de archivo, congelada el día que el comercial tocó la fila por última
//      vez. La importación lo tradujo literal a `etapa='potencial'`
//      (scripts/extraer-oportunidades-historicas.mjs y
//      scripts/importar-crm-mantenimiento.mjs).
//
//   2) El 25-08, con el cuadro semanal del ing. Carlos, `potencial` pasó a
//      significar otra cosa: «lo que voy a cerrar ESTA semana».
//      `cargarPotenciales()` levanta toda oportunidad en `potencial` sin mirar
//      fecha ni origen, y `resumirSemana()` manda a «Por ubicar» las que no
//      tienen `cierre_proyectado`.
//
// Resultado: fósiles del Excel —7 de 2021, 15 de 2022, 10 de 2023, 3 de 2024,
// 9 de 2025— salen todas las semanas como si fueran negociación viva. Un
// cliente que nadie llama desde 2021 no es «lo que quedó pendiente esta
// semana»; es cartera dormida.
//
// LA CORRECCIÓN. Pasan a `seguimiento`, que es adonde la propia taxonomía
// manda a los otros estados C3 del Excel (`C3_ESPERAR`, `C3_NO_RESPONDE`,
// `C3_NEGOCIAR` — 6.907 oportunidades que nunca molestaron a nadie). No se
// borra nada: el cliente sigue en la cartera de su comercial, la oportunidad
// sigue abierta y con todo su historial. Solo deja de reclamar una semana que
// no le corresponde.
//
// LO QUE NO SE TOCA — y es la mitad del trabajo:
//   · lo gestionado DENTRO del CRM. Ariana tiene dos negociaciones vivas
//     (BOYER GUERRERO, DANCE SOLOGUREN) que son históricas de origen pero que
//     ella cotizó el 27 y el 28 de agosto. Esas SÍ son «por ubicar» de verdad:
//     el cuadro está bien al pedirles fecha de cierre. Vaciar la columna
//     entera se habría llevado justo los dos casos legítimos.
//   · lo que un comercial marcó potencial en el CRM (`origen='crm'`).
//
// Uso:
//   node --env-file=.env.local scripts/sanear-potenciales-fosiles.mjs
//   node --env-file=.env.local scripts/sanear-potenciales-fosiles.mjs --aplicar
//   node --env-file=.env.local scripts/sanear-potenciales-fosiles.mjs --revertir
// ============================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESPALDO = join(RAIZ, "backups", "potenciales-fosiles-29-08.json");

const APLICAR = process.argv.includes("--aplicar");
const REVERTIR = process.argv.includes("--revertir");

// Día del volcado del histórico: una gestión posterior a esta fecha ya se hizo
// dentro del CRM, con el significado nuevo de «potencial».
const CORTE_IMPORT = "2026-08-21";

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/* ── Revertir: devuelve a 'potencial' exactamente lo que este script movió ── */
if (REVERTIR) {
  if (!existsSync(RESPALDO)) { console.log(`No hay respaldo en ${RESPALDO} — nada que revertir.`); await c.end(); process.exit(0); }
  const previo = JSON.parse(readFileSync(RESPALDO, "utf8"));
  const { rowCount } = await c.query(
    `update oportunidades set etapa='potencial', updated_at=now() where id = any($1::uuid[]) and etapa='seguimiento'`,
    [previo.map((p) => p.id)],
  );
  console.log(`Revertidas a 'potencial': ${rowCount} de ${previo.length}.`);
  await c.end();
  process.exit(0);
}

/* ── Qué se va a mover ────────────────────────────────────────────────── */
const { rows: mover } = await c.query(`
  select o.id, p.codigo_comercial cc, p.nombre comercial, cu.razon_social,
         o.created_at::date fecha_excel,
         (select max(a.realizada_at)::date from actividades a where a.oportunidad_id = o.id) ult_gestion
  from oportunidades o
  left join perfiles p  on p.id  = o.comercial_id
  left join cuentas cu  on cu.id = o.cuenta_id
  where o.etapa = 'potencial'
    and o.cierre_proyectado is null
    and o.origen = 'historico_excel'
    -- señal de vida dentro del CRM: se queda donde está
    and not exists (select 1 from actividades a
                    where a.oportunidad_id = o.id and a.realizada_at > $1)
    and not exists (select 1 from cotizaciones z where z.oportunidad_id = o.id)
  order by p.codigo_comercial, ult_gestion desc nulls last
`, [CORTE_IMPORT]);

const { rows: quedan } = await c.query(`
  select p.codigo_comercial cc, cu.razon_social, o.origen,
         (select max(a.realizada_at)::date from actividades a where a.oportunidad_id = o.id) ult_gestion,
         (select count(*)::int from cotizaciones z where z.oportunidad_id = o.id) cots
  from oportunidades o
  left join perfiles p on p.id = o.comercial_id
  left join cuentas cu on cu.id = o.cuenta_id
  where o.etapa = 'potencial' and o.cierre_proyectado is null
    and not (o.origen = 'historico_excel'
             and not exists (select 1 from actividades a where a.oportunidad_id = o.id and a.realizada_at > $1)
             and not exists (select 1 from cotizaciones z where z.oportunidad_id = o.id))
  order by 1, 2
`, [CORTE_IMPORT]);

const porComercial = new Map();
for (const r of mover) porComercial.set(r.cc, (porComercial.get(r.cc) ?? 0) + 1);

console.log(`\n=== SALEN del cuadro semanal (pasan a 'seguimiento'): ${mover.length} ===`);
for (const r of mover) {
  console.log(`  ${String(r.cc).padEnd(4)} ${String(r.razon_social).slice(0, 46).padEnd(46)}  última gestión: ${r.ult_gestion?.toISOString().slice(0, 10) ?? "—"}`);
}
console.log(`\nPor comercial:`);
console.table([...porComercial].map(([cc, n]) => ({ comercial: cc, salen: n })));

console.log(`\n=== SE QUEDAN en «Por ubicar» (negociación real): ${quedan.length} ===`);
for (const r of quedan) {
  console.log(`  ${String(r.cc).padEnd(4)} ${String(r.razon_social).slice(0, 46).padEnd(46)}  origen=${r.origen}  última gestión: ${r.ult_gestion?.toISOString().slice(0, 10) ?? "—"}  cotizaciones: ${r.cots}`);
}

if (!APLICAR) {
  console.log(`\n(ensayo — nada se escribió. Repetir con --aplicar)`);
  await c.end();
  process.exit(0);
}

/* ── Aplicar ──────────────────────────────────────────────────────────── */
mkdirSync(dirname(RESPALDO), { recursive: true });
writeFileSync(RESPALDO, JSON.stringify(mover.map((r) => ({ id: r.id, cc: r.cc, razon_social: r.razon_social, etapa_previa: "potencial" })), null, 1));

const { rowCount } = await c.query(
  `update oportunidades set etapa='seguimiento', updated_at=now() where id = any($1::uuid[]) and etapa='potencial'`,
  [mover.map((r) => r.id)],
);
console.log(`\n✔ ${rowCount} oportunidades pasadas de 'potencial' a 'seguimiento'.`);
console.log(`  Respaldo para revertir: ${RESPALDO}`);
await c.end();
