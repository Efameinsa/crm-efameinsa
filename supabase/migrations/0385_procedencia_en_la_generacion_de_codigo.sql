-- 0385 — LA PROCEDENCIA EN LA GENERACIÓN DE CÓDIGO
--
-- Lesly, 02-10 (lista de mejoras): «Almacén debe tener en la generación de
-- códigos tres opciones para marcar: importación, compra local, fabricación
-- (cuando la Central solicita la generación de código)».
--
-- 0378 ya guardaba esas tres razones, pero solo como «por qué NO hay stock»:
-- el disparador las borra al llegar la serie. Acá se guarda la procedencia de
-- cada máquina del pedido, que no se borra: la máquina importada sigue siendo
-- importada cuando ya tiene serie. Mientras no hay serie, la procedencia es
-- también el motivo de sin stock (los filtros de 0378 siguen igual).

alter table public.pedido_equipos
  add column if not exists procedencia text
    check (procedencia in ('importacion', 'compra_local', 'fabricacion')),
  add column if not exists procedencia_at timestamptz,
  add column if not exists procedencia_por uuid references public.perfiles(id);

comment on column public.pedido_equipos.procedencia is
  'De dónde sale la máquina (0385): importación, compra local o fabricación. La marca el almacén en la generación de código; no se borra al llegar la serie.';

-- Lo que el almacén ya había marcado como motivo de sin stock es su procedencia.
update public.pedido_equipos
   set procedencia = sin_stock_motivo,
       procedencia_at = sin_stock_at,
       procedencia_por = sin_stock_por
 where sin_stock_motivo is not null
   and procedencia is null;

create or replace function public.marcar_procedencia(p_item uuid, p_procedencia text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it record;
  v_p text := nullif(btrim(coalesce(p_procedencia, '')), '');
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo el almacén, postventa o Central marcan la procedencia';
  end if;
  if v_p is not null and v_p not in ('importacion', 'compra_local', 'fabricacion') then
    raise exception 'Procedencia no válida: importación, compra local o fabricación';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese artículo no está en el pedido'; end if;

  -- Como el código sin serie y el sin stock: las unidades iguales del pedido
  -- comparten la procedencia (cinco lavadoras importadas juntas).
  update pedido_equipos
     set procedencia = v_p,
         procedencia_at = case when v_p is null then null else now() end,
         procedencia_por = case when v_p is null then null else auth.uid() end,
         sin_stock_motivo = case when serie is null then v_p else sin_stock_motivo end,
         sin_stock_at = case when serie is null then (case when v_p is null then null else now() end) else sin_stock_at end,
         sin_stock_por = case when serie is null then (case when v_p is null then null else auth.uid() end) else sin_stock_por end
   where servicio_id = v_it.servicio_id
     and btrim(descripcion) = btrim(v_it.descripcion);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.marcar_procedencia(uuid, text) to authenticated;

-- El selector de sin stock de 0378 también deja la procedencia.
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

  update pedido_equipos
     set sin_stock_motivo = v_motivo,
         sin_stock_at = case when v_motivo is null then null else now() end,
         sin_stock_por = case when v_motivo is null then null else auth.uid() end,
         procedencia = v_motivo,
         procedencia_at = case when v_motivo is null then null else now() end,
         procedencia_por = case when v_motivo is null then null else auth.uid() end
   where servicio_id = v_it.servicio_id
     and btrim(descripcion) = btrim(v_it.descripcion)
     and serie is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

insert into _migraciones_aplicadas (archivo) values ('0385_procedencia_en_la_generacion_de_codigo.sql')
on conflict do nothing;
