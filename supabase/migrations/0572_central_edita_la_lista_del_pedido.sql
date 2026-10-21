-- 0572 · CENTRAL EDITA LA LISTA «EQUIPOS Y SERIES» DEL PEDIDO. Santos, 21-10,
-- con el PED-0037-2026 de FAMILY FARMS (OPEN 065-2026) en pantalla: «Central
-- necesita editar el detalle del pedido… dice que no jaló el detalle del
-- trabajo, equipos y series… aun así dale para que edite».
--
-- Por qué no jaló: el cierre son dos «SERVICIO DE MANTENIMIENTO PREVENTIVO» y,
-- desde la 0404, una línea de servicio no siembra fila en `pedido_equipos`. El
-- pedido salía con «Sin equipos cargados» aunque cada línea traía la serie de
-- la lavadora escrita adentro («… SERIE: 2301006516»).
--
-- Ahora Central (y postventa, el almacén y backoffice, que ya tocan esa lista)
-- puede, mientras el pedido no se despache:
--   · traer las líneas del cierre que no sembraron fila (los servicios), una
--     por unidad, con la serie que venga en el texto y enganchada a la máquina
--     del parque del cliente si ya está;
--   · agregar una línea a mano (texto y, si la tiene, serie);
--   · corregir el texto de una línea;
--   · quitar una línea que no corresponde (también la última).
-- Cada cambio queda escrito en las observaciones del pedido, con quién y cuándo.
-- Una serie ya puesta se sigue corrigiendo con el código (corregir_serie_del_equipo).

create or replace function public._puede_editar_lista_del_pedido(p_servicio uuid)
 returns servicios_postventa
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_s servicios_postventa;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo Central, postventa o el almacén arreglan la lista del pedido';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.despachado_at is not null or v_s.cerrado_at is not null then
    raise exception 'El pedido ya salió: la lista de equipos ya no se cambia';
  end if;
  return v_s;
end $$;

-- Anota en las observaciones del pedido (mismo formato que la 0515).
create or replace function public._anotar_en_el_pedido(p_servicio uuid, p_texto text)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $$
  update servicios_postventa
     set observaciones = concat_ws(chr(10), nullif(observaciones, ''),
           format('%s · %s %s', to_char(now() at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI'),
                  coalesce((select nullif(btrim(nombre), '') from perfiles where id = auth.uid()), 'alguien'), p_texto))
   where id = p_servicio;
$$;

-- Inserta una fila; la serie se engancha a la máquina del parque del cliente
-- si existe. En un equipo que se vende y no está en el parque, la registra
-- como siempre (registrar_serie_del_equipo); en un servicio, solo la escribe.
create or replace function public._insertar_linea_del_pedido(v_s servicios_postventa, p_descripcion text, p_serie text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_id     uuid;
  v_orden  integer;
  v_serie  text := nullif(upper(btrim(coalesce(p_serie, ''))), '');
  v_equipo uuid;
begin
  select coalesce(max(orden), 0) + 1 into v_orden from pedido_equipos where servicio_id = v_s.id;
  if v_serie is not null then
    select e.id into v_equipo from equipos_instalados e
     where upper(btrim(e.serie)) = v_serie and (e.cuenta_id = v_s.cuenta_id or v_s.cuenta_id is null)
     order by e.created_at limit 1;
  end if;
  insert into pedido_equipos (servicio_id, orden, descripcion, serie, equipo_id, es_prueba, serie_registrada_at, serie_registrada_por)
  values (v_s.id, v_orden, p_descripcion,
          case when v_equipo is not null or coalesce(v_s.tipo_pedido, 'equipo') <> 'equipo' then v_serie end,
          v_equipo, v_s.es_prueba,
          case when v_serie is not null then now() end, case when v_serie is not null then auth.uid() end)
  returning id into v_id;
  if v_serie is not null and v_equipo is null and coalesce(v_s.tipo_pedido, 'equipo') = 'equipo' then
    perform registrar_serie_del_equipo(v_id, v_serie, 24);
  end if;
  return v_id;
end $$;

create or replace function public.agregar_linea_al_pedido(p_servicio uuid, p_descripcion text, p_serie text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_s    servicios_postventa;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_id   uuid;
begin
  v_s := _puede_editar_lista_del_pedido(p_servicio);
  if v_desc is null then raise exception 'Escriba qué equipo o trabajo es'; end if;
  v_id := _insertar_linea_del_pedido(v_s, v_desc, p_serie);
  perform _anotar_en_el_pedido(p_servicio, format('agregó a la lista de equipos «%s»%s.',
    split_part(v_desc, chr(10), 1),
    coalesce(' con serie ' || nullif(upper(btrim(coalesce(p_serie, ''))), ''), '')));
  return v_id;
end $$;

-- Las líneas del cierre que no sembraron fila (servicios, 0404), una por unidad.
-- La serie se saca del texto («SERIE: x» o «SERIE:x»); si el renglón trae una
-- por unidad, cada fila lleva la suya.
create or replace function public.traer_lineas_del_cierre(p_servicio uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_s      servicios_postventa;
  v_items  jsonb;
  v_item   jsonb;
  v_desc   text;
  v_cant   integer;
  v_series text[];
  v_n      integer := 0;
  v_i      integer;
  v_ya     text[];
begin
  v_s := _puede_editar_lista_del_pedido(p_servicio);
  -- Lo que ya estaba en la lista antes de traer (primera línea del texto).
  v_ya := array(select upper(btrim(split_part(descripcion, chr(10), 1))) from pedido_equipos where servicio_id = p_servicio);
  if v_s.informe_cierre_id is null then raise exception 'Este pedido no viene de un cierre: agregue las líneas a mano'; end if;
  select items into v_items from informes_cierre where id = v_s.informe_cierre_id;
  if jsonb_typeof(v_items) <> 'array' then return 0; end if;
  for v_item in select * from jsonb_array_elements(v_items) loop
    if coalesce(v_item->>'bloque', 'venta') not in ('venta', 'gratuito') then continue; end if;
    v_desc := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
    if v_desc is null then continue; end if;
    -- Lo que ya está en la lista (mismo texto de primera línea) no se repite.
    if upper(btrim(split_part(v_desc, chr(10), 1))) = any(v_ya) then continue; end if;
    v_cant := greatest(1, least(20, coalesce((v_item->>'cantidad')::numeric, 1)::int));
    v_series := array(select m[1] from regexp_matches(v_desc, E'SERIE[ \t]*:[ \t]*([A-Z0-9][A-Z0-9\\-\\./]*)', 'gi') m);
    for v_i in 1..v_cant loop
      perform _insertar_linea_del_pedido(v_s, v_desc,
        case when coalesce(array_length(v_series, 1), 0) = v_cant then v_series[v_i]
             when coalesce(array_length(v_series, 1), 0) = 1 and v_cant = 1 then v_series[1] end);
      v_n := v_n + 1;
    end loop;
  end loop;
  if v_n > 0 then
    perform _anotar_en_el_pedido(p_servicio, format('trajo del cierre %s línea%s a la lista de equipos.', v_n, case when v_n = 1 then '' else 's' end));
  end if;
  return v_n;
end $$;

create or replace function public.editar_linea_del_pedido(p_item uuid, p_descripcion text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_it   pedido_equipos%rowtype;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
begin
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null then raise exception 'Esa línea ya no está en el pedido'; end if;
  perform _puede_editar_lista_del_pedido(v_it.servicio_id);
  if v_desc is null then raise exception 'Escriba qué equipo o trabajo es'; end if;
  if v_desc = v_it.descripcion then return; end if;
  update pedido_equipos set descripcion = v_desc where id = p_item;
  perform _anotar_en_el_pedido(v_it.servicio_id, format('corrigió en la lista de equipos «%s» → «%s».',
    split_part(btrim(v_it.descripcion), chr(10), 1), split_part(v_desc, chr(10), 1)));
end $$;

-- Quita una línea aunque sea la última o ya tenga serie (la ficha del parque
-- no se toca). No si ya está probada o tiene archivos, o lleva otra máquina dentro.
create or replace function public.quitar_linea_del_pedido(p_item uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_it pedido_equipos%rowtype;
begin
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null then raise exception 'Esa línea ya no está en el pedido'; end if;
  perform _puede_editar_lista_del_pedido(v_it.servicio_id);
  if v_it.prueba_lista_at is not null then
    raise exception 'Esta línea ya está marcada probada y embalada: no se puede quitar';
  end if;
  if jsonb_typeof(v_it.protocolo_fotos) = 'array' and jsonb_array_length(v_it.protocolo_fotos) > 0 then
    raise exception 'Esta línea ya tiene fotos o archivos del almacén: no se puede quitar';
  end if;
  if exists (select 1 from pedido_equipos where parte_de = p_item) then
    raise exception 'Esta línea tiene otra máquina dentro (torre): quite primero la secadora';
  end if;
  delete from pedido_equipos where id = p_item;
  perform _anotar_en_el_pedido(v_it.servicio_id, format('quitó de la lista de equipos «%s»%s.',
    split_part(btrim(v_it.descripcion), chr(10), 1), coalesce(' (serie ' || v_it.serie || ')', '')));
end $$;

revoke all on function public._puede_editar_lista_del_pedido(uuid) from public, anon, authenticated;
revoke all on function public._anotar_en_el_pedido(uuid, text) from public, anon, authenticated;
revoke all on function public._insertar_linea_del_pedido(servicios_postventa, text, text) from public, anon, authenticated;
revoke all on function public.agregar_linea_al_pedido(uuid, text, text) from public, anon;
revoke all on function public.traer_lineas_del_cierre(uuid) from public, anon;
revoke all on function public.editar_linea_del_pedido(uuid, text) from public, anon;
revoke all on function public.quitar_linea_del_pedido(uuid) from public, anon;
grant execute on function public.agregar_linea_al_pedido(uuid, text, text) to authenticated;
grant execute on function public.traer_lineas_del_cierre(uuid) to authenticated;
grant execute on function public.editar_linea_del_pedido(uuid, text) to authenticated;
grant execute on function public.quitar_linea_del_pedido(uuid) to authenticated;
