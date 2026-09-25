-- 0307 · Las gestiones de postventa cuentan en la supervisión del día (25-09).
--
-- Gerencia: «En el caso de PV1 y PV2, en las actividades realizadas o
-- gestiones, no se están contabilizando, doble check». Se contaban (salían
-- como «Postventa 4»), pero la tarjeta decía «Sin actividad registrada» y la
-- hora de la primera y la última gestión solo miraba las de venta. Ahora la
-- hora toma también las de postventa y quien solo hizo postventa no cuenta
-- como «sin actividad». Parche sobre la definición viva (no se copia a mano).

CREATE OR REPLACE FUNCTION public.supervision_diaria(p_fecha date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
  v_ini   timestamptz := v_fecha::timestamp at time zone 'America/Lima';
  v_fin   timestamptz := (v_fecha + 1)::timestamp at time zone 'America/Lima';
  v_meta  integer := coalesce((select valor::integer from parametros where clave = 'meta_seguimientos_diarios'), 30);
  v_tc    numeric := coalesce((select valor from parametros where clave = 'tc_usd_pen'), 3.75);
  v_comerciales jsonb;
  v_totales     jsonb;
  v_huerfanas   integer;
begin
  if not (es_backoffice() or rol_actual() = 'central'::rol_usuario) then
    raise exception 'No autorizado';
  end if;

  select count(*) into v_huerfanas
  from cotizaciones_historicas
  where fecha = v_fecha and comercial_id is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'nombre', p.nombre,
           'codigo', p.codigo_comercial,
           'es_postventa', p.es_postventa,
           'codigo_anterior', p.codigo_anterior,
           'seguimientos_efectivos', coalesce(a.efectivos, 0),
           'intentos_sin_contacto', coalesce(a.intentos, 0),
           'cumple_meta', coalesce(a.efectivos, 0) >= coalesce(p.meta_gestiones_diarias, v_meta),
           'meta_gestiones', coalesce(p.meta_gestiones_diarias, v_meta),
           'gestiones_postventa', coalesce(pv.n, 0),
           'hace_postventa', p.hace_postventa,
           'por_tipo', coalesce(pt.por_tipo, '{}'::jsonb),
           'cotizaciones', coalesce(cz.n, 0),
           'cotizaciones_archivo', coalesce(cha.n, 0),
           'ventas', coalesce(v.n, 0),
           'monto_vendido_usd', coalesce(v.monto_usd, 0),
           'informes_emitidos', coalesce(inf.n, 0),
           'derivados', coalesce(der.n, 0),
           'agenda_pendiente', coalesce(o.pendiente, 0),
           'agenda_vencida', coalesce(o.vencida, 0),
           'primera_gestion', least(a.primera, pv.primera),
           'ultima_gestion', greatest(a.ultima, pv.ultima)
         ) order by (coalesce(a.efectivos, 0) + coalesce(cz.n, 0) + coalesce(cha.n, 0)) desc, p.codigo_comercial), '[]'::jsonb)
  into v_comerciales
  from perfiles p
  left join lateral (
    select
      count(*) filter (where a.resultado_id is null or r.codigo is distinct from 'NO_CONTESTO') as efectivos,
      count(*) filter (where r.codigo = 'NO_CONTESTO') as intentos,
      min((a.realizada_at at time zone 'America/Lima')::time)
        filter (where a.resultado_id is null or r.codigo is distinct from 'NO_CONTESTO') as primera,
      max((a.realizada_at at time zone 'America/Lima')::time)
        filter (where a.resultado_id is null or r.codigo is distinct from 'NO_CONTESTO') as ultima
    from actividades a
    left join catalogo_resultados_gestion r on r.id = a.resultado_id
    left join oportunidades op_a on op_a.id = a.oportunidad_id
    where a.realizada_por = p.id
      and op_a.tipo_postventa is null
      and a.realizada_at >= v_ini and a.realizada_at < v_fin
      and a.tipo in ('llamada', 'whatsapp', 'email', 'visita', 'reunion_online')
  ) a on true
  left join lateral (
    select count(*) as n,
           min((a2.realizada_at at time zone 'America/Lima')::time) as primera,
           max((a2.realizada_at at time zone 'America/Lima')::time) as ultima
    from actividades a2
    join oportunidades op_b on op_b.id = a2.oportunidad_id
    where a2.realizada_por = p.id
      and a2.realizada_at >= v_ini and a2.realizada_at < v_fin
      and a2.tipo in ('llamada', 'whatsapp', 'email', 'visita', 'reunion_online')
      and op_b.tipo_postventa is not null
  ) pv on true
  left join lateral (
    select coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) as por_tipo
    from (
      select a.tipo::text as tipo, count(*) as n
      from actividades a
      where a.realizada_por = p.id
        and a.realizada_at >= v_ini and a.realizada_at < v_fin
      group by a.tipo
    ) t
  ) pt on true
  left join lateral (
    select count(*) as n
    from cotizaciones c
    join oportunidades o2 on o2.id = c.oportunidad_id
    where o2.comercial_id = p.id
      and c.created_at >= v_ini and c.created_at < v_fin
  ) cz on true
  left join lateral (
    select count(*) as n
    from cotizaciones_historicas ch
    where ch.comercial_id = p.id and ch.fecha = v_fecha
  ) cha on true
  left join lateral (
    select count(*) as n,
           coalesce(sum(case when v.moneda = 'USD' then v.monto_total else v.monto_total / v_tc end), 0) as monto_usd
    from ventas v
    join oportunidades o3 on o3.id = v.oportunidad_id
    where o3.comercial_id = p.id and o3.origen = 'crm' and v.fecha_venta = v_fecha and v.anulada_at is null
  ) v on true
  left join lateral (
    select count(*) as n
    from informes_cierre i
    where i.creado_por = p.id
      and i.emitido_at is not null
      and i.emitido_at >= v_ini and i.emitido_at < v_fin and i.anulado_at is null
  ) inf on true
  -- Leads que Central le derivó ese día (migración 0059).
  left join lateral (
    select count(*) as n
    from leads l
    where l.asignado_a = p.id
      and l.asignado_at is not null
      and l.asignado_at >= v_ini and l.asignado_at < v_fin
  ) der on true
  left join lateral (
    select
      count(*) filter (
        where o.proxima_accion_at = v_fecha
          and not exists (
            select 1 from actividades a3
            where a3.oportunidad_id = o.id
              and a3.realizada_at >= v_ini and a3.realizada_at < v_fin
          )
      ) as pendiente,
      count(*) filter (where o.proxima_accion_at < v_fecha) as vencida
    from oportunidades o
    where o.comercial_id = p.id
      and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
  ) o on true
  where p.rol = 'comercial' and p.activo and not p.es_prueba;

  select jsonb_build_object(
    'seguimientos_efectivos', coalesce(sum((c->>'seguimientos_efectivos')::int), 0),
    'gestiones_postventa', coalesce(sum((c->>'gestiones_postventa')::int), 0),
    'cotizaciones', coalesce(sum((c->>'cotizaciones')::int), 0),
    'cotizaciones_archivo', coalesce(sum((c->>'cotizaciones_archivo')::int), 0),
    'cotizaciones_archivo_sin_asesor', v_huerfanas,
    'ventas', coalesce(sum((c->>'ventas')::int), 0),
    'informes_emitidos', coalesce(sum((c->>'informes_emitidos')::int), 0),
    'derivados', coalesce(sum((c->>'derivados')::int), 0),
    'comerciales_en_meta', coalesce(sum(((c->>'cumple_meta')::boolean)::int), 0),
    'comerciales_sin_actividad', coalesce(sum((
      (c->>'seguimientos_efectivos')::int = 0
      and (c->>'intentos_sin_contacto')::int = 0
      and (c->>'cotizaciones')::int = 0
      and (c->>'cotizaciones_archivo')::int = 0
      and (c->>'gestiones_postventa')::int = 0
    )::int), 0)
  )
  into v_totales
  from jsonb_array_elements(v_comerciales) c;

  return jsonb_build_object(
    'fecha', v_fecha,
    'meta_seguimientos', v_meta,
    'comerciales', v_comerciales,
    'totales', v_totales
  );
end $function$;
