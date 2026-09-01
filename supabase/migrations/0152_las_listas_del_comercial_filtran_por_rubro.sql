-- ============================================================
-- CRM EFAMEINSA · Migración 0152 · Las listas del comercial filtran por rubro
-- ============================================================
-- Pedido del ing. Carlos (01-09, 16:56): «como no tengo en mi cabeza mis 500
-- clientes… necesito filtrar. Hoy me voy a centrar en mineras, que me
-- permita filtrar por rubros: mineras, hoteles, agro (…) 35 prospectos por
-- día es muy poco, voy a hacer 100».
--
-- Las tres funciones que paginan Mis oportunidades y Mi cartera
-- (`listar_oportunidades`, `contar_oportunidades_por_etapa`, `listar_clientes`)
-- reciben ahora `p_rubro`: un id de `catalogo_rubros`, o la palabra «sin»
-- para «las cuentas que todavía no tienen rubro» (hoy el 70 %: es lo que el
-- comercial tiene que ir completando). Se agrega al FINAL y con default
-- null, así las llamadas que ya existen siguen iguales. Cambiar la firma
-- obliga a soltar la vieja primero: `create or replace` con otra lista de
-- parámetros crearía una segunda función y PostgREST no sabría a cuál llamar.
--
-- Filtrar acá y no por fuera importa por la RLS: las oportunidades de un
-- comercial sobre cuentas que hoy son de otro (cartera traspasada, 0013) solo
-- las ve a través de estas funciones (security definer); un filtro hecho con
-- PostgREST desde la pantalla las perdía (182 de las 15.849 de Katerine).
-- ============================================================

create index if not exists ix_cuentas_rubro on cuentas (rubro_id);

drop function if exists public.listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer);
drop function if exists public.contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean);
drop function if exists public.listar_clientes(text, uuid, boolean, boolean, text, integer, integer);

create or replace function public.listar_oportunidades(
  p_q text default null, p_comercial uuid default null, p_etapa text default null,
  p_tipo_cliente text default null, p_desde date default null, p_hasta date default null,
  p_solo_crm boolean default false, p_orden text default 'reciente',
  p_limite integer default 50, p_offset integer default 0,
  p_rubro text default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_total bigint;
  v_filas jsonb;
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  -- Misma regla que el resto del CRM: backoffice y central ven todo; un
  -- comercial solo su cartera.
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
  end if;

  with cotiz_ultima as (
    select distinct on (c.oportunidad_id)
           c.oportunidad_id, c.estado_aprobacion
    from cotizaciones c
    order by c.oportunidad_id, c.created_at desc
  ),
  base as (
    select o.id, o.etapa, o.intencion, o.monto_estimado, o.moneda,
           o.proxima_accion, o.proxima_accion_at, o.updated_at, o.origen,
           c.id as cuenta_id, c.razon_social, c.tipo_doc,
           case
             when c.tipo_doc = 'RUC' then true
             when c.tipo_doc in ('DNI', 'CE') then false
             else es_razon_social_empresa(c.razon_social)
           end as es_empresa,
           cu.estado_aprobacion as cotizacion_estado
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join cotiz_ultima cu on cu.oportunidad_id = o.id
    where (p_comercial is null or o.comercial_id = p_comercial)
      and (p_etapa is null or o.etapa = p_etapa::etapa_oportunidad)
      and (coalesce(p_etapa, '') = 'historico' or o.etapa <> 'historico')
      and (not p_solo_crm or o.origen = 'crm')
      and (p_desde is null or o.proxima_accion_at >= p_desde)
      and (p_hasta is null or o.proxima_accion_at <= p_hasta)
      and (
        p_tipo_cliente is null
        or (p_tipo_cliente = 'empresa' and (
              c.tipo_doc = 'RUC' or (c.tipo_doc = 'SIN_DOC' and es_razon_social_empresa(c.razon_social))
            ))
        or (p_tipo_cliente = 'persona' and (
              c.tipo_doc in ('DNI', 'CE')
              or (c.tipo_doc = 'SIN_DOC' and not es_razon_social_empresa(c.razon_social))
            ))
      )
      -- El rubro de la cuenta: un id del catálogo, o «sin» para las que no tienen.
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      and (v_q is null or c.razon_social ilike '%' || v_q || '%')
  ),
  pagina as (
    select * from base
    order by
      case when p_orden = 'monto' then coalesce(monto_estimado, 0) end desc,
      case when p_orden = 'proxima_accion' then proxima_accion_at end asc nulls last,
      case when p_orden = 'cuenta' then razon_social end asc,
      updated_at desc
    limit p_limite offset p_offset
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(to_jsonb(pagina)) from pagina), '[]'::jsonb)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end $function$;

create or replace function public.contar_oportunidades_por_etapa(
  p_q text default null, p_comercial uuid default null, p_tipo_cliente text default null,
  p_desde date default null, p_hasta date default null, p_solo_crm boolean default false,
  p_rubro text default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_resultado jsonb;
begin
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
  end if;

  select coalesce(jsonb_object_agg(etapa::text, n), '{}'::jsonb) into v_resultado
  from (
    select o.etapa, count(*) as n
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    where (p_comercial is null or o.comercial_id = p_comercial)
      and (not p_solo_crm or o.origen = 'crm')
      and (p_desde is null or o.proxima_accion_at >= p_desde)
      and (p_hasta is null or o.proxima_accion_at <= p_hasta)
      and (
        p_tipo_cliente is null
        or (p_tipo_cliente = 'empresa' and (
              c.tipo_doc = 'RUC' or (c.tipo_doc = 'SIN_DOC' and es_razon_social_empresa(c.razon_social))
            ))
        or (p_tipo_cliente = 'persona' and (
              c.tipo_doc in ('DNI', 'CE')
              or (c.tipo_doc = 'SIN_DOC' and not es_razon_social_empresa(c.razon_social))
            ))
      )
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      and (v_q is null or c.razon_social ilike '%' || v_q || '%')
    group by o.etapa
  ) t;

  return v_resultado;
end $function$;

create or replace function public.listar_clientes(
  p_q text default null, p_comercial uuid default null, p_solo_con_venta boolean default false,
  p_solo_sin_doc boolean default false, p_orden text default 'recientes',
  p_limite integer default 50, p_offset integer default 0,
  p_rubro text default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_total bigint;
  v_filas jsonb;
  v_q     text := nullif(trim(coalesce(p_q, '')), '');
  v_tel   text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
begin
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
  end if;

  with agg_ventas as (
    select o.cuenta_id, count(*) as n_ventas,
           coalesce(sum(v.monto_total) filter (where v.moneda = 'USD'), 0) as total_usd
    from ventas v join oportunidades o on o.id = v.oportunidad_id
    where v.anulada_at is null
    group by o.cuenta_id
  ),
  agg_abiertas as (
    select cuenta_id, count(*) as abiertas
    from oportunidades where etapa not in ('venta', 'rechazada', 'derivada', 'historico')
    group by cuenta_id
  ),
  base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.distrito, c.departamento, c.comercial_id,
           c.ultima_venta_at, c.created_at, c.rubro_id,
           (c.carpetas_servidor is not null) as con_servidor,
           p.nombre as comercial_nombre, p.codigo_comercial,
           coalesce(ab.abiertas, 0) as abiertas,
           coalesce(av.n_ventas, 0) as n_ventas,
           coalesce(av.total_usd, 0) as total_usd
    from cuentas c
    left join perfiles p on p.id = c.comercial_id
    left join agg_ventas av on av.cuenta_id = c.id
    left join agg_abiertas ab on ab.cuenta_id = c.id
    where (p_comercial is null or c.comercial_id = p_comercial)
      and (not p_solo_con_venta or c.ultima_venta_at is not null)
      and (not p_solo_sin_doc or c.tipo_doc = 'SIN_DOC')
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      and (
        v_q is null
        or c.razon_social ilike '%' || v_q || '%'
        or c.nombre_comercial ilike '%' || v_q || '%'
        or c.num_doc ilike '%' || v_q || '%'
        or (v_tel is not null and length(v_tel) >= 6 and exists (
              select 1 from contactos ct where ct.cuenta_id = c.id and ct.telefono_normalizado like '%' || v_tel || '%'))
      )
  ),
  pagina as (
    select * from base
    order by
      con_servidor desc,
      case when p_orden = 'nombre' then razon_social end asc,
      case when p_orden = 'ultima_venta' then ultima_venta_at end desc nulls last,
      case when p_orden = 'valor' then total_usd end desc,
      created_at desc
    limit p_limite offset p_offset
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(to_jsonb(pagina)) from pagina), '[]'::jsonb)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end $function$;
