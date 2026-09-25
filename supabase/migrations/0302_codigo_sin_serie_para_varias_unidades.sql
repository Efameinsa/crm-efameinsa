-- 0302 · Un código para varias unidades que no llevan serie (Lesly, 25-09).
--
-- «Cuando me solicitan código no me sale la cantidad de cuántos necesitan;
-- es que los coches no están ingresados por serie: es un código para varios
-- de ese modelo». La lista de equipos del pedido pide una serie por unidad y
-- cada serie entra al parque instalado (garantía, preventivo a los 4 meses).
-- Un coche o un carro de lavandería no tiene placa ni parque: el almacén les
-- pone el código del modelo, el mismo para todas las unidades. Con la función
-- de siempre, repetir el código fundía todas en una sola ficha del parque.
--
-- · pedido_equipos.sin_serie: la unidad lleva un código de modelo, no una serie.
-- · registrar_codigo_sin_serie(item, código): pone ese código a TODAS las
--   unidades del mismo artículo del pedido que no tienen serie, sin crear
--   fichas en el parque. Central ve el pedido completo igual que con series.

alter table public.pedido_equipos add column if not exists sin_serie boolean not null default false;
comment on column public.pedido_equipos.sin_serie is
  'La unidad lleva el código del modelo (coches, carros…), no una serie de placa: no entra al parque instalado (0302).';

create or replace function public.registrar_codigo_sin_serie(p_item uuid, p_codigo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_it     record;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_n      integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa, el almacén o Central registran el código';
  end if;
  if v_codigo = '' then raise exception 'Escriba el código del modelo'; end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese artículo no está en el pedido'; end if;

  update pedido_equipos
     set serie = v_codigo, sin_serie = true
   where servicio_id = v_it.servicio_id
     and btrim(descripcion) = btrim(v_it.descripcion)
     and serie is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Todas las unidades de ese artículo ya tienen código o serie'; end if;
  return v_n;
end $$;

grant execute on function public.registrar_codigo_sin_serie(uuid, text) to authenticated;
