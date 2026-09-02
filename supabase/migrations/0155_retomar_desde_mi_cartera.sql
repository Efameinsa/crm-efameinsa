-- ============================================================
-- CRM EFAMEINSA · Migración 0155 · «Retomar» también desde Mi cartera
-- ============================================================
-- Santos, 02-09, después del archivado de fósiles: Ariana no encontraba a
-- BECERRA ROJAS SEBASTIAN. Sí estaba —en su cartera, con RUC—, pero sus dos
-- oportunidades habían pasado a `historico` (0130) y en «Mis oportunidades»
-- ya no salía. Santos lo encontró por Mi cartera y preguntó: «no hay botón
-- retomar, ¿no sería buena idea que también ellos puedan retomar?».
--
-- Mi cartera es la pantalla natural para buscar a un cliente por nombre; el
-- botón estaba en la ficha, en Histórico y en la base de Mi día, pero no en la
-- lista donde la gente lo busca primero. Para dibujarlo ahí, la lista tiene
-- que decir qué oportunidad archivada devolver: la más reciente en
-- `historico` de ese cliente. Si el cliente ya tiene una abierta, no hay nada
-- que retomar y la fila no cambia.
--
-- Cambio: `listar_clientes` devuelve además `historica_id` (uuid o null).
-- Solo lectura; el permiso de retomar lo sigue validando
-- `trabajar_oportunidad_historica` (0130) en cada clic.
-- ============================================================

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
  -- 0155: la archivada más reciente de cada cliente, para el botón «Retomar»
  -- de la lista. `created_at` es la fecha del Excel, la que dice cuál es la
  -- última gestión que se le hizo.
  agg_historica as (
    select distinct on (cuenta_id) cuenta_id, id as historica_id
    from oportunidades where etapa = 'historico' and cerrada_at is null
    order by cuenta_id, created_at desc
  ),
  base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.distrito, c.departamento, c.comercial_id,
           c.ultima_venta_at, c.created_at, c.rubro_id,
           (c.carpetas_servidor is not null) as con_servidor,
           p.nombre as comercial_nombre, p.codigo_comercial,
           coalesce(ab.abiertas, 0) as abiertas,
           coalesce(av.n_ventas, 0) as n_ventas,
           coalesce(av.total_usd, 0) as total_usd,
           ah.historica_id
    from cuentas c
    left join perfiles p on p.id = c.comercial_id
    left join agg_ventas av on av.cuenta_id = c.id
    left join agg_abiertas ab on ab.cuenta_id = c.id
    left join agg_historica ah on ah.cuenta_id = c.id
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

comment on function public.listar_clientes(text, uuid, boolean, boolean, text, integer, integer, text) is
  'Lista paginada de clientes con compras, abiertas, servidor, rubro y (0155) la oportunidad archivada más reciente para «Retomar».';
