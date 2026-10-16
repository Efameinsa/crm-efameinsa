-- 0515 · «NO CORRESPONDE»: UN SERVICIO NO LLEVA CÓDIGO NI SERIE (Lesly, 16-10)
--
-- Cierre 062-2026 (LINO ESPIRITU JOSMEL ETZON): el renglón «SERVICIO DE
-- INSTALACION POR EL KIT: SECADORA … SERIE: 304KWUC0V206» venía marcado como
-- equipo en el cierre, así que sembrar_equipos_del_pedido le hizo fila y el
-- almacén lo veía como una máquina más: «Sin serie», «Pendiente de prueba» y
-- «Para marcarla probada y embalada falta: fotos, técnico». La secadora es la
-- del cliente (salió en el 004-2026); el almacén no tiene código ni serie que
-- darle. Lesly: «debería haber una opción que indica que no corresponde».
--
-- quitar_linea_que_no_corresponde saca esa fila de la lista del pedido (como si
-- se hubiera sembrado como servicio, 0404) y deja escrito en las observaciones
-- del pedido qué se quitó, quién y por qué. (Mientras tanto Central le había
-- puesto al servicio el código «NO LLEVA CODIGO EN ESTA UNIDAD», pero igual
-- seguía pidiendo prueba y fotos.) No se quita una fila con serie de verdad,
-- probada o con archivos, con otra máquina dentro (torre), ni la única que queda
-- (sin filas, el pedido se volvería a sembrar desde el cierre).

create or replace function public.quitar_linea_que_no_corresponde(p_item uuid, p_motivo text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_it     pedido_equipos%rowtype;
  v_quien  text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_quedan integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa, el almacén o Central arreglan la lista del pedido';
  end if;
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null then raise exception 'Ese artículo ya no está en el pedido'; end if;
  -- Con un «código sin serie» (0302) sí se puede: Central le puso «NO LLEVA
  -- CODIGO EN ESTA UNIDAD» al servicio de LINO para salir del paso.
  if v_it.serie is not null and not coalesce(v_it.sin_serie, false) then
    raise exception 'Este artículo ya tiene su serie: si está mal, corríjala con el código de operaciones';
  end if;
  if v_it.prueba_lista_at is not null then
    raise exception 'Este artículo ya está marcado probado y embalado: no se puede quitar';
  end if;
  if jsonb_typeof(v_it.protocolo_fotos) = 'array' and jsonb_array_length(v_it.protocolo_fotos) > 0 then
    raise exception 'Este artículo ya tiene fotos o archivos: quítelos primero si de verdad no corresponde';
  end if;
  if exists (select 1 from pedido_equipos where parte_de = p_item) then
    raise exception 'Este artículo tiene otra máquina dentro (torre): no se puede quitar';
  end if;
  select count(*) into v_quedan from pedido_equipos where servicio_id = v_it.servicio_id and id <> p_item and parte_de is null;
  if v_quedan = 0 then
    raise exception 'Es lo único que queda en la lista del pedido: avise a Central para que revise el cierre';
  end if;

  select coalesce(nullif(btrim(nombre), ''), 'alguien') into v_quien from perfiles where id = auth.uid();
  delete from pedido_equipos where id = p_item;
  update servicios_postventa
     set observaciones = concat_ws(chr(10), nullif(observaciones, ''),
           format('%s · %s quitó de la lista de equipos «%s»: no corresponde (%s); no lleva código ni serie.',
                  to_char(now() at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI'), v_quien,
                  split_part(btrim(v_it.descripcion), chr(10), 1),
                  coalesce(v_motivo, 'es un servicio, no una máquina que sale del almacén')))
   where id = v_it.servicio_id;
  return v_quedan;
end $function$;

grant execute on function public.quitar_linea_que_no_corresponde(uuid, text) to authenticated;
