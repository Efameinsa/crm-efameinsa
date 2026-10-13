-- 0463 · LA SERIE DE UN REPUESTO ES LA DE SU MÁQUINA, NO LA DEL REPUESTO (13-10)
--
-- La 0462 anotaba en la fila del pedido la «SERIE:» del renglón cuando la máquina
-- estaba en el parque del cliente. En un repuesto esa serie es la de la máquina a
-- la que va la pieza: el pedido de Vidawasi (OPEN 058-2026, tarjeta de control
-- para la lavadora Primus 180RX005914KQ) nació con la serie de la lavadora
-- «registrada por Central», y Central no le pidió el código al almacén. En
-- repuestos y accesorios la serie se queda solo en el texto. Se limpia esa fila.

CREATE OR REPLACE FUNCTION public.sembrar_equipos_del_pedido(p_servicio uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s      record;
  v_items  jsonb;
  v_item   jsonb;
  v_n      int := 0;
  v_cant   int;
  v_i      int;
  v_desc   text;
  v_sku    text;
  v_eq     record;
  v_lineas int := 0;
  v_series text[];
  v_base   text;
  v_unidad text;
  v_serie  text;
  v_equipo uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa o el almacén ven los equipos del pedido';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if exists (select 1 from pedido_equipos where servicio_id = p_servicio) then
    return 0;
  end if;

  -- 1. Las líneas del bloque de venta del cierre, una fila por unidad.
  if v_s.informe_cierre_id is not null then
    select items into v_items from informes_cierre where id = v_s.informe_cierre_id;
    if jsonb_typeof(v_items) = 'array' then
      for v_item in select * from jsonb_array_elements(v_items) loop
        if coalesce(v_item->>'bloque', 'venta') <> 'venta' then continue; end if;
        v_desc := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
        if v_desc is null then continue; end if;
        v_lineas := v_lineas + 1;
        -- 0404: un servicio (mantenimiento, revisión, embalaje) no es una
        -- máquina que se entrega: no lleva fila ni pide serie.
        if es_linea_de_servicio(v_item) then continue; end if;
        v_cant := greatest(1, least(20, coalesce((v_item->>'cantidad')::numeric, 1)::int));
        v_sku  := nullif(btrim(coalesce(v_item->>'sku', v_item->>'codigo', substring(v_desc from '(?i)C[OÓ]DIGO:\s*([A-Z0-9\-\.]+)'))), '');
        -- 0462: si el renglón trae una «SERIE:» por unidad, cada fila queda con
        -- la suya y el texto de UNA máquina (NEWREST, OPEN 057-2026: 8 filas con
        -- las 2 o 4 series del renglón parecían duplicados). La serie se registra
        -- en la fila solo si la máquina ya está en el parque del cliente o el
        -- renglón es un servicio; un equipo nuevo la sigue confirmando el almacén.
        v_series := array(select m[1] from regexp_matches(v_desc, E'^[ \t]*SERIE[ \t]*:[ \t]*([^\n]*[^ \t\n])', 'gni') m);
        v_base   := btrim(regexp_replace(v_desc, E'\n?[ \t]*SERIE[ \t]*:[^\n]*', '', 'gni'));
        for v_i in 1..v_cant loop
          v_n := v_n + 1;
          v_unidad := v_desc; v_serie := null; v_equipo := null;
          if coalesce(array_length(v_series, 1), 0) = v_cant then
            v_unidad := v_base || E'\nSERIE: ' || v_series[v_i];
            select e.id into v_equipo from equipos_instalados e
             where e.cuenta_id = v_s.cuenta_id and upper(btrim(e.serie)) = upper(btrim(v_series[v_i]))
             order by e.created_at limit 1;
            -- 0463: en un repuesto o accesorio, la «SERIE:» es la de la máquina a la
            -- que va la pieza, no la del repuesto: no se anota ni se engancha
            -- (Vidawasi, OPEN 058-2026: la tarjeta salió con la serie de la lavadora y
            -- Central no le pidió el código al almacén).
            if coalesce(v_item->>'tipo', '') in ('repuesto', 'accesorio')
               or coalesce(v_s.tipo_pedido, '') in ('repuesto', 'accesorio') then
              v_equipo := null;
            elsif v_equipo is not null or upper(v_desc) ~ '^[[:space:]]*SERVICIO[[:space:]]' then
              v_serie := v_series[v_i];
            end if;
          end if;
          insert into pedido_equipos (servicio_id, orden, descripcion, sku, serie, equipo_id, es_prueba)
          values (p_servicio, v_n, v_unidad, v_sku, v_serie, v_equipo, v_s.es_prueba);
        end loop;
      end loop;
    end if;
  end if;

  -- 2. Sin cierre (pedidos anteriores al circuito): un equipo, el texto del pedido.
  --    Si el cierre traía líneas y todas eran servicios, no hay equipos (0404).
  if v_n = 0 and v_lineas = 0 then
    v_n := 1;
    insert into pedido_equipos (servicio_id, orden, descripcion, es_prueba)
    values (p_servicio, 1, coalesce(nullif(btrim(v_s.equipo), ''), 'Equipo del pedido'), v_s.es_prueba);
  end if;

  -- 3. Las series que ya se registraron en el parque (0253) se enganchan a la
  --    lista, en orden, para no pedirlas dos veces.
  for v_eq in select id, serie from equipos_instalados where servicio_id = p_servicio order by created_at loop
    update pedido_equipos set serie = v_eq.serie, equipo_id = v_eq.id
     where id = (select id from pedido_equipos where servicio_id = p_servicio and serie is null order by orden limit 1);
  end loop;

  -- 4. Si el pedido ya estaba probado (antes de la 0260), todos sus equipos también.
  if v_s.prueba_lista_at is not null then
    update pedido_equipos
       set prueba_lista_at = v_s.prueba_lista_at, prueba_lista_por = v_s.prueba_lista_por, protocolo_ref = v_s.protocolo_prueba_ref
     where servicio_id = p_servicio;
  end if;
  return v_n;
end;
$function$;

-- La fila de Vidawasi vuelve a quedar sin serie, como cualquier repuesto recién generado.
update pedido_equipos
   set serie = null, equipo_id = null, serie_registrada_at = null, serie_registrada_por = null
 where id = 'd2ff0bcc-3b12-4a2e-9a5a-92d1e1d52678'
   and serie = '180RX005914KQ';
