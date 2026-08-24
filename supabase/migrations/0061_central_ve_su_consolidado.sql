-- ============================================================
-- CRM EFAMEINSA · Migración 0061 · Central puede leer su consolidado del día
-- ============================================================
-- `supervision_diaria()` exigía es_backoffice() —gerencia o admin—, así que a
-- Central la función le respondía "No autorizado" y su consolidado salía vacío.
--
-- El gerente lo pidió expresamente el 24-08: Central necesita saber cuántos
-- derivó y cuántas cotizaciones salieron, porque es el conteo que hasta ahora
-- armaba a mano en su Excel y le reportaba al ingeniero. Sin eso se quedó sin
-- forma de hacer su parte.
--
-- Se le abre la MISMA función en vez de crearle una propia, a propósito: que
-- Central y gerencia miren números distintos del mismo día es exactamente lo
-- que este sistema vino a terminar. Central ya ve los importes de las ventas
-- —procesa los informes de cierre, que los llevan— así que esto no le expone
-- nada que no tuviera.

create or replace function supervision_diaria(p_fecha date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
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
           'codigo_anterior', p.codigo_anterior,
           'seguimientos_efectivos', coalesce(a.efectivos, 0),
           'intentos_sin_contacto', coalesce(a.intentos, 0),
           'cumple_meta', coalesce(a.efectivos, 0) >= v_meta,
           'por_tipo', coalesce(pt.por_tipo, '{}'::jsonb),
           'cotizaciones', coalesce(cz.n, 0),
           'cotizaciones_archivo', coalesce(cha.n, 0),
           'ventas', coalesce(v.n, 0),
           'monto_vendido_usd', coalesce(v.monto_usd, 0),
           'informes_emitidos', coalesce(inf.n, 0),
           'derivados', coalesce(der.n, 0),
           'agenda_pendiente', coalesce(o.pendiente, 0),
           'agenda_vencida', coalesce(o.vencida, 0),
           'primera_gestion', a.primera,
           'ultima_gestion', a.ultima
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
    where a.realizada_por = p.id
      and (a.realizada_at at time zone 'America/Lima')::date = v_fecha
      and a.tipo in ('llamada', 'whatsapp', 'email', 'visita')
  ) a on true
  left join lateral (
    select coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) as por_tipo
    from (
      select a.tipo::text as tipo, count(*) as n
      from actividades a
      where a.realizada_por = p.id
        and (a.realizada_at at time zone 'America/Lima')::date = v_fecha
      group by a.tipo
    ) t
  ) pt on true
  left join lateral (
    select count(*) as n
    from cotizaciones c
    join oportunidades o2 on o2.id = c.oportunidad_id
    where o2.comercial_id = p.id
      and (c.created_at at time zone 'America/Lima')::date = v_fecha
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
    where o3.comercial_id = p.id and o3.origen = 'crm' and v.fecha_venta = v_fecha
  ) v on true
  left join lateral (
    select count(*) as n
    from informes_cierre i
    where i.creado_por = p.id
      and i.emitido_at is not null
      and (i.emitido_at at time zone 'America/Lima')::date = v_fecha
  ) inf on true
  -- Leads que Central le derivó ese día (migración 0059).
  left join lateral (
    select count(*) as n
    from leads l
    where l.asignado_a = p.id
      and l.asignado_at is not null
      and (l.asignado_at at time zone 'America/Lima')::date = v_fecha
  ) der on true
  left join lateral (
    select
      count(*) filter (
        where o.proxima_accion_at = v_fecha
          and not exists (
            select 1 from actividades a3
            where a3.oportunidad_id = o.id
              and (a3.realizada_at at time zone 'America/Lima')::date = v_fecha
          )
      ) as pendiente,
      count(*) filter (where o.proxima_accion_at < v_fecha) as vencida
    from oportunidades o
    where o.comercial_id = p.id
      and o.etapa not in ('venta', 'rechazada', 'derivada')
  ) o on true
  where p.rol = 'comercial' and p.activo;

  select jsonb_build_object(
    'seguimientos_efectivos', coalesce(sum((c->>'seguimientos_efectivos')::int), 0),
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
end $$;
