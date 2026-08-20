-- ============================================================
-- CRM EFAMEINSA · Migración 0040 · Supervisión diaria de comerciales
-- ============================================================
-- Pedido del ing. Carlos desde la vista de gerencia (reunión 19-08):
--   1) agenda diaria de cada comercial
--   2) reporte de las gestiones realizadas en el día
--   3) indicador de mínimo 30 seguimientos efectivos por comercial/día
--   4) cotizaciones ejecutadas
-- Detallado en docs/08-plan-supervision-diaria.md — leer antes de tocar esto.
--
-- "Seguimiento efectivo" = contacto real con el cliente: tipo de actividad en
-- (llamada, whatsapp, email, visita) Y el resultado NO es "No contestó". Se
-- excluye tipo='nota' a propósito: son 1.560 registros del histórico Excel
-- importado (uno por venta), y contarlos contaminaría el indicador desde el
-- primer día. Los intentos sin contacto (NO_CONTESTO) se cuentan aparte, no
-- se descartan, para que el trabajo del comercial no "desaparezca".
--
-- Las cotizaciones de este indicador son SOLO las de la tabla `cotizaciones`
-- (las hechas en el CRM). NO se cuentan las de `cotizaciones_historicas`
-- (2.644 documentos anteriores al CRM, migración 0036): son de otros años,
-- no de "hoy".
--
-- La meta (30) vive en `parametros` para que gerencia la cambie sin redeploy.

insert into parametros (clave, valor, descripcion)
values ('meta_seguimientos_diarios', 30, 'Seguimientos efectivos mínimos por comercial por día')
on conflict (clave) do nothing;

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
begin
  if not es_backoffice() then
    raise exception 'No autorizado';
  end if;

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
           'ventas', coalesce(v.n, 0),
           'monto_vendido_usd', coalesce(v.monto_usd, 0),
           'agenda_pendiente', coalesce(o.pendiente, 0),
           'agenda_vencida', coalesce(o.vencida, 0),
           'primera_gestion', a.primera,
           'ultima_gestion', a.ultima
         ) order by coalesce(a.efectivos, 0) desc, p.codigo_comercial), '[]'::jsonb)
  into v_comerciales
  from perfiles p
  -- Actividades del día: efectivas (contacto real) vs intentos sin contacto.
  -- `nota` queda fuera de la lista de tipos a propósito (ver comentario de
  -- arriba); `resultado_id is null` cuenta como efectivo — el tipo ya implica
  -- que hubo contacto por ese canal.
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
  -- Desglose por tipo, aparte y ya agrupado (evita un jsonb_object_agg con
  -- claves repetidas sobre filas sueltas): cuenta TODA actividad de esos
  -- tipos ese día, efectiva o no, para que los chips sumen el total real.
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
  -- Cotizaciones registradas HOY en el CRM (no el archivo histórico).
  left join lateral (
    select count(*) as n
    from cotizaciones cz
    join oportunidades o2 on o2.id = cz.oportunidad_id
    where o2.comercial_id = p.id
      and (cz.created_at at time zone 'America/Lima')::date = v_fecha
  ) cz on true
  -- Ventas cerradas hoy (fecha_venta es `date`: se compara tal cual, sin
  -- conversión de zona — convertirla la correría un día, lección de fechas.ts).
  left join lateral (
    select count(*) as n,
           coalesce(sum(case when v.moneda = 'USD' then v.monto_total else v.monto_total / v_tc end), 0) as monto_usd
    from ventas v
    join oportunidades o3 on o3.id = v.oportunidad_id
    where o3.comercial_id = p.id and o3.origen = 'crm' and v.fecha_venta = v_fecha
  ) v on true
  -- Agenda: pendiente = programada para hoy y sin gestión hoy en esa
  -- oportunidad; vencida = quedó atrás y la oportunidad sigue abierta.
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
    'ventas', coalesce(sum((c->>'ventas')::int), 0),
    'comerciales_en_meta', coalesce(sum(((c->>'cumple_meta')::boolean)::int), 0),
    'comerciales_sin_actividad', coalesce(sum((
      (c->>'seguimientos_efectivos')::int = 0 and (c->>'intentos_sin_contacto')::int = 0
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

revoke all on function supervision_diaria(date) from public;
grant execute on function supervision_diaria(date) to authenticated;

comment on function supervision_diaria(date) is
  'Supervisión diaria de comerciales para gerencia (docs/08-plan-supervision-diaria.md): seguimientos efectivos del día, cotizaciones y ventas del día (solo tabla cotizaciones/ventas del CRM, NUNCA cotizaciones_historicas), y agenda pendiente/vencida. Solo backoffice.';
