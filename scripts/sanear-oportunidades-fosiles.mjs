// ============================================================================
// CRM EFAMEINSA · El archivo del Excel deja de contar como trabajo del día
// ============================================================================
// EL RECLAMO. Brenda (C1) abre «Mi día» y la agenda le dice 1.035 gestiones
// VENCIDAS. Las de verdad son 41. A Katerine (C5) el CRM le cuenta 13.645
// oportunidades abiertas cuando las que está trabajando son 377, y a Ariana
// (C4) 5.888 contra 237. Con esos números, ninguna pantalla del CRM sirve para
// decidir qué hacer hoy: el Kanban, «Mi día», la agenda y el reporte semanal
// muestran, casi enteros, trabajo que nadie pidió.
//
// LA CAUSA. Del 18 al 21 de agosto se importaron los Excel históricos de los
// comerciales. Cada fila entró como una oportunidad y su estado del Excel —una
// etiqueta congelada el día en que el comercial la tocó por última vez— se
// tradujo literal a `etapa`: `C2_Filtrada`, `C3_Seg_*`, `C3_Cotizada`. El CRM
// define «abierta» como `etapa not in ('venta','rechazada','derivada')`, así
// que 20.443 etiquetas muertas pasaron a ser trabajo vivo. De las 21.234
// oportunidades abiertas de hoy, solo 791 son trabajo real.
//
// Es exactamente el caso del 29-08 con los «potenciales fósiles»
// (scripts/sanear-potenciales-fosiles.mjs), a otra escala y de raíz: allá se
// movieron 65 de `potencial` a `seguimiento` porque «potencial» había pasado a
// significar otra cosa; acá el problema es la palabra «abierta» misma.
//
// LA CORRECCIÓN: un estado nuevo y VISIBLE, `historico` (migración 0130).
// Deliberadamente un ESTADO y no un filtro escondido: en este proyecto ya hubo
// dos incidentes graves por filtros invisibles —el `origen = 'crm'` que dejó el
// Kanban y «Mi día» completamente en blanco sin que nadie entendiera por qué
// (docs/11, docs/19 §7)—. Un estado se ve en el badge, tiene su pestaña en
// «Mis oportunidades», sale en la ficha del cliente y se explica solo.
//
// QUÉ ES UN FÓSIL (criterio verificado con Santos, 31-08):
//   · origen = 'historico_excel', y
//   · hoy cuenta como abierta (etapa not in venta/rechazada/derivada), y
//   · NADIE la tocó dentro del CRM desde el 18-08 —el día en que arrancó la
//     importación—: sin cotización propia en `cotizaciones`, sin
//     `cierre_proyectado`, y su última `actividades.realizada_at` anterior al
//     18-08 (o ninguna).
//
// LO QUE NO SE TOCA, Y ES LA MITAD DEL TRABAJO:
//   · las 665 históricas VIVAS: son de origen histórico pero alguien las
//     trabajó DENTRO del CRM. Ariana tiene negociaciones que cotizó el 27 y el
//     28 de agosto; Katerine 334, Ariana 216, Brenda 82. Archivarlas sería
//     borrarle el pipeline real a la gente, que es justo el error que este
//     script existe para no cometer.
//   · todo lo que tenga `origen <> 'historico_excel'` (126 abiertas nacidas en
//     el CRM).
//
// NO SE BORRA NADA. El cliente sigue en la cartera de su comercial, la
// oportunidad conserva todas sus actividades y su historial, se la sigue
// encontrando en la ficha del cliente y en la pestaña «Histórico», y el botón
// «Trabajar esta oportunidad» la devuelve a `seguimiento` en un clic dejando
// constancia de quién la reactivó. Lo único que deja de hacer es reclamar un
// día que no le corresponde.
//
// REQUISITO: la migración 0130 tiene que estar aplicada (es la que crea el
// estado). El script lo comprueba y se niega a correr si no está.
//
// Uso:
//   node --env-file=.env.local scripts/sanear-oportunidades-fosiles.mjs
//   node --env-file=.env.local scripts/sanear-oportunidades-fosiles.mjs --aplicar
//   node --env-file=.env.local scripts/sanear-oportunidades-fosiles.mjs --revertir
// ============================================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESPALDO = join(RAIZ, "backups", "oportunidades-fosiles-31-08.json");

const APLICAR = process.argv.includes("--aplicar");
const REVERTIR = process.argv.includes("--revertir");

// Primer día de la importación de los Excel. Una gestión de ese día en
// adelante ya se hizo DENTRO del CRM, con el significado nuevo de las etapas.
const CORTE_IMPORT = "2026-08-18";

// El criterio, escrito una sola vez. Todas las consultas de acá abajo lo usan
// —el conteo, el listado, el respaldo y el update—, para que no haya manera de
// que el ensayo diga una cosa y la aplicación haga otra.
const ES_FOSIL = `
      o.origen = 'historico_excel'
  and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
  and o.cierre_proyectado is null
  and not exists (select 1 from cotizaciones z where z.oportunidad_id = o.id)
  and not exists (
        select 1 from actividades a
         where a.oportunidad_id = o.id
           and (a.realizada_at at time zone 'America/Lima')::date >= '${CORTE_IMPORT}')`;

const ABIERTA = `o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')`;

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

/* ── El estado tiene que existir ──────────────────────────────────────── */
const { rows: enumRows } = await bd.query(
  `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'etapa_oportunidad' and e.enumlabel = 'historico'`,
);
if (enumRows.length === 0) {
  console.error(
    "\n  ✗ La etapa 'historico' no existe todavía en la base.\n" +
      "    Aplicar primero la migración 0130:\n" +
      "      node --env-file=.env.local scripts/aplicar-migracion.mjs\n",
  );
  await bd.end();
  process.exit(1);
}

/* ── Revertir: devuelve a su etapa previa exactamente lo que se movió ─── */
if (REVERTIR) {
  if (!existsSync(RESPALDO)) {
    console.log(`  No hay respaldo en ${RESPALDO} — nada que revertir.`);
    await bd.end();
    process.exit(0);
  }
  const previo = JSON.parse(readFileSync(RESPALDO, "utf8"));
  await bd.query("begin");
  try {
    // Cada una vuelve a la etapa que tenía, no a una etapa común: eran cuatro
    // distintas (filtrada, seguimiento, cotizada, asignada). Y solo se toca lo
    // que sigue en 'historico': si alguien ya la retomó con el botón, se
    // respeta su decisión.
    const { rowCount } = await bd.query(
      `update oportunidades o
          set etapa = v.etapa_previa::etapa_oportunidad, updated_at = now()
         from (select unnest($1::uuid[]) id, unnest($2::text[]) etapa_previa) v
        where o.id = v.id and o.etapa = 'historico'`,
      [previo.oportunidades.map((p) => p.id), previo.oportunidades.map((p) => p.etapa_previa)],
    );
    await bd.query("commit");
    console.log(`  ✓ Devueltas a su etapa previa: ${rowCount} de ${previo.oportunidades.length}.`);
    if (rowCount < previo.oportunidades.length) {
      console.log(`    (las ${previo.oportunidades.length - rowCount} restantes ya no estaban en 'historico')`);
    }
  } catch (e) {
    await bd.query("rollback");
    console.error("\n  ✗ ROLLBACK, no se cambió nada:", e.message);
    process.exitCode = 1;
  }
  await bd.end();
  process.exit(process.exitCode ?? 0);
}

/* ── Los números, ANTES ───────────────────────────────────────────────── */
const { rows: antes } = await bd.query(`
  select coalesce(p.codigo_comercial, '(sin dueño)') cc,
         coalesce(p.nombre, '—') comercial,
         count(*) filter (where ${ABIERTA})::int abiertas_hoy,
         count(*) filter (where ${ES_FOSIL})::int al_historico,
         count(*) filter (where ${ABIERTA} and not (${ES_FOSIL}))::int quedan_abiertas,
         count(*) filter (where o.origen = 'historico_excel' and ${ABIERTA} and not (${ES_FOSIL}))::int
           de_ellas_historicas_vivas
    from oportunidades o
    left join perfiles p on p.id = o.comercial_id
   group by 1, 2
  having count(*) filter (where ${ABIERTA}) > 0
   order by 1`);

const { rows: [total] } = await bd.query(`
  select count(*) filter (where ${ABIERTA})::int abiertas_hoy,
         count(*) filter (where ${ES_FOSIL})::int al_historico,
         count(*) filter (where ${ABIERTA} and not (${ES_FOSIL}))::int quedan_abiertas
    from oportunidades o`);

const { rows: porEtapa } = await bd.query(`
  select o.etapa::text etapa, count(*)::int n
    from oportunidades o where ${ES_FOSIL} group by 1 order by 2 desc`);

// La agenda vencida de cada comercial: el número del reclamo, y la prueba de
// que el criterio hace lo que se dijo que iba a hacer.
const { rows: vencidas } = await bd.query(`
  select coalesce(p.codigo_comercial, '(sin dueño)') cc,
         count(*) filter (where ${ABIERTA} and o.proxima_accion_at < (now() at time zone 'America/Lima')::date)::int
           vencidas_hoy,
         count(*) filter (where ${ABIERTA} and not (${ES_FOSIL})
                            and o.proxima_accion_at < (now() at time zone 'America/Lima')::date)::int
           vencidas_despues
    from oportunidades o
    left join perfiles p on p.id = o.comercial_id
   group by 1
  having count(*) filter (where ${ABIERTA} and o.proxima_accion_at < (now() at time zone 'America/Lima')::date) > 0
   order by 1`);

// Una muestra de lo que se QUEDA, que es lo que hay que mirar con lupa: si acá
// aparece una negociación viva mal clasificada, el criterio está mal.
const { rows: muestraViva } = await bd.query(`
  select coalesce(p.codigo_comercial, '?') cc, cu.razon_social, o.etapa::text etapa,
         (select max(a.realizada_at)::date from actividades a where a.oportunidad_id = o.id) ult_gestion,
         (select count(*)::int from cotizaciones z where z.oportunidad_id = o.id) cots,
         o.cierre_proyectado
    from oportunidades o
    left join perfiles p on p.id = o.comercial_id
    left join cuentas cu on cu.id = o.cuenta_id
   where o.origen = 'historico_excel' and ${ABIERTA} and not (${ES_FOSIL})
   order by ult_gestion desc nulls last
   limit 12`);

console.log(`\n════ ANTES ════`);
console.log(`  Abiertas hoy: ${total.abiertas_hoy.toLocaleString("es-PE")}`);
console.log(`  Al histórico: ${total.al_historico.toLocaleString("es-PE")}`);
console.log(`  Quedan abiertas: ${total.quedan_abiertas.toLocaleString("es-PE")}`);

console.log(`\n════ POR COMERCIAL ════`);
console.table(antes);

console.log(`\n════ DE QUÉ ETAPA SALEN LOS FÓSILES ════`);
console.table(porEtapa);

console.log(`\n════ GESTIONES VENCIDAS EN LA AGENDA (el reclamo) ════`);
console.table(vencidas);

console.log(`\n════ LAS 12 HISTÓRICAS VIVAS MÁS RECIENTES — NO SE TOCAN ════`);
console.table(
  muestraViva.map((r) => ({
    cc: r.cc,
    cliente: String(r.razon_social ?? "").slice(0, 44),
    etapa: r.etapa,
    ultima_gestion: r.ult_gestion?.toISOString().slice(0, 10) ?? "—",
    cotizaciones: r.cots,
    cierre_proyectado: r.cierre_proyectado?.toISOString().slice(0, 10) ?? "—",
  })),
);

if (!APLICAR) {
  console.log(`\n  Ensayo. No se escribió NADA. Para aplicarlo: agregar --aplicar\n`);
  await bd.end();
  process.exit(0);
}

/* ── Respaldo antes de escribir ───────────────────────────────────────── */
// Con la etapa PREVIA de cada una: son cuatro distintas, y sin eso la vuelta
// atrás sería una adivinanza.
const { rows: aMover } = await bd.query(`
  select o.id, o.etapa::text etapa_previa, o.origen,
         coalesce(p.codigo_comercial, '(sin dueño)') cc,
         cu.razon_social
    from oportunidades o
    left join perfiles p on p.id = o.comercial_id
    left join cuentas cu on cu.id = o.cuenta_id
   where ${ES_FOSIL}
   order by 4, 5`);

mkdirSync(dirname(RESPALDO), { recursive: true });
writeFileSync(
  RESPALDO,
  JSON.stringify(
    {
      que_es: "Oportunidades pasadas a etapa 'historico' el 31-08-2026 (migración 0130). Revertir con --revertir.",
      criterio: { origen: "historico_excel", corte_import: CORTE_IMPORT, sin_cotizacion: true, sin_cierre_proyectado: true },
      generado_at: new Date().toISOString(),
      total: aMover.length,
      antes: { total, por_comercial: antes },
      oportunidades: aMover.map((r) => ({ id: r.id, etapa_previa: r.etapa_previa, cc: r.cc, razon_social: r.razon_social })),
    },
    null,
    1,
  ),
  "utf8",
);
console.log(`\n  respaldo → ${RESPALDO}`);

/* ── Aplicar, todo dentro de una transacción ──────────────────────────── */
await bd.query("begin");
let movidas = 0;
try {
  const { rowCount } = await bd.query(
    `update oportunidades o set etapa = 'historico', updated_at = now()
      where o.id = any($1::uuid[]) and ${ABIERTA}`,
    [aMover.map((r) => r.id)],
  );
  movidas = rowCount;

  // Verificación DENTRO de la transacción: si los números no cuadran con lo
  // que dijo el ensayo, se deshace todo. Más vale no hacer nada que dejar la
  // cartera de alguien a medio archivar.
  if (movidas !== aMover.length) {
    throw new Error(`se movieron ${movidas} y el respaldo tiene ${aMover.length}`);
  }
  const { rows: [chequeo] } = await bd.query(`
    select count(*) filter (where ${ABIERTA})::int abiertas,
           count(*) filter (where o.etapa = 'historico')::int en_historico
      from oportunidades o`);
  if (chequeo.abiertas !== total.quedan_abiertas) {
    throw new Error(`quedaron ${chequeo.abiertas} abiertas y se esperaban ${total.quedan_abiertas}`);
  }
  await bd.query("commit");
  console.log(`\n  ✓ ${movidas.toLocaleString("es-PE")} oportunidades pasadas al histórico.`);
  console.log(`    Quedan ${chequeo.abiertas.toLocaleString("es-PE")} abiertas.`);
} catch (e) {
  await bd.query("rollback");
  console.error("\n  ✗ ROLLBACK, no se cambió nada:", e.message);
  await bd.end();
  process.exit(1);
}

/* ── Los números, DESPUÉS ─────────────────────────────────────────────── */
const { rows: despues } = await bd.query(`
  select coalesce(p.codigo_comercial, '(sin dueño)') cc,
         count(*) filter (where ${ABIERTA})::int abiertas,
         count(*) filter (where o.etapa = 'historico')::int en_historico,
         count(*) filter (where ${ABIERTA} and o.proxima_accion_at < (now() at time zone 'America/Lima')::date)::int
           vencidas
    from oportunidades o
    left join perfiles p on p.id = o.comercial_id
   group by 1
  having count(*) filter (where ${ABIERTA}) > 0 or count(*) filter (where o.etapa = 'historico') > 0
   order by 1`);

console.log(`\n════ DESPUÉS ════`);
console.table(despues);
console.log(`\n  Para deshacerlo entero:`);
console.log(`    node --env-file=.env.local scripts/sanear-oportunidades-fosiles.mjs --revertir\n`);

await bd.end();
