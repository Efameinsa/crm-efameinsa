-- CENTRAL INGRESA LAS SERIES AL LIBERAR EL PEDIDO (22-09-2026).
--
-- Reunión de Carlos con Lesly y Rubí: «Ahora la Central tiene que tener un
-- paso más: el cierre es lo mismo, pero lo va a convertir en pedido. ¿Cómo?
-- Con el número de serie... Para que la Central ingrese la serie del equipo,
-- la descripción, suba la liquidación y dé el ok para que avance. Ese es
-- nuestro punto de partida.»
--
-- La lista de equipos por pedido ya existía (0260), pero solo la sembraban y
-- la tocaban postventa y el almacén. Acá se le abre la puerta a Central:
--   1. `liberar_pedido_postventa` siembra la lista apenas nace el servicio
--      (idempotente: no hace nada si ya existía).
--   2. Central puede leer `pedido_equipos` (RLS) y registrar series
--      (`sembrar_equipos_del_pedido`, `registrar_serie_del_equipo`), igual
--      que postventa y el almacén — nunca decide qué va en el despacho ni
--      prueba nada, eso sigue siendo de las otras dos áreas.
--
-- Todo parchado sobre la definición viva (scripts/_fn.mjs), no reescrito de
-- memoria.

drop policy if exists pedido_equipos_lectura on pedido_equipos;
create policy pedido_equipos_lectura on pedido_equipos for select to authenticated
  using (
    (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central')
    and es_prueba = coalesce((select es_cuenta_prueba()), false)
  );

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
        v_cant := greatest(1, least(20, coalesce((v_item->>'cantidad')::numeric, 1)::int));
        v_sku  := nullif(btrim(coalesce(v_item->>'sku', v_item->>'codigo', substring(v_desc from '(?i)C[OÓ]DIGO:\s*([A-Z0-9\-\.]+)'))), '');
        for v_i in 1..v_cant loop
          v_n := v_n + 1;
          insert into pedido_equipos (servicio_id, orden, descripcion, sku, es_prueba)
          values (p_servicio, v_n, v_desc, v_sku, v_s.es_prueba);
        end loop;
      end loop;
    end if;
  end if;

  -- 2. Sin cierre (pedidos anteriores al circuito): un equipo, el texto del pedido.
  if v_n = 0 then
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

CREATE OR REPLACE FUNCTION public.registrar_serie_del_equipo(p_item uuid, p_serie text, p_garantia_meses integer DEFAULT 24)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it    record;
  v_s     record;
  v_serie text;
  v_base  date;
  v_eq    uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  v_serie := upper(btrim(coalesce(p_serie, '')));
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;
  select * into v_s from servicios_postventa where id = v_it.servicio_id;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
    fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
    registrado_por, registrado_en, es_prueba)
  values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_it.descripcion, v_s.id, v_s.informe_cierre_id,
    v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
    case when v_base is null then null else (v_base + interval '6 months')::date end, v_s.ubicacion,
    auth.uid(), 'pedido', v_s.es_prueba)
  on conflict ((upper(btrim(serie)))) do update
    set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
        cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
        modelo_texto = coalesce(equipos_instalados.modelo_texto, excluded.modelo_texto),
        guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
        fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho)
  returning id into v_eq;

  update pedido_equipos set serie = v_serie, equipo_id = v_eq where id = p_item;
  return v_eq;
end;
$function$;

CREATE OR REPLACE FUNCTION public.liberar_pedido_postventa(p_informe_id uuid, p_numero_pedido text DEFAULT NULL::text, p_marcar_pedido boolean DEFAULT true, p_marcar_liquidacion boolean DEFAULT false, p_pin text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_informe informes_cierre%rowtype;
  v_servicio_id uuid;
  v_equipos text;
  v_modalidad text;
  v_liq timestamptz;
  v_autorizo uuid;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin') then
    raise exception 'Solo Central puede liberar un pedido a postventa';
  end if;

  select * into v_informe from informes_cierre where id = p_informe_id;
  if v_informe is null then
    raise exception 'Informe de cierre no encontrado';
  end if;
  if v_informe.emitido_at is null then
    raise exception 'El informe todavía es un borrador del comercial';
  end if;

  select id, liquidacion_at into v_servicio_id, v_liq
    from servicios_postventa where informe_cierre_id = p_informe_id limit 1;

  -- PRIMERO LA LIQUIDACIÓN, DESPUÉS EL PEDIDO EJECUTADO (Carlos, 15-09). Si
  -- hay que ejecutar antes —para que postventa pruebe y embale mientras
  -- Finanzas termina—, es con el código de gerencia u operaciones, y queda
  -- quién lo autorizó.
  if p_marcar_pedido and not p_marcar_liquidacion and v_liq is null then
    if nullif(btrim(coalesce(p_pin, '')), '') is null then
      raise exception 'La liquidación todavía no está marcada. Márquela primero, o pida el código de gerencia u operaciones para ejecutar el pedido sin ella.';
    end if;
    v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  end if;

  select string_agg(x->>'descripcion', E'\n') into v_equipos
    from jsonb_array_elements(v_informe.items) x
   where coalesce(x->>'bloque', 'venta') = 'venta';

  v_modalidad := case
    when coalesce(v_informe.entrega_lugar, '') ~* 'agencia|shalom|transport|marvisur|olva|cruz del sur'
      then 'provincia' else 'lima' end;

  if v_servicio_id is null then
    insert into servicios_postventa (
      informe_cierre_id, cuenta_id, cliente_texto, fecha_confirmacion,
      ubicacion, equipo, tipo_servicio, observaciones,
      monto, moneda, forma_pago, modalidad,
      pct_antes_despacho, credito_dias,
      direccion_entrega, despacho_nota, numero_pedido_erp, origen,
      tipo_pedido
    ) values (
      p_informe_id, v_informe.cuenta_id,
      coalesce(v_informe.cliente_doc || ' - ', '') || v_informe.cliente_nombre,
      v_informe.fecha,
      v_informe.entrega_lugar, coalesce(v_equipos, 'Sin detalle'),
      'ENTREGA DE EQUIPO', v_informe.nota_despacho,
      v_informe.monto_total, v_informe.moneda,
      array_to_string(v_informe.modalidad_pago, ' + '), v_modalidad,
      v_informe.pct_antes_despacho, v_informe.credito_dias,
      coalesce(v_informe.entrega_direccion, v_informe.entrega_lugar),
      v_informe.entrega_fecha, p_numero_pedido, 'crm',
      tipo_pedido_del_informe(v_informe.items)
    ) returning id into v_servicio_id;
  elsif p_numero_pedido is not null then
    update servicios_postventa set numero_pedido_erp = p_numero_pedido where id = v_servicio_id;
  end if;

  -- LA LISTA DE EQUIPOS, DESDE QUE NACE EL PEDIDO (Carlos, 22-09): «para que
  -- la Central ingrese la serie del equipo, la descripción… y dé el ok para
  -- que avance». Se siembra apenas existe el servicio, sea cual sea el check
  -- que se está marcando; es idempotente (sembrar_equipos_del_pedido no hace
  -- nada si la lista ya existe).
  perform sembrar_equipos_del_pedido(v_servicio_id);

  if p_marcar_pedido then
    update servicios_postventa
       set pedido_ejecutado_at = coalesce(pedido_ejecutado_at, now()),
           pedido_ejecutado_por = coalesce(pedido_ejecutado_por, auth.uid()),
           ejecutado_sin_liquidacion_autorizo = coalesce(ejecutado_sin_liquidacion_autorizo, v_autorizo)
     where id = v_servicio_id;
  end if;

  if p_marcar_liquidacion then
    update servicios_postventa
       set liquidacion_at = coalesce(liquidacion_at, now()),
           liquidacion_por = coalesce(liquidacion_por, auth.uid())
     where id = v_servicio_id;
  end if;

  return v_servicio_id;
end;
$function$;
