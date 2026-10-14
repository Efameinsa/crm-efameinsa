-- EL PROTOCOLO DE LOS EQUIPOS EN STOCK (Lesly, operaciones, 14-10: «que
-- tenga la opción de subir los protocolos de equipo que son de stock»).
--
-- Hasta hoy el protocolo de prueba vivía solo en la máquina de un pedido
-- (pedido_equipos, 0260 → 0471). Pero el almacén prueba también las máquinas
-- que están en stock, antes de que nadie las compre: ese protocolo no tenía
-- dónde ir.
--
-- Santos, 14-10: por serie, y se hereda. Un protocolo de stock lleva lo mismo
-- que el de un pedido —N.º, ficha (equipo, modelo de placa, serie, técnico,
-- fechas), fotos, video, PDF/Word y la hoja de chequeo— guardado igual, con la
-- clave «principal». Cuando el almacén lo da por terminado y esa serie aparece
-- en un pedido (o ya estaba en uno sin protocolo), el protocolo pasa entero a
-- esa máquina del pedido: ahí solo falta el clic de «Probada y embalada»,
-- porque el embalaje es de ese despacho. Desde que pasó, se corrige en el
-- pedido (con el candado de la 0450), no aquí.
--
-- Las reglas viven en la base (lección de la 0461): terminar pide lo mismo que
-- probar una máquina del pedido (protocolo_falta_en_maquina).

create table if not exists public.protocolos_stock (
  id                uuid primary key default gen_random_uuid(),
  descripcion       text not null check (length(btrim(descripcion)) between 2 and 300),
  serie             text not null check (length(btrim(serie)) between 2 and 80),
  protocolo_ref     text,
  protocolo_nota    text,
  protocolo_fecha   date,
  protocolo_fotos   jsonb not null default '[]'::jsonb,
  protocolo_datos   jsonb not null default '{}'::jsonb,
  protocolo_chequeo jsonb not null default '{}'::jsonb,
  terminado_at      timestamptz,
  terminado_por     uuid references public.perfiles(id),
  -- La máquina del pedido que se lo llevó (pedido_equipos.id).
  heredado_por      uuid,
  heredado_at       timestamptz,
  creado_por        uuid references public.perfiles(id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  es_prueba         boolean not null default es_cuenta_prueba()
);

comment on table public.protocolos_stock is
  'Protocolo de prueba de una máquina en stock, por serie (0474). Al terminarlo pasa a la máquina del pedido con la misma serie.';

create unique index if not exists uq_protocolos_stock_serie on public.protocolos_stock (upper(btrim(serie)), es_prueba);

drop trigger if exists trg_protocolos_stock_updated on public.protocolos_stock;
create trigger trg_protocolos_stock_updated before update on public.protocolos_stock
  for each row execute function set_updated_at();

alter table public.protocolos_stock enable row level security;

create or replace function public.puede_protocolo_stock()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(es_almacen(), false) or coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)
      or coalesce(es_operaciones(), false) or coalesce(es_soporte(), false) or coalesce(rol_actual() in ('gerencia', 'admin'), false);
$$;
grant execute on function public.puede_protocolo_stock() to authenticated;

drop policy if exists protocolos_stock_lectura on public.protocolos_stock;
create policy protocolos_stock_lectura on public.protocolos_stock for select to authenticated
using (es_prueba = (select es_cuenta_prueba()) and (select puede_protocolo_stock()));

-- Se escribe solo por las funciones de abajo.
grant select on public.protocolos_stock to authenticated;
grant all on public.protocolos_stock to service_role;

-- ------------------------------------------------------------
-- Pasar el protocolo terminado a una máquina del pedido.

create or replace function public.protocolo_stock_para_serie(p_serie text, p_es_prueba boolean)
returns public.protocolos_stock
language sql
stable
security definer
set search_path = public
as $$
  select * from protocolos_stock
   where upper(btrim(serie)) = upper(btrim(split_part(coalesce(p_serie, ''), '/', 1)))
     and es_prueba = p_es_prueba and terminado_at is not null and heredado_por is null
   limit 1;
$$;

-- La máquina del pedido sin nada de protocolo todavía: no se pisa lo que el almacén ya subió ahí.
create or replace function public.pedido_equipo_sin_protocolo(p_ref text, p_fotos jsonb, p_chequeo jsonb, p_prueba timestamptz)
returns boolean
language sql
immutable
as $$
  select p_prueba is null
     and nullif(btrim(coalesce(p_ref, '')), '') is null
     and jsonb_array_length(case when jsonb_typeof(p_fotos) = 'array' then p_fotos else '[]'::jsonb end) = 0
     and coalesce(p_chequeo, '{}'::jsonb) = '{}'::jsonb;
$$;

create or replace function public.nota_heredada_de_stock(v public.protocolos_stock)
returns text
language sql
immutable
as $$
  select concat_ws(' · ',
    'Probada en stock' || coalesce(' (protocolo ' || nullif(btrim(v.protocolo_ref), '') || ')', ''),
    nullif(btrim(coalesce(v.protocolo_nota, '')), ''));
$$;

-- Al poner (o cambiar) la serie de una máquina del pedido.
create or replace function public.pedido_equipo_hereda_protocolo_de_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v protocolos_stock;
begin
  if new.serie is null or coalesce(new.sin_serie, false) then return new; end if;
  if tg_op = 'UPDATE' and new.serie is not distinct from old.serie then return new; end if;
  if not pedido_equipo_sin_protocolo(new.protocolo_ref, new.protocolo_fotos, new.protocolo_chequeo, new.prueba_lista_at) then return new; end if;
  v := protocolo_stock_para_serie(new.serie, new.es_prueba);
  if v.id is null then return new; end if;
  new.protocolo_ref := v.protocolo_ref;
  new.protocolo_nota := nota_heredada_de_stock(v);
  new.protocolo_fecha := v.protocolo_fecha;
  new.protocolo_fotos := v.protocolo_fotos;
  new.protocolo_datos := v.protocolo_datos;
  -- El cliente de la hoja de chequeo era «stock»: en el pedido sale el del pedido.
  new.protocolo_chequeo := v.protocolo_chequeo #- '{principal,datos,cliente}';
  update protocolos_stock set heredado_por = new.id, heredado_at = now() where id = v.id;
  return new;
end $$;

drop trigger if exists ae_hereda_protocolo_de_stock on public.pedido_equipos;
create trigger ae_hereda_protocolo_de_stock before insert or update of serie on public.pedido_equipos
  for each row execute function pedido_equipo_hereda_protocolo_de_stock();

-- Al terminar el protocolo de stock, si la serie ya está en un pedido esperando prueba.
create or replace function public.protocolo_stock_pasar_a_pedido(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v protocolos_stock;
  v_item uuid;
begin
  select * into v from protocolos_stock where id = p_id and terminado_at is not null and heredado_por is null for update;
  if v.id is null then return null; end if;
  select pe.id into v_item
    from pedido_equipos pe
   where upper(btrim(split_part(coalesce(pe.serie, ''), '/', 1))) = upper(btrim(v.serie))
     and not coalesce(pe.sin_serie, false)
     and pe.es_prueba = v.es_prueba
     and pedido_equipo_sin_protocolo(pe.protocolo_ref, pe.protocolo_fotos, pe.protocolo_chequeo, pe.prueba_lista_at)
   order by pe.created_at desc
   limit 1
   for update;
  if v_item is null then return null; end if;
  update pedido_equipos
     set protocolo_ref = v.protocolo_ref,
         protocolo_nota = nota_heredada_de_stock(v),
         protocolo_fecha = v.protocolo_fecha,
         protocolo_fotos = v.protocolo_fotos,
         protocolo_datos = v.protocolo_datos,
         protocolo_chequeo = v.protocolo_chequeo #- '{principal,datos,cliente}'
   where id = v_item;
  update protocolos_stock set heredado_por = v_item, heredado_at = now() where id = v.id;
  return v_item;
end $$;
revoke all on function public.protocolo_stock_pasar_a_pedido(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Lo que hace la pantalla.

create or replace function public.protocolo_stock_editable(p_id uuid)
returns protocolos_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v protocolos_stock;
begin
  if not puede_protocolo_stock() then
    raise exception 'El protocolo lo llena el almacén, postventa u operaciones';
  end if;
  select * into v from protocolos_stock where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v.id is null then raise exception 'Ese protocolo de stock no existe'; end if;
  if v.heredado_por is not null then
    raise exception 'Este protocolo ya pasó al pedido de esa serie: corríjalo desde el informe de prueba y embalaje del pedido.';
  end if;
  return v;
end $$;
revoke all on function public.protocolo_stock_editable(uuid) from public, anon, authenticated;

create or replace function public.protocolo_stock_crear(p_descripcion text, p_serie text, p_protocolo_ref text, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_cliente text;
  v_datos jsonb;
begin
  if not puede_protocolo_stock() then
    raise exception 'El protocolo lo llena el almacén, postventa u operaciones';
  end if;
  if length(btrim(coalesce(p_descripcion, ''))) < 2 then raise exception 'Diga qué equipo es (ej.: LAVADORA UNIMAC 30 KG)'; end if;
  if length(v_serie) < 2 then raise exception 'Escriba la serie como se lee en la placa'; end if;
  if exists (select 1 from protocolos_stock where upper(btrim(serie)) = v_serie and es_prueba = coalesce(es_cuenta_prueba(), false)) then
    raise exception 'La serie % ya tiene protocolo de stock: ábralo desde la lista.', v_serie;
  end if;
  select coalesce(s.cliente_texto, 'otro pedido') into v_cliente
    from pedido_equipos pe join servicios_postventa s on s.id = pe.servicio_id
   where upper(btrim(split_part(coalesce(pe.serie, ''), '/', 1))) = v_serie
     and pe.es_prueba = coalesce(es_cuenta_prueba(), false)
     and not pedido_equipo_sin_protocolo(pe.protocolo_ref, pe.protocolo_fotos, pe.protocolo_chequeo, pe.prueba_lista_at)
   limit 1;
  if v_cliente is not null then
    raise exception 'La serie % ya tiene protocolo en el pedido de %: súbalo allí.', v_serie, regexp_replace(v_cliente, '^\d{8,11}\s*-\s*', '');
  end if;
  v_datos := jsonb_strip_nulls(jsonb_build_object(
    'equipo', left(upper(coalesce(nullif(btrim(coalesce(p_datos->>'equipo', '')), ''), btrim(p_descripcion))), 200),
    'serie', v_serie,
    'modelo', nullif(left(btrim(coalesce(p_datos->>'modelo', '')), 200), ''),
    'tecnico', nullif(left(btrim(coalesce(p_datos->>'tecnico', '')), 200), ''),
    'fecha_ejecucion', nullif(btrim(coalesce(p_datos->>'fecha_ejecucion', '')), '')));
  insert into protocolos_stock (descripcion, serie, protocolo_ref, protocolo_datos, protocolo_fecha)
  values (left(btrim(p_descripcion), 300), v_serie, nullif(left(btrim(coalesce(p_protocolo_ref, '')), 60), ''),
          jsonb_build_object('principal', v_datos), (v_datos->>'fecha_ejecucion')::date)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.protocolo_stock_cabecera(p_id uuid, p_protocolo_ref text, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform protocolo_stock_editable(p_id);
  update protocolos_stock
     set protocolo_ref = nullif(left(btrim(coalesce(p_protocolo_ref, '')), 60), ''),
         protocolo_nota = nullif(left(btrim(coalesce(p_nota, '')), 500), '')
   where id = p_id;
end $$;

create or replace function public.protocolo_stock_archivos(p_id uuid, p_archivos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform protocolo_stock_editable(p_id);
  if jsonb_typeof(p_archivos) <> 'array' or jsonb_array_length(p_archivos) = 0 then raise exception 'Elija al menos un archivo'; end if;
  update protocolos_stock set protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || p_archivos where id = p_id;
end $$;

-- Los mismos campos y la misma limpieza que datos_del_protocolo (0417).
create or replace function public.protocolo_stock_datos(p_id uuid, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limpio jsonb := '{}'::jsonb;
  v_clave text;
  v_valor text;
  v_fecha date;
  v protocolos_stock;
begin
  v := protocolo_stock_editable(p_id);
  foreach v_clave in array array['equipo', 'modelo', 'serie', 'tecnico', 'elaborado', 'fecha_ejecucion', 'fecha_informe'] loop
    v_valor := nullif(btrim(coalesce(p_datos ->> v_clave, '')), '');
    if v_valor is null then continue; end if;
    if v_clave like 'fecha_%' then
      begin
        v_fecha := v_valor::date;
      exception when others then
        raise exception 'Revise la fecha (%)', v_valor;
      end;
      if v_fecha > (now() at time zone 'America/Lima')::date then raise exception 'La fecha no puede ser futura'; end if;
      if v_fecha < date '2015-01-01' then raise exception 'Revise el año de la fecha'; end if;
      v_valor := v_fecha::text;
    end if;
    v_limpio := v_limpio || jsonb_build_object(v_clave, left(v_valor, 200));
  end loop;
  -- La serie de la ficha es la del protocolo: no se puede repetir.
  if v_limpio ? 'serie' and upper(v_limpio->>'serie') <> upper(btrim(v.serie)) then
    if exists (select 1 from protocolos_stock where upper(btrim(serie)) = upper(v_limpio->>'serie') and es_prueba = v.es_prueba and id <> p_id) then
      raise exception 'La serie % ya tiene otro protocolo de stock', upper(v_limpio->>'serie');
    end if;
  end if;
  update protocolos_stock
     set protocolo_datos = jsonb_set(coalesce(protocolo_datos, '{}'::jsonb), '{principal}', v_limpio),
         protocolo_fecha = case when v_limpio ? 'fecha_ejecucion' then (v_limpio->>'fecha_ejecucion')::date else protocolo_fecha end,
         serie = coalesce(upper(v_limpio->>'serie'), serie),
         descripcion = coalesce(v_limpio->>'equipo', descripcion)
   where id = p_id;
end $$;

create or replace function public.protocolo_stock_chequeo(p_id uuid, p_chequeo jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform protocolo_stock_editable(p_id);
  if jsonb_typeof(p_chequeo) <> 'object' or coalesce(p_chequeo ->> 'plantilla', '') = '' then raise exception 'El chequeo no tiene plantilla'; end if;
  if length(p_chequeo::text) > 20000 then raise exception 'El chequeo es demasiado largo: acorte las observaciones'; end if;
  update protocolos_stock
     set protocolo_chequeo = jsonb_build_object('principal', p_chequeo || jsonb_build_object('guardado_at', now(), 'guardado_por', auth.uid()))
   where id = p_id;
end $$;

-- Lo que falta para darlo por terminado: lo mismo que una máquina del pedido.
create or replace function public.protocolo_stock_falta(p_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v protocolos_stock;
  f text[] := '{}';
begin
  select * into v from protocolos_stock where id = p_id;
  if v.id is null then return array['Ese protocolo de stock no existe']; end if;
  if nullif(btrim(coalesce(v.protocolo_ref, '')), '') is null then f := f || 'Equipo: N.º de protocolo'::text; end if;
  return f || protocolo_falta_en_maquina(
    'Equipo', coalesce(v.protocolo_datos->'principal', '{}'), coalesce(v.protocolo_chequeo->'principal', '{}'),
    v.protocolo_fotos, v.serie,
    protocolo_es_lavadora(v.descripcion, v.protocolo_datos->'principal', null), false);
end $$;
grant execute on function public.protocolo_stock_falta(uuid) to authenticated;

-- Devuelve la máquina del pedido a la que pasó, si ya había una esperando.
create or replace function public.protocolo_stock_terminar(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v protocolos_stock;
  f text[];
begin
  v := protocolo_stock_editable(p_id);
  if v.terminado_at is not null then return protocolo_stock_pasar_a_pedido(p_id); end if;
  f := protocolo_stock_falta(p_id);
  if array_length(f, 1) > 0 then
    raise exception 'Todavía no se puede dar por terminado. Falta: %', array_to_string(f, ' · ');
  end if;
  update protocolos_stock set terminado_at = now(), terminado_por = auth.uid() where id = p_id;
  return protocolo_stock_pasar_a_pedido(p_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'protocolo_stock_crear(text, text, text, jsonb)', 'protocolo_stock_cabecera(uuid, text, text)',
    'protocolo_stock_archivos(uuid, jsonb)', 'protocolo_stock_datos(uuid, jsonb)',
    'protocolo_stock_chequeo(uuid, jsonb)', 'protocolo_stock_terminar(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Piloto local: la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.protocolos_stock';
    execute 'create trigger zz_sync after insert or update or delete on public.protocolos_stock for each row execute function sync.capturar(''id'')';
  end if;
end $$;
