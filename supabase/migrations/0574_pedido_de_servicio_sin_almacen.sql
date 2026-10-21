-- 0574 · EL PEDIDO DE SERVICIO NO PASA POR EL ALMACÉN. Santos, 21-10, después
-- de la 0572 (FAMILY FARMS, PED-0037-2026):
--
--   «Para hacer un pedido Central solicita un código al almacén… eso es de cara
--   a producto. Ahora el problema está en el servicio: en servicio no se pide
--   código, es solo escrito, entonces no tiene que enterarse almacén. Hay que
--   poner opción de servicio y el sistema debe pedir redactar o jalar la
--   cotización… esas líneas deberían estar dentro del recuadro… el nombre de
--   los servicios, cantidad, pero sin monto necesariamente, y en cada parte ella
--   debe poder editar de manera amigable».
--
-- Ahora:
--   · cada línea del pedido tiene CANTIDAD y un PRECIO opcional (un servicio va
--     en una línea con su cantidad, como en la cotización; un equipo sigue
--     siendo una fila por unidad);
--   · pasar_pedido_a_servicio: Central dice «es un servicio» y el pedido queda
--     como mantenimiento (o revisión/embalaje), sin las filas de equipo que se
--     hubieran sembrado y sin tocar al almacén;
--   · traer_lineas_del_cierre (0572), en un pedido de servicio, trae cada línea
--     con su cantidad y precio; si el cierre no trae líneas, las de la cotización;
--   · guardar_detalle_del_servicio: la tabla entera que Central editó (agregar,
--     corregir, quitar) se guarda de una vez y queda en las observaciones.

alter table pedido_equipos
  add column if not exists cantidad numeric not null default 1,
  add column if not exists precio numeric;

create or replace function public._es_pedido_de_servicio(p_tipo text)
 returns boolean
 language sql
 immutable
as $$ select coalesce(p_tipo, '') in ('mantenimiento', 'revision', 'embalaje') $$;

create or replace function public.pasar_pedido_a_servicio(p_servicio uuid, p_tipo text default 'mantenimiento')
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_s servicios_postventa;
begin
  v_s := _puede_editar_lista_del_pedido(p_servicio);
  if not _es_pedido_de_servicio(p_tipo) then raise exception 'Tipo de servicio no válido'; end if;
  if _es_pedido_de_servicio(v_s.tipo_pedido) then return; end if;
  if exists (select 1 from pedido_equipos where servicio_id = p_servicio
              and (prueba_lista_at is not null or jsonb_array_length(coalesce(protocolo_fotos, '[]'::jsonb)) > 0)) then
    raise exception 'El almacén ya probó o subió fotos de este pedido: es de producto, no se puede pasar a servicio';
  end if;
  -- Las filas de equipo sembradas sin trabajo del almacén se van: el servicio se escribe.
  delete from pedido_equipos where servicio_id = p_servicio and parte_de is not null;
  delete from pedido_equipos where servicio_id = p_servicio;
  update servicios_postventa set tipo_pedido = p_tipo where id = p_servicio;
  perform _anotar_en_el_pedido(p_servicio, 'lo marcó como pedido de SERVICIO: no pide código al almacén.');
end $$;

-- 0572 + cantidad/precio y la cotización de respaldo.
create or replace function public.traer_lineas_del_cierre(p_servicio uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_s        servicios_postventa;
  v_items    jsonb;
  v_item     jsonb;
  v_desc     text;
  v_cant     integer;
  v_series   text[];
  v_n        integer := 0;
  v_i        integer;
  v_ya       text[];
  v_servicio boolean;
  v_id       uuid;
  v_cot      uuid;
begin
  v_s := _puede_editar_lista_del_pedido(p_servicio);
  v_servicio := _es_pedido_de_servicio(v_s.tipo_pedido);
  if v_s.informe_cierre_id is not null then
    select items, cotizacion_id into v_items, v_cot from informes_cierre where id = v_s.informe_cierre_id;
  end if;
  -- Sin líneas en el cierre: las de la cotización.
  if coalesce(jsonb_typeof(v_items), '') <> 'array' or jsonb_array_length(v_items) = 0 then
    v_cot := coalesce(v_cot, (select c.id from cotizaciones c where c.oportunidad_id = v_s.oportunidad_id order by c.created_at desc limit 1));
    select coalesce(jsonb_agg(jsonb_build_object('descripcion', coalesce(nullif(btrim(ci.nombre_impreso), ''), ci.descripcion),
                                                 'cantidad', ci.cantidad, 'precio_unitario', ci.precio_unitario, 'bloque', 'venta')), '[]'::jsonb)
      into v_items from cotizacion_items ci where ci.cotizacion_id = v_cot;
  end if;
  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'El cierre y la cotización no traen líneas: escríbalas a mano';
  end if;
  v_ya := array(select upper(btrim(split_part(descripcion, chr(10), 1))) from pedido_equipos where servicio_id = p_servicio);
  for v_item in select * from jsonb_array_elements(v_items) loop
    if coalesce(v_item->>'bloque', 'venta') not in ('venta', 'gratuito') then continue; end if;
    v_desc := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
    if v_desc is null then continue; end if;
    if upper(btrim(split_part(v_desc, chr(10), 1))) = any(v_ya) then continue; end if;
    v_cant := greatest(1, least(20, coalesce((v_item->>'cantidad')::numeric, 1)::int));
    v_series := array(select m[1] from regexp_matches(v_desc, E'SERIE[ \t]*:[ \t]*([A-Z0-9][A-Z0-9\\-\\./]*)', 'gi') m);
    if v_servicio then
      -- Un servicio va en UNA línea con su cantidad, como en la cotización.
      v_id := _insertar_linea_del_pedido(v_s, v_desc, case when coalesce(array_length(v_series, 1), 0) = 1 then v_series[1] end);
      update pedido_equipos
         set cantidad = coalesce((v_item->>'cantidad')::numeric, 1),
             precio = nullif(v_item->>'precio_unitario', '')::numeric,
             serie = coalesce(serie, nullif(array_to_string(v_series, ' / '), ''))
       where id = v_id;
      v_n := v_n + 1;
    else
      for v_i in 1..v_cant loop
        perform _insertar_linea_del_pedido(v_s, v_desc,
          case when coalesce(array_length(v_series, 1), 0) = v_cant then v_series[v_i]
               when coalesce(array_length(v_series, 1), 0) = 1 and v_cant = 1 then v_series[1] end);
        v_n := v_n + 1;
      end loop;
    end if;
  end loop;
  if v_n > 0 then
    perform _anotar_en_el_pedido(p_servicio, format('trajo %s línea%s a la lista del pedido.', v_n, case when v_n = 1 then '' else 's' end));
  end if;
  return v_n;
end $$;

-- La tabla entera como la dejó Central: [{id?, descripcion, cantidad, serie, precio}].
create or replace function public.guardar_detalle_del_servicio(p_servicio uuid, p_filas jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_s      servicios_postventa;
  v_f      jsonb;
  v_id     uuid;
  v_desc   text;
  v_serie  text;
  v_equipo uuid;
  v_orden  integer := 0;
begin
  v_s := _puede_editar_lista_del_pedido(p_servicio);
  if not _es_pedido_de_servicio(v_s.tipo_pedido) then
    raise exception 'Este pedido es de producto: sus equipos se arreglan fila por fila';
  end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Detalle no válido'; end if;
  -- Lo que Central quitó se va; lo que queda se corre de lugar para reordenar sin chocar.
  delete from pedido_equipos
   where servicio_id = p_servicio
     and not (id::text = any(array(select x->>'id' from jsonb_array_elements(p_filas) x where nullif(x->>'id', '') is not null)));
  update pedido_equipos set orden = orden + 100000 where servicio_id = p_servicio;
  for v_f in select * from jsonb_array_elements(p_filas) loop
    v_desc := nullif(btrim(coalesce(v_f->>'descripcion', '')), '');
    if v_desc is null then raise exception 'Hay una línea sin descripción: escríbala o quítela'; end if;
    if coalesce((v_f->>'cantidad')::numeric, 0) <= 0 then raise exception 'La cantidad de «%» tiene que ser mayor que cero', split_part(v_desc, chr(10), 1); end if;
    v_orden := v_orden + 1;
    v_serie := nullif(upper(btrim(coalesce(v_f->>'serie', ''))), '');
    v_equipo := null;
    if v_serie is not null then
      select e.id into v_equipo from equipos_instalados e
       where upper(btrim(e.serie)) = v_serie and (e.cuenta_id = v_s.cuenta_id or v_s.cuenta_id is null)
       order by e.created_at limit 1;
    end if;
    v_id := nullif(v_f->>'id', '')::uuid;
    if v_id is not null and exists (select 1 from pedido_equipos where id = v_id and servicio_id = p_servicio) then
      update pedido_equipos
         set orden = v_orden, descripcion = v_desc, cantidad = (v_f->>'cantidad')::numeric,
             precio = nullif(v_f->>'precio', '')::numeric, serie = v_serie, equipo_id = v_equipo
       where id = v_id;
    else
      insert into pedido_equipos (servicio_id, orden, descripcion, cantidad, precio, serie, equipo_id, es_prueba)
      values (p_servicio, v_orden, v_desc, (v_f->>'cantidad')::numeric, nullif(v_f->>'precio', '')::numeric, v_serie, v_equipo, v_s.es_prueba)
      returning id into v_id;
    end if;
  end loop;
  perform _anotar_en_el_pedido(p_servicio, format('guardó el detalle del servicio (%s línea%s).', v_orden, case when v_orden = 1 then '' else 's' end));
  return v_orden;
end $$;

revoke all on function public.pasar_pedido_a_servicio(uuid, text) from public, anon;
revoke all on function public.guardar_detalle_del_servicio(uuid, jsonb) from public, anon;
grant execute on function public.pasar_pedido_a_servicio(uuid, text) to authenticated;
grant execute on function public.guardar_detalle_del_servicio(uuid, jsonb) to authenticated;
grant execute on function public.traer_lineas_del_cierre(uuid) to authenticated;
