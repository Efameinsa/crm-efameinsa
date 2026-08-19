-- ============================================================
-- CRM EFAMEINSA · Migración 0031 · Cotizaciones registradas + fechas Lima
-- ============================================================
-- Reunión con el ing. Carlos (19-08 tarde), tres hallazgos:
--
-- 1) "Katerine tiene 3 cotizaciones, pero ya mínimo serán diez": el panel
--    contaba solo cotizaciones con enviada_at (marcadas como enviadas).
--    En la base hay 11 REGISTRADAS en agosto y solo 3 marcadas enviadas.
--    Lo que gerencia controla es "¿cuántos presupuestos han registrado?"
--    → se agrega cot_creadas al KPI y a por_comercial (y la UI muestra
--    ambas: registradas y enviadas).
--
-- 2) "C8 está en cero": C8 tiene 55 ventas históricas pero solo 2 con
--    monto (su hoja Excel no registraba montos; solo C5 entregó su
--    consolidado de cierre de ventas). No es bug del panel, pero el panel
--    lo ocultaba → se agrega ventas_sin_monto a por_comercial para que la
--    fila diga "0 + 55 sin monto" en vez de un cero mudo. Los montos
--    llegan cuando gerencia entregue los consolidados de los demás.
--
-- 3) Bug latente de zona horaria: todos los cortes `timestamptz::date`
--    casteaban en UTC — una cotización registrada a las 8 pm de Lima caía
--    al día siguiente (y el 31 a la noche, al mes siguiente). Todos los
--    cortes de fecha pasan a hora de Lima. (fecha_venta es `date`, no se
--    toca — lección de lib/fechas.ts.)

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
    'op_creadas',            (select count(*) from op_p where (created_at at time zone 'America/Lima')::date between p_desde and p_hasta),
    'op_ganadas',            (select count(*) from op_p where etapa = 'venta' and (coalesce(cerrada_at, updated_at) at time zone 'America/Lima')::date between p_desde and p_hasta),
    'op_rechazadas',         (select count(*) from op_p where etapa = 'rechazada' and (cerrada_at at time zone 'America/Lima')::date between p_desde and p_hasta),
    'ventas_historicas_periodo', (select count(*) from oportunidades o where o.origen = 'historico_excel' and o.etapa = 'venta'
                                    and (coalesce(o.cerrada_at, o.created_at) at time zone 'America/Lima')::date between p_desde and p_hasta
                                    and (p_comercial is null or o.comercial_id = p_comercial)
                                    and p_incluir_historico),
    'leads_recibidos',       (select count(*) from leads where (recibido_at at time zone 'America/Lima')::date between p_desde and p_hasta
                                and (p_comercial is null or asignado_a = p_comercial)),
    'leads_publicidad',      (select count(*) from leads where (recibido_at at time zone 'America/Lima')::date between p_desde and p_hasta
                                and fuente in ('google_ads','meta_ads')
                                and (p_comercial is null or asignado_a = p_comercial)),
    'leads_sin_asignar',     (select count(*) from leads where estado = 'pendiente_triaje'),
    'cot_por_aprobar',       (select count(*) from cotizaciones where estado_aprobacion = 'pendiente_gerencia'),
    'cot_creadas',           (select count(*) from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
                                where (cz.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
                                and (p_comercial is null or o.comercial_id = p_comercial)),
    'cot_enviadas',          (select count(*) from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
                                where (cz.enviada_at at time zone 'America/Lima')::date between p_desde and p_hasta
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
    where (created_at at time zone 'America/Lima')::date between p_desde and p_hasta
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
           'cot_creadas', coalesce(cz.creadas, 0),
           'cot_enviadas', coalesce(cz.enviadas, 0),
           'cotizado_usd', coalesce(cz.cotizado, 0),
           'ventas_sin_monto', coalesce(vs.sin_monto, 0)
         ) order by coalesce(v.ventas_usd, 0) desc, p.codigo_comercial), '[]'::jsonb)
  into v_comercial
  from perfiles p
  left join lateral (
    select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as ventas_usd,
           count(*) as n, count(distinct cuenta_id) as clientes
    from _vd d where d.comercial_id = p.id and d.fecha_venta between p_desde and p_hasta
  ) v on true
  left join lateral (
    select count(*) filter (where (created_at at time zone 'America/Lima')::date between p_desde and p_hasta) as creadas,
           count(*) filter (where etapa not in ('venta','rechazada','derivada')) as abiertas,
           count(*) filter (where etapa = 'venta' and (coalesce(cerrada_at, updated_at) at time zone 'America/Lima')::date between p_desde and p_hasta) as ganadas,
           count(*) filter (where etapa = 'rechazada' and (cerrada_at at time zone 'America/Lima')::date between p_desde and p_hasta) as rechazadas,
           sum(monto_estimado) filter (where etapa not in ('venta','rechazada','derivada')) as pipeline
    from oportunidades o
    where o.comercial_id = p.id and o.origen = 'crm'
  ) o on true
  left join lateral (
    select count(*) filter (where (cz.created_at at time zone 'America/Lima')::date between p_desde and p_hasta) as creadas,
           count(*) filter (where (cz.enviada_at at time zone 'America/Lima')::date between p_desde and p_hasta) as enviadas,
           sum(cz.total) filter (where (cz.created_at at time zone 'America/Lima')::date between p_desde and p_hasta) as cotizado
    from cotizaciones cz join oportunidades o2 on o2.id = cz.oportunidad_id
    where o2.comercial_id = p.id
  ) cz on true
  left join lateral (
    -- Ventas del período SIN monto (mayormente históricas): la fila de venta
    -- no existe porque la hoja Excel no traía el importe. Se muestran para
    -- que "0 vendido" no parezca "0 ventas" (caso C8 en la reunión 19-08).
    select count(*) as sin_monto
    from oportunidades ox
    where ox.comercial_id = p.id and ox.etapa = 'venta'
      and (p_incluir_historico or ox.origen = 'crm')
      and (coalesce(ox.cerrada_at, ox.created_at) at time zone 'America/Lima')::date between p_desde and p_hasta
      and not exists (select 1 from ventas v2 where v2.oportunidad_id = ox.id)
  ) vs on true
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
    'primer_lead_publicidad',      (select (min(recibido_at) at time zone 'America/Lima')::date from leads where fuente in ('google_ads','meta_ads'))
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
