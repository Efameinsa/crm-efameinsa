-- ============================================================
-- CRM EFAMEINSA · Migración 0037 · El conteo usa el archivo real de cotizaciones
-- ============================================================
-- Observado por Darwin (19-08 noche) mirando "Mi gestión" de C5: 11
-- cotizaciones este mes, 0 el mes anterior, y 11 otra vez en 90 días, en el
-- año y en 12 meses. "No parece coherente."
--
-- El filtro estaba bien (julio da 0, agosto da 11: todas las cotizaciones del
-- CRM se hicieron en agosto, así que cualquier período que contenga agosto da
-- 11). El problema real era otro y más serio: en el mismo panel convivían dos
-- números con BASES DISTINTAS —
--   · "Ventas" cuenta histórico Excel + CRM  → 112 en 2026
--   · "Cotizaciones" contaba SOLO el CRM     → 11 siempre
-- que leídos de corrido dicen "112 ventas con 11 cotizaciones". Es el mismo
-- error que la migración 0023 corrigió en el embudo (el 94 % de cierre falso),
-- y pega justo en el indicador que Carlos pidió para medir a Central y a los
-- comerciales ("¿qué cantidad de presupuestos han registrado?").
--
-- Las cotizaciones anteriores al CRM nunca se importaron, pero SÍ sabemos
-- cuántas hubo: 887 de las 894 ventas históricas guardan su N° de presupuesto
-- en ventas.referencia_historica. Se expone como cot_historicas_periodo (y
-- por comercial) para que la vista pueda decir "11 en el CRM + N del
-- histórico" en vez de un 11 que se lee como toda la actividad del año.
--
-- LÍMITE HONESTO, que la UI declara: del histórico solo se conocen los
-- presupuestos que TERMINARON EN VENTA (se importaron las ventas, no las
-- hojas de cotización completas), así que ese número es un piso, no el total
-- de lo que se cotizó. Desde que los comerciales coticen en el CRM, el conteo
-- pasa a ser exacto.
--
-- Recrea resumen_gerencia completa (base: 0032, que trae ventas por empresa).

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
    -- Presupuestos del histórico Excel: solo los que terminaron en venta
    -- (fecha_venta es `date`, no lleva conversión de zona).
    -- Ahora sale del archivo real de cotizaciones (migración 0036, 2.644
    -- documentos). Antes se deducía de ventas.referencia_historica, o sea que
    -- solo contaba los presupuestos que TERMINARON EN VENTA y subrepresentaba
    -- la gestión: Katerine aparecía con 104 en 2026 cuando emitió 996.
    'cot_historicas_periodo', (select count(*) from cotizaciones_historicas ch
                                where ch.fecha between p_desde and p_hasta
                                  and (p_comercial is null or ch.comercial_id = p_comercial)
                                  and p_incluir_historico),
    'clientes_con_venta',    (select count(*) from compradores),
    'clientes_nuevos',       (select count(*) from compradores where not recurrente),
    'clientes_recurrentes',  (select count(*) from compradores where recurrente),
    'monto_recurrentes_usd', coalesce((select sum(monto_usd) from compradores where recurrente), 0),
    'monto_nuevos_usd',      coalesce((select sum(monto_usd) from compradores where not recurrente), 0),
    'cltv_promedio_usd',     coalesce((select avg(total_usd) from cltv), 0),
    'cltv_recurrentes_usd',  coalesce((select avg(total_usd) from cltv where n >= 2), 0),
    'clientes_historicos',   (select count(*) from cltv),
    'clientes_recurrentes_historicos', (select count(*) from cltv where n >= 2),
    'frecuencia_promedio',   coalesce((select avg(n) from cltv), 0),
    'ventas_serie',          (select jsonb_build_object(
        'efameinsa_usd', coalesce(sum(case when moneda='USD' then monto_total else monto_total / v_tc end) filter (where serie = 'EFAMEINSA'), 0),
        'open_usd',      coalesce(sum(case when moneda='USD' then monto_total else monto_total / v_tc end) filter (where serie = 'OPEN'), 0),
        'sin_serie_usd', coalesce(sum(case when moneda='USD' then monto_total else monto_total / v_tc end) filter (where serie is null), 0),
        'n_efameinsa',   count(*) filter (where serie = 'EFAMEINSA'),
        'n_open',        count(*) filter (where serie = 'OPEN'),
        'n_sin_serie',   count(*) filter (where serie is null)
      ) from ventas_p)
  ) into v_kpis;

  with meses as (
    select generate_series(date_trunc('month', p_hasta) - interval '11 months', date_trunc('month', p_hasta), interval '1 month')::date as mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ventas_usd', coalesce(x.ventas_usd, 0),
           'n_ventas', coalesce(x.n, 0),
           'efameinsa_usd', coalesce(x.efameinsa_usd, 0),
           'open_usd', coalesce(x.open_usd, 0),
           'sin_serie_usd', coalesce(x.sin_serie_usd, 0)
         ) order by m.mes), '[]'::jsonb)
  into v_serie
  from meses m
  left join lateral (
    select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as ventas_usd, count(*) as n,
           sum(case when moneda='USD' then monto_total else monto_total / v_tc end) filter (where serie = 'EFAMEINSA') as efameinsa_usd,
           sum(case when moneda='USD' then monto_total else monto_total / v_tc end) filter (where serie = 'OPEN') as open_usd,
           sum(case when moneda='USD' then monto_total else monto_total / v_tc end) filter (where serie is null) as sin_serie_usd
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
           'cot_historicas', coalesce(vs.presupuestos_historicos, 0),
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
    select count(*) as sin_monto,
           (select count(*) from cotizaciones_historicas ch2
              where ch2.comercial_id = p.id
                and ch2.fecha between p_desde and p_hasta
                and p_incluir_historico) as presupuestos_historicos
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
