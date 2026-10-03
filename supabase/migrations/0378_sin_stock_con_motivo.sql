-- 0378 — SIN STOCK, Y POR QUÉ: IMPORTACIÓN, COMPRA LOCAL O FABRICACIÓN
--
-- Reunión de postventa del 02-10 12:25. Carlos: «tenemos 113 pedidos por
-- despachar de 131… pero ¿por qué no despachas? Porque no tienes el producto.
-- Falta importar, o comprar localmente, o se está fabricando». Hoy «sin stock»
-- solo se deduce de `pedido_equipos.serie is null`, sin razón. «Esa opción la
-- debe marcar almacén… y te debería aparecer acá para filtrar».
--
-- Una máquina del pedido sin serie puede llevar su motivo. Lo marca el
-- almacén (también postventa, Central o backoffice, que hoy registran series).
-- Al llegar la serie, el motivo deja de importar: el disparador lo limpia.

alter table public.pedido_equipos
  add column if not exists sin_stock_motivo text
    check (sin_stock_motivo in ('importacion', 'compra_local', 'fabricacion')),
  add column if not exists sin_stock_at timestamptz,
  add column if not exists sin_stock_por uuid references public.perfiles(id);

create or replace function public.marcar_sin_stock(p_item uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo el almacén, postventa o Central marcan el stock';
  end if;
  if v_motivo is not null and v_motivo not in ('importacion', 'compra_local', 'fabricacion') then
    raise exception 'Motivo no válido: importación, compra local o fabricación';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese artículo no está en el pedido'; end if;
  if v_it.serie is not null then raise exception 'Esa máquina ya tiene serie: hay stock'; end if;

  -- Igual que el código sin serie: todas las unidades iguales del pedido que
  -- siguen sin serie comparten el motivo (cinco lavadoras importadas juntas).
  update pedido_equipos
     set sin_stock_motivo = v_motivo,
         sin_stock_at = case when v_motivo is null then null else now() end,
         sin_stock_por = case when v_motivo is null then null else auth.uid() end
   where servicio_id = v_it.servicio_id
     and btrim(descripcion) = btrim(v_it.descripcion)
     and serie is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.marcar_sin_stock(uuid, text) to authenticated;

create or replace function public.pedido_equipos_limpia_sin_stock()
returns trigger
language plpgsql
as $$
begin
  if new.serie is not null then
    new.sin_stock_motivo := null;
    new.sin_stock_at := null;
    new.sin_stock_por := null;
  end if;
  return new;
end $$;

drop trigger if exists ab_limpia_sin_stock on public.pedido_equipos;
create trigger ab_limpia_sin_stock
  before insert or update of serie on public.pedido_equipos
  for each row execute function public.pedido_equipos_limpia_sin_stock();

insert into _migraciones_aplicadas (archivo) values ('0378_sin_stock_con_motivo.sql')
on conflict do nothing;
