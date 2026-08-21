-- ============================================================
-- CRM EFAMEINSA · Migración 0053 · Informes de cierre en la supervisión
-- ============================================================
-- Carlos mira la supervisión diaria para saber si el comercial trabajó. Si ese
-- día cerró una venta, lo que sigue es emitir el informe para Central: sin él,
-- la venta está cerrada pero no se factura ni se despacha.
--
-- Con "ventas: 2 · informes: 1" el hueco se ve solo, sin tener que entrar a
-- cada ficha a comprobarlo. Es el mismo criterio que las cotizaciones del
-- archivo (migración 0041): el número que falta se muestra al lado del que
-- está, no se deduce.
--
-- Se cuentan los EMITIDOS, no los borradores: un borrador no le llegó a nadie.

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
  if not es_backoffice() then
    raise exception 'No autorizado';
  end if;

  -- Documentos de ese día que no se pudieron atribuir a ningún comercial
  -- (la firma no traía el correo comercialN@…): se informan aparte para que
  -- la suma por comercial no parezca incompleta sin explicación.
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
        and a.tipo in ('llamada', 'whatsapp', 'email', 'visita')
      group by a.tipo
    ) t
  ) pt on true
  -- Cotizaciones hechas en el CRM ese día.
  left join lateral (
    select count(*) as n
    from cotizaciones cz
    join oportunidades o2 on o2.id = cz.oportunidad_id
    where o2.comercial_id = p.id
      and (cz.created_at at time zone 'America/Lima')::date = v_fecha
  ) cz on true
  -- Cotizaciones de ese día que están en el archivo de documentos (previas al
  -- CRM). `fecha` es columna date: se compara tal cual, sin conversión de zona.
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
  -- Informes de cierre EMITIDOS ese dia. Los borradores no cuentan: no le
  -- llegaron a Central, y el punto del dato es ver si la venta cerrada ya
  -- puede facturarse y despacharse.
  left join lateral (
    select count(*) as n
    from informes_cierre i
    where i.creado_por = p.id
      and i.emitido_at is not null
      and (i.emitido_at at time zone 'America/Lima')::date = v_fecha
  ) inf on true
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
