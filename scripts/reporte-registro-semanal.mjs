import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p=[]) => (await c.query(s, p)).rows;
// Uso: node --env-file=.env.local scripts/reporte-registro-semanal.mjs [desde] [hasta-exclusivo] [ayer]
// Mide, por usuario, cuántas gestiones responden las tres preguntas (qué hiciste,
// qué pasó, qué sigue), RUC y correo de los clientes tocados, intención,
// cotizaciones, cierres, Central y postventa. Es la base del reporte semanal que
// Carlos pidió el 04-09 (docs/19). «Sin interés» cierra la oportunidad y no
// exige «qué sigue»; las notas del sistema no cuentan.
const [DESDE = "2026-08-31", HASTA = "2026-09-05", AYER = "2026-09-03"] = process.argv.slice(2);
const HOY = new Date(new Date(AYER).getTime() + 86400000).toISOString().slice(0, 10);
const CANDADO = "2026-09-02 13:00"; // despliegue del «qué hacer» obligatorio (7ea249d)
// Solo gestiones de contacto hechas por una persona (las notas del sistema no cuentan).
const base = `
  with g as (
    select a.*, p.codigo_comercial cod,
      (a.realizada_at at time zone 'America/Lima')::date dia,
      (coalesce(length(trim(a.nota)),0) >= 4) as tiene_nota,
      (a.resultado_id is not null) as tiene_resultado,
      (a.resultado_id = 6) as cerro_sin_interes,
      (coalesce(length(trim(a.proxima_accion)),0) >= 3) as tiene_que_hacer,
      (a.proxima_accion_at is not null) as tiene_fecha
    from actividades a join perfiles p on p.id = a.realizada_por
    where not p.es_prueba and p.codigo_comercial is not null
      and a.tipo in ('llamada','whatsapp','email','visita','showroom','reunion_online')
      and (a.realizada_at at time zone 'America/Lima')::date >= $1 and (a.realizada_at at time zone 'America/Lima')::date < $2
  ), m as (
    select g.*, (tiene_nota and tiene_resultado) p2, (cerro_sin_interes or (tiene_que_hacer and tiene_fecha)) p3 from g
  )`;
const res = async (d, h, et) => {
  console.log(`\n===== ${et} =====`);
  console.table(await q(base + `select cod, count(*) n, count(distinct oportunidad_id) clientes,
    count(*) filter (where p2) p2_ok, count(*) filter (where not tiene_resultado) sin_resultado, count(*) filter (where not tiene_nota) sin_nota,
    count(*) filter (where p3) p3_ok, count(*) filter (where not p3 and tiene_fecha and not tiene_que_hacer) fecha_sin_que, count(*) filter (where not p3 and not tiene_fecha and tiene_que_hacer) que_sin_fecha, count(*) filter (where not p3 and not tiene_fecha and not tiene_que_hacer) nada,
    count(*) filter (where p2 and p3) completas, round(100.0*count(*) filter (where p2 and p3)/count(*)) pct,
    count(*) filter (where not tiene_resultado and not p3) solo_p1
    from m group by 1 order by 1`, [d, h]));
};
await res(DESDE, HASTA, "SEMANA 31-08 → 04-09 (solo gestiones de contacto)");
await res(AYER, HOY, "AYER 03-09");
await res("2026-09-02", HOY, "desde el candado (02-09 13:00 aprox: miércoles y jueves)");
console.log("\n===== antes/después del candado =====");
console.table(await q(base + `select cod, (realizada_at >= ($3::timestamp at time zone 'America/Lima')) despues, count(*) n, round(100.0*count(*) filter (where p2)/count(*)) pct_p2, round(100.0*count(*) filter (where p3)/count(*)) pct_p3, round(100.0*count(*) filter (where p2 and p3)/count(*)) pct_completas from m group by 1,2 order by 1,2`, [DESDE, HASTA, CANDADO]));
console.log("\n===== Katerine: qué le falta, por día =====");
console.table(await q(base + `select dia, count(*) n, count(*) filter (where p2 and p3) completas, count(*) filter (where not tiene_resultado) sin_resultado, count(*) filter (where not p3) sin_que_sigue from m where cod='C5' group by 1 order by 1`, [DESDE, HASTA]));
console.log("\n===== clientes tocados: sin RUC según origen (crm = registrado por la comercial; histórico = venía del Excel) =====");
console.table(await q(base + `select cod, case when o.origen='crm' then 'registrado en CRM' else 'histórico/Excel' end origen, count(distinct cu.id) clientes,
    count(distinct cu.id) filter (where cu.tipo_doc='SIN_DOC' or cu.num_doc is null or cu.num_doc='') sin_doc,
    count(distinct cu.id) filter (where not exists (select 1 from contactos k where k.cuenta_id=cu.id and coalesce(k.email,'')<>'')) sin_correo
  from m join oportunidades o on o.id=m.oportunidad_id join cuentas cu on cu.id=o.cuenta_id group by 1,2 order by 1,2`, [DESDE, HASTA]));
console.log("\n===== intención de las oportunidades tocadas =====");
console.table(await q(base + `select cod, count(distinct o.id) n, count(distinct o.id) filter (where o.intencion='sin_definir') sin_definir, round(100.0*count(distinct o.id) filter (where o.intencion='sin_definir')/count(distinct o.id)) pct from m join oportunidades o on o.id=m.oportunidad_id group by 1 order by 1`, [DESDE, HASTA]));
console.log("\n===== cotizaciones enviadas y cierres emitidos en la semana =====");
console.table(await q(`select p.codigo_comercial cod,
  (select count(*) from cotizaciones c where c.creada_por=p.id and c.enviada_at is not null and (c.enviada_at at time zone 'America/Lima')::date >= $1 and (c.enviada_at at time zone 'America/Lima')::date < $2) cotizaciones,
  (select count(*) from cotizaciones c where c.creada_por=p.id and c.enviada_at is not null and (c.enviada_at at time zone 'America/Lima')::date = $3) cotiz_ayer,
  (select count(*) from informes_cierre i where i.creado_por=p.id and i.emitido_at is not null and not i.es_prueba and (i.emitido_at at time zone 'America/Lima')::date >= $1 and (i.emitido_at at time zone 'America/Lima')::date < $2) cierres
  from perfiles p where p.codigo_comercial in ('C1','C4','C5','PV') order by 1`, [DESDE, HASTA, AYER]));
console.log("\n===== Central: contactos recibidos y derivados =====");
console.table(await q(`select (recibido_at at time zone 'America/Lima')::date dia, count(*) recibidos, count(*) filter (where estado='asignado') asignados, count(*) filter (where estado='derivado_area') derivados_area, count(*) filter (where estado='pendiente_triaje') pendientes,
  count(*) filter (where estado in ('duplicado','descartado')) dup_desc,
  round(percentile_cont(0.5) within group (order by extract(epoch from (asignado_at-recibido_at))/60) filter (where asignado_at is not null)) mediana_min,
  count(*) filter (where asignado_at is not null and asignado_at-recibido_at > interval '1 hour') mas_1h
  from leads where not es_prueba and (recibido_at at time zone 'America/Lima')::date >= $1 and (recibido_at at time zone 'America/Lima')::date < $2 group by 1 order by 1`, [DESDE, HASTA]));
console.log("\n===== Postventa (cuenta PV): pasos hechos en la semana =====");
console.table(await q(`select
  count(*) filter (where (aprobado_at at time zone 'America/Lima')::date >= $1) aprobados,
  count(*) filter (where (pago_confirmado_at at time zone 'America/Lima')::date >= $1) pagos_confirmados,
  count(*) filter (where (apertura_despacho_at at time zone 'America/Lima')::date >= $1) aperturas,
  count(*) filter (where (despachado_at at time zone 'America/Lima')::date >= $1) despachos,
  count(*) filter (where (plano_enviado_at at time zone 'America/Lima')::date >= $1) planos
  from servicios_postventa where not es_prueba`, [DESDE]));
console.table(await q(`select cliente_texto, aprobado_at::date apr, pago_confirmado_at::date pago, apertura_despacho_at::date apertura, despachado_at::date desp, numero_pedido_erp erp from servicios_postventa where not es_prueba and completado=false and cerrado_at is null and informe_cierre_id is not null order by pedido_ejecutado_at desc nulls last`));
console.log("\n===== fecha rara =====");
console.table(await q(`select p.nombre, a.realizada_at, a.tipo, left(a.nota,60) nota, a.proxima_accion_at from actividades a join perfiles p on p.id=a.realizada_por where a.realizada_at > now() + interval '1 day'`));
await c.end();
