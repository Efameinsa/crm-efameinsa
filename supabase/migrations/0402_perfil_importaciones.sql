-- 0402 · El perfil de Importaciones (Santos, 06-10: entra Marco Antonio
-- Velásquez Agurto, «área de importaciones, crea el perfil»).
--
-- Importaciones trae lo que el almacén no tiene: las máquinas de un pedido que
-- quedaron sin stock por importación (0378). Hasta hoy nadie veía esa lista ni
-- había dónde anotar cuándo llega. Ahora:
--   · la llave `es_importaciones` en el perfil (como `es_almacen`, sobre el rol
--     comercial: no tiene cartera propia, así que no ve clientes ni precios);
--   · la fecha estimada de llegada y una nota por máquina;
--   · una lista con lo pendiente (definer: el perfil no necesita leer pedidos).

alter table public.perfiles add column if not exists es_importaciones boolean not null default false;
comment on column public.perfiles.es_importaciones is 'Área de importaciones: ve lo que falta importar para los pedidos y anota cuándo llega (0402).';

create or replace function public.es_importaciones()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select es_importaciones from perfiles where id = auth.uid()), false)
$$;
grant execute on function public.es_importaciones() to authenticated;

alter table public.pedido_equipos
  add column if not exists importacion_eta date,
  add column if not exists importacion_nota text,
  add column if not exists importacion_actualizada_at timestamptz,
  add column if not exists importacion_actualizada_por uuid references public.perfiles(id);
comment on column public.pedido_equipos.importacion_eta is 'Fecha estimada en que llega la máquina importada (0402).';

-- Quién ve la lista y anota: importaciones, almacén, operaciones, gerencia y admin.
create or replace function public.puede_importaciones()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce de todo: sin sesión rol_actual() es nulo y un «nulo» dejaba pasar.
  select coalesce(es_importaciones() or es_almacen() or es_backoffice() or rol_actual() in ('gerencia', 'admin', 'operaciones'), false)
$$;
grant execute on function public.puede_importaciones() to authenticated;

-- Lo que falta: las máquinas de pedidos abiertos que siguen sin serie. Se
-- devuelven también las que no tienen motivo, para que importaciones o el
-- almacén digan si hay que importarlas.
create or replace function public.importaciones_pendientes()
returns table (
  item_id uuid,
  pedido_id uuid,
  cliente text,
  descripcion text,
  sku text,
  motivo text,
  marcado_at timestamptz,
  eta date,
  nota text,
  actualizada_at timestamptz,
  pedido_desde timestamptz,
  tipo_pedido text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not puede_importaciones() then raise exception 'Solo importaciones, almacén, operaciones o gerencia ven esta lista'; end if;
  return query
    select pe.id, sp.id,
           coalesce(c.razon_social, sp.cliente_texto, '—'),
           pe.descripcion, pe.sku, pe.sin_stock_motivo, pe.sin_stock_at,
           pe.importacion_eta, pe.importacion_nota, pe.importacion_actualizada_at,
           coalesce(sp.pedido_generado_at, sp.liquidacion_at, sp.created_at),
           sp.tipo_pedido
      from pedido_equipos pe
      join servicios_postventa sp on sp.id = pe.servicio_id
      left join cuentas c on c.id = sp.cuenta_id
     where pe.serie is null
       and coalesce(pe.sin_serie, false) = false
       and pe.parte_de is null
       and sp.cerrado_at is null
       and sp.despachado_at is null
       and not coalesce(sp.es_prueba, false)
       and not coalesce(sp.regularizado, false)
     order by (pe.sin_stock_motivo = 'importacion') desc nulls last, pe.importacion_eta nulls last, 11;
end $$;
grant execute on function public.importaciones_pendientes() to authenticated;

-- Anotar la llegada: fecha estimada y nota. Marca el motivo «importación» si no
-- lo tenía. Igual que el motivo, vale para las unidades iguales del pedido.
create or replace function public.importacion_anotar(p_item uuid, p_eta date, p_nota text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_it record;
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not puede_importaciones() then raise exception 'Solo importaciones, almacén, operaciones o gerencia anotan la llegada'; end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Esa máquina no está en el pedido'; end if;
  if v_it.serie is not null then raise exception 'Esa máquina ya tiene serie: ya llegó'; end if;
  update pedido_equipos
     set importacion_eta = p_eta,
         importacion_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         importacion_actualizada_at = now(),
         importacion_actualizada_por = auth.uid(),
         sin_stock_motivo = coalesce(sin_stock_motivo, 'importacion'),
         sin_stock_at = coalesce(sin_stock_at, now()),
         sin_stock_por = coalesce(sin_stock_por, auth.uid())
   where servicio_id = v_it.servicio_id
     and btrim(descripcion) = btrim(v_it.descripcion)
     and serie is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function public.importacion_anotar(uuid, date, text) to authenticated;
