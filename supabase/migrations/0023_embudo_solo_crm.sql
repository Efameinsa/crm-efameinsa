-- ============================================================
-- CRM EFAMEINSA · Migración 0023 · Embudo solo con lo gestionado en el CRM
-- ============================================================
-- Reportado por Darwin (2026-08-18 noche): "Panel comercial · este mes"
-- mostraba 22 oportunidades creadas, 16 en venta y 94 % de tasa de cierre.
-- Causa: las 1.560 ventas históricas se importaron con created_at = fecha
-- de la venta y etapa 'venta' → 14 caían en agosto y entraban al embudo
-- como si hubieran avanzado por él. Un embudo de conversión solo tiene
-- sentido para oportunidades que el CRM vio nacer y moverse: desde ahora
-- embudo, tasa de cierre y conteos de oportunidades por comercial usan
-- únicamente origen = 'crm', y el KPI nuevo ventas_historicas_periodo dice
-- cuántas ventas del período vienen del Excel (no pasaron por el embudo).
-- Ventas, ticket, clientes, CLTV, serie mensual y vía de adquisición SÍ
-- siguen respetando el interruptor "Incluir histórico Excel".

create or replace function resumen_gerencia(
  p_desde date,
  p_hasta date,
  p_comercial uuid default null,
  p_incluir_historico boolean default true
)
returns jsonb
language plpgsql
volatile -- usa una tabla temporal (no permitido en stable); no escribe datos persistentes
security definer
set search_path = public
as $$
declare
  v_tc        numeric := coalesce((select valor from parametros where clave = 'tc_usd_pen'), 3.75);
  v_meses      integer := greatest(1,
                 (extract(year from p_hasta) - extract(year from p_desde)) * 12
                 + (extract(month from p_hasta) - extract(month from p_desde)) + 1);
  v_kpis       jsonb;
  v_serie      jsonb;
  v_embudo     jsonb;
  v_comercial  jsonb;
  v_via        jsonb;
  v_top        jsonb;
  v_calidad    jsonb;
begin
  if not es_backoffice() and (p_comercial is null or p_comercial <> auth.uid()) then
    raise exception 'No autorizado';
  end if;

  create temp table if not exists _vd on commit drop as select * from v_ventas_detalle where false;
  truncate _vd;
  insert into _vd select * from v_ventas_detalle
    where (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm');

  with ventas_p as (
    select * from _vd where fecha_venta between p_desde and p_hasta
  ),
  primera_venta as (
    select cuenta_id, min(fecha_venta) as primera from _vd group by cuenta_id
  ),
  compradores as (
    select vp.cuenta_id,
           sum(case when vp.moneda = 'USD' then vp.monto_total else vp.monto_total / v_tc end) as monto_usd,
           count(*) as n,
           (pv.primera < p_desde) as recurrente
    from ventas_p vp join primera_venta pv on pv.cuenta_id = vp.cuenta_id
    group by vp.cuenta_id, pv.primera
  ),
  cltv as (
    select cuenta_id,
           sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end) as total_usd,
           count(*) as n
    from _vd group by cuenta_id
  ),
  -- Embudo y tasa de cierre: SOLO oportunidades gestionadas en el CRM. Las
  -- ventas históricas nacieron cerradas desde el Excel (created_at = fecha
  -- de venta) y nunca pasaron por el embudo: incluirlas daba "94 % de
  -- cierre" en un mes con 16 ventas históricas y 1 rechazo real.
  op_p as (
    select * from oportunidades
    where (p_comercial is null or comercial_id = p_comercial)
      and origen = 'crm'
  )
  select jsonb_build_object(
    'tc_usd_pen',            v_tc,
    'meses_periodo',         v_meses,
    'ventas_usd',            coalesce((select sum(monto_total) from ventas_p where moneda = 'USD'), 0),
    'ventas_pen',            coalesce((select sum(monto_total) from ventas_p where moneda = 'PEN'), 0),
    'ventas_usd_equiv',      coalesce((select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) from ventas_p), 0),
    'n_ventas',              (select count(*) from ventas_p),
    'ticket_promedio_usd',   coalesce((select avg(case when moneda='USD' then monto_total else monto_total / v_tc end) from ventas_p), 0),
    'pipeline_usd',          coalesce((select sum(monto_estimado) from op_p where etapa not in ('venta','rechazada','derivada')), 0),
    'n_abiertas',            (select count(*) from op_p where etapa not in ('venta','rechazada','derivada')),
    'op_creadas',            (select count(*) from op_p where created_at::date between p_desde and p_hasta),
    'op_ganadas',            (select count(*) from op_p where etapa = 'venta' and coalesce(cerrada_at, updated_at)::date between p_desde and p_hasta),
    'op_rechazadas',         (select count(*) from op_p where etapa = 'rechazada' and cerrada_at::date between p_desde and p_hasta),
    'ventas_historicas_periodo', (select count(*) from oportunidades o where o.origen = 'historico_excel' and o.etapa = 'venta'
                                    and coalesce(o.cerrada_at, o.created_at)::date between p_desde and p_hasta
                                    and (p_comercial is null or o.comercial_id = p_comercial)
                                    and p_incluir_historico),
    'leads_recibidos',       (select count(*) from leads where recibido_at::date between p_desde and p_hasta
                                and (p_comercial is null or asignado_a = p_comercial)),
    'leads_publicidad',      (select count(*) from leads where recibido_at::date between p_desde and p_hasta
                                and fuente in ('google_ads','meta_ads')
                                and (p_comercial is null or asignado_a = p_comercial)),
    'leads_sin_asignar',     (select count(*) from leads where estado = 'pendiente_triaje'),
    'cot_por_aprobar',       (select count(*) from cotizaciones where estado_aprobacion = 'pendiente_gerencia'),
    'cot_enviadas',          (select count(*) from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
                                where cz.enviada_at::date between p_desde and p_hasta
                                and (p_comercial is null or o.comercial_id = p_comercial)),
    'clientes_con_venta',    (select count(*) from compradores),
    'clientes_nuevos',       (select count(*) from compradores where not recurrente),
    'clientes_recurrentes',  (select count(*) from compradores where recurrente),
    'monto_recurrentes_usd', coalesce((select sum(monto_usd) from compradores where recurrente), 0),
    'monto_nuevos_usd',      coalesce((select sum(monto_usd) from compradores where not recurrente), 0),
    'cltv_promedio_usd',     coalesce((select avg(total_usd) from cltv), 0),
    'cltv_recurrentes_usd',  coalesce((select avg(total_usd) from cltv where n >= 2), 0),
    'clientes_historicos',   (select count(*) from cltv),
    'clientes_recurrentes_historicos', (select count(*) from cltv where n >= 2),
    'frecuencia_promedio',   coalesce((select avg(n) from cltv), 0)
  ) into v_kpis;

  with meses as (
    select generate_series(date_trunc('month', p_hasta) - interval '11 months', date_trunc('month', p_hasta), interval '1 month')::date as mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ventas_usd', coalesce(x.ventas_usd, 0),
           'n_ventas', coalesce(x.n, 0)
         ) order by m.mes), '[]'::jsonb)
  into v_serie
  from meses m
  left join lateral (
    select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as ventas_usd, count(*) as n
    from _vd where date_trunc('month', fecha_venta)::date = m.mes
  ) x on true;

  select coalesce(jsonb_object_agg(etapa, n), '{}'::jsonb) into v_embudo
  from (
    select etapa::text, count(*) as n
    from oportunidades
    where created_at::date between p_desde and p_hasta
      and (p_comercial is null or comercial_id = p_comercial)
      and origen = 'crm'
    group by etapa
  ) e;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'nombre', p.nombre, 'codigo', p.codigo_comercial,
           'meta_mensual', p.meta_mensual,
           'meta_periodo', coalesce(p.meta_mensual, 0) * v_meses,
           'ventas_usd', coalesce(v.ventas_usd, 0),
           'n_ventas', coalesce(v.n, 0),
           'clientes', coalesce(v.clientes, 0),
           'op_creadas', coalesce(o.creadas, 0),
           'op_abiertas', coalesce(o.abiertas, 0),
           'op_ganadas', coalesce(o.ganadas, 0),
           'op_rechazadas', coalesce(o.rechazadas, 0),
           'pipeline_usd', coalesce(o.pipeline, 0),
           'cot_enviadas', coalesce(cz.enviadas, 0),
           'cotizado_usd', coalesce(cz.cotizado, 0)
         ) order by coalesce(v.ventas_usd, 0) desc, p.codigo_comercial), '[]'::jsonb)
  into v_comercial
  from perfiles p
  left join lateral (
    select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as ventas_usd,
           count(*) as n, count(distinct cuenta_id) as clientes
    from _vd d where d.comercial_id = p.id and d.fecha_venta between p_desde and p_hasta
  ) v on true
  left join lateral (
    select count(*) filter (where created_at::date between p_desde and p_hasta) as creadas,
           count(*) filter (where etapa not in ('venta','rechazada','derivada')) as abiertas,
           count(*) filter (where etapa = 'venta' and coalesce(cerrada_at, updated_at)::date between p_desde and p_hasta) as ganadas,
           count(*) filter (where etapa = 'rechazada' and cerrada_at::date between p_desde and p_hasta) as rechazadas,
           sum(monto_estimado) filter (where etapa not in ('venta','rechazada','derivada')) as pipeline
    from oportunidades o
    where o.comercial_id = p.id and o.origen = 'crm'
  ) o on true
  left join lateral (
    select count(*) as enviadas, sum(cz.total) as cotizado
    from cotizaciones cz join oportunidades o2 on o2.id = cz.oportunidad_id
    where o2.comercial_id = p.id and cz.enviada_at::date between p_desde and p_hasta
  ) cz on true
  where p.rol = 'comercial' and p.activo
    and (p_comercial is null or p.id = p_comercial);

  select coalesce(jsonb_agg(jsonb_build_object('via', via, 'n', n, 'monto_usd', monto_usd) order by monto_usd desc), '[]'::jsonb)
  into v_via
  from (
    select via_adquisicion as via, count(*) as n,
           sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as monto_usd
    from _vd where fecha_venta between p_desde and p_hasta
    group by via_adquisicion
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', cuenta_id, 'razon_social', razon_social, 'n', n, 'monto_usd', monto_usd,
           'comercial', comercial_nombre) order by monto_usd desc), '[]'::jsonb)
  into v_top
  from (
    select cuenta_id, min(razon_social) as razon_social, min(comercial_nombre) as comercial_nombre, count(*) as n,
           sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as monto_usd
    from _vd where fecha_venta between p_desde and p_hasta
    group by cuenta_id
    order by monto_usd desc
    limit 10
  ) x;

  select jsonb_build_object(
    'ventas_historicas_sin_monto', (select count(*) from oportunidades o where o.origen = 'historico_excel' and o.etapa = 'venta'
                                      and not exists (select 1 from ventas v where v.oportunidad_id = o.id)
                                      and (p_comercial is null or o.comercial_id = p_comercial)),
    'ventas_sin_serie',            (select count(*) from ventas where serie is null),
    'cuentas_sin_documento',       (select count(*) from cuentas c where c.tipo_doc = 'SIN_DOC'
                                      and (p_comercial is null or c.comercial_id = p_comercial)),
    'ventas_historicas_total',     (select count(*) from ventas where origen = 'historico_excel'),
    'ventas_crm_total',            (select count(*) from ventas where origen = 'crm'),
    'primer_lead_publicidad',      (select min(recibido_at)::date from leads where fuente in ('google_ads','meta_ads'))
  ) into v_calidad;

  return jsonb_build_object(
    'kpis', v_kpis,
    'serie_mensual', v_serie,
    'embudo', v_embudo,
    'por_comercial', v_comercial,
    'via_adquisicion', v_via,
    'top_clientes', v_top,
    'calidad_datos', v_calidad
  );
end $$;

revoke all on function resumen_gerencia(date, date, uuid, boolean) from public;
grant execute on function resumen_gerencia(date, date, uuid, boolean) to authenticated;
