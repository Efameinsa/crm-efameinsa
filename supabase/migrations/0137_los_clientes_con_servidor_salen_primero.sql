-- ============================================================
-- CRM EFAMEINSA · Migración 0137 · Los clientes con servidor salen primero
-- ============================================================
-- Santos, 31-08, tras autorizar la auto-vinculación masiva (782 cuentas
-- conectadas a su carpeta del servidor por nombre exacto): «que ellos se
-- encuentren primero en las listas para reconocerlo mientras tomamos
-- decisiones sobre el resto». Dos cambios sobre la definición VIVA de
-- listar_clientes (última tocada en la 0129):
--
--   1. La fila dice si el cliente tiene carpeta vinculada (`con_servidor`),
--      para que la lista lo marque visualmente — la marca es de la pantalla,
--      el dato es de acá.
--   2. Los vinculados salen PRIMERO, y dentro de cada grupo se respeta el
--      orden que el usuario eligió. Es un énfasis deliberadamente temporal:
--      cuando el vínculo sea lo normal y no la novedad, este primer criterio
--      se quita y la lista vuelve a ordenar solo por lo elegido.

create or replace function public.listar_clientes(
  p_q text default null::text,
  p_comercial uuid default null::uuid,
  p_solo_con_venta boolean default false,
  p_solo_sin_doc boolean default false,
  p_orden text default 'recientes'::text,
  p_limite integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_total bigint;
  v_filas jsonb;
  v_q     text := nullif(trim(coalesce(p_q, '')), '');
  v_tel   text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
begin
  -- Misma regla que RLS: backoffice y central ven todo; un comercial solo su cartera.
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
  end if;

  with agg_ventas as (
    select o.cuenta_id, count(*) as n_ventas,
           coalesce(sum(v.monto_total) filter (where v.moneda = 'USD'), 0) as total_usd
    from ventas v join oportunidades o on o.id = v.oportunidad_id
    group by o.cuenta_id
  ),
  agg_abiertas as (
    select cuenta_id, count(*) as abiertas
    from oportunidades where etapa not in ('venta', 'rechazada', 'derivada', 'historico')
    group by cuenta_id
  ),
  base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.distrito, c.departamento, c.comercial_id,
           c.ultima_venta_at, c.created_at,
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
