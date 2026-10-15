-- OTRO CIRCUITO PARA LO QUE NO SALIÓ (Rubí, 15-10, ECOLAV SORELA, OPEN 467-26).
-- «El cliente tiene 2 equipos, ya se envió la lavadora y se realizó todo el
-- circuito de PEDIDOS; ahora la secadora recién se despachará: necesito que
-- se haga otro circuito para ese equipo.»
--
-- El despacho parcial de la 0260 solo dejaba marcar «no va en este despacho»:
-- lo que se quedaba no tenía camino propio, y al cerrar el pedido se iba con
-- él. Ahora postventa elige los equipos que no salieron y nace un pedido nuevo
-- del MISMO cierre (continua_de = el pedido original) con lo que es de la
-- venta y no de la salida —aprobación, liquidación, pago confirmado,
-- condición de pago, plano enviado— y con todo lo de la salida en blanco:
-- prueba y embalaje, dirección verificada, apertura, salida del almacén,
-- despacho, verificación y puesta en marcha. Los equipos elegidos se MUDAN
-- al pedido nuevo (no se copian: cada máquina vive en un solo pedido). Sin
-- monto: la plata de la venta queda en el pedido original y no se cuenta dos veces.

alter table public.servicios_postventa
  add column if not exists continua_de uuid references public.servicios_postventa(id);

create index if not exists ix_servicios_pv_continua_de
  on public.servicios_postventa (continua_de) where continua_de is not null;

create or replace function public.abrir_otro_circuito(p_servicio uuid, p_items uuid[], p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s      record;
  v_nuevo  uuid := gen_random_uuid();
  v_quedan int;
  v_mudan  int;
  v_texto  text;
  -- Lo que es de la VENTA y sigue valiendo para la segunda salida.
  v_cols   text[] := array[
    'cuenta_id', 'cliente_texto', 'fecha_confirmacion', 'ubicacion', 'tipo_servicio', 'moneda',
    'forma_pago', 'confirmacion_abono', 'oportunidad_id', 'responsable_id', 'origen',
    'informe_cierre_id', 'numero_pedido_erp', 'pedido_ejecutado_at', 'pedido_ejecutado_por',
    'liquidacion_at', 'liquidacion_por', 'aprobado_at', 'aprobado_por', 'modalidad',
    'pago_confirmado_at', 'pago_confirmado_por', 'pago_confirmado_detalle', 'pago_confirmado_captura',
    'pct_antes_despacho', 'credito_dias', 'condicion_definida_por', 'condicion_definida_at', 'condicion_nota',
    'ejecutado_sin_liquidacion_autorizo', 'tipo_pedido', 'entrega_en', 'con_instalacion',
    'entrega_modo', 'agencia_destino', 'agencia_direccion', 'direccion_entrega',
    'liquidacion_adjunto', 'liquidacion_subida_at', 'liquidacion_subida_por',
    'pedido_generado_at', 'pedido_generado_por', 'es_prueba', 'apertura_empresa', 'regularizado',
    'finanzas_vb_at', 'finanzas_vb_por', 'finanzas_vb_nota', 'finanzas_vb_comision',
    'letras_cantidad', 'letras_estado', 'letras_firmadas_at', 'letras_firmadas_por',
    'planos_preinstalacion', 'plano_enviado_at', 'plano_enviado_por', 'sin_plano', 'sin_plano_motivo'
  ];
  v_lista  text;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'El circuito de un equipo lo abre postventa';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escriba por qué ese equipo sale aparte (ej. «la secadora llegó después»)';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if coalesce(array_length(p_items, 1), 0) = 0 then raise exception 'Marque el equipo que sale aparte'; end if;

  select count(*) into v_mudan from pedido_equipos
   where servicio_id = p_servicio and id = any(p_items) and parte_de is null;
  if v_mudan <> (select count(distinct x) from unnest(p_items) x) then
    raise exception 'Alguno de esos equipos no es de este pedido';
  end if;
  select count(*) into v_quedan from pedido_equipos
   where servicio_id = p_servicio and parte_de is null and not (id = any(p_items));
  if v_quedan = 0 then
    raise exception 'Algún equipo tiene que quedarse en este pedido: si no sale ninguno, no hace falta otro circuito';
  end if;

  -- El pedido nuevo: columnas de la venta copiadas, el resto con su valor de inicio.
  select string_agg(quote_ident(c), ', ') into v_lista
    from unnest(v_cols) c
   where exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'servicios_postventa' and column_name = c);
  execute format(
    'insert into servicios_postventa (id, continua_de, %1$s) select $1, id, %1$s from servicios_postventa where id = $2',
    v_lista) using v_nuevo, p_servicio;

  -- Las máquinas elegidas (y la segunda máquina de una torre) se mudan. Una
  -- «probada» sin protocolo ni fotos no se probó de verdad (ECOLAV: la secadora
  -- quedó marcada con la lavadora sin tener serie): vuelve a pedir su prueba.
  update pedido_equipos pe
     set servicio_id = v_nuevo,
         en_este_despacho = true,
         prueba_lista_at = case when pe.protocolo_ref is null and jsonb_array_length(pe.protocolo_fotos) = 0
                                then null else pe.prueba_lista_at end,
         prueba_lista_por = case when pe.protocolo_ref is null and jsonb_array_length(pe.protocolo_fotos) = 0
                                 then null else pe.prueba_lista_por end
   where pe.servicio_id = p_servicio and (pe.id = any(p_items) or pe.parte_de = any(p_items));

  select string_agg(split_part(descripcion, E'\n', 1), E'\n' order by orden) into v_texto
    from pedido_equipos where servicio_id = v_nuevo and parte_de is null;

  update servicios_postventa
     set equipo = v_texto,
         observaciones = to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI')
           || ' · Otro circuito: ' || btrim(p_motivo)
           || ' (continúa el pedido ' || coalesce(v_s.numero_pedido_erp, left(v_s.id::text, 8)) || ')'
   where id = v_nuevo;

  update servicios_postventa
     set observaciones = concat_ws(E'\n', nullif(observaciones, ''),
           to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI')
           || ' · Sale aparte, en otro circuito: ' || replace(v_texto, E'\n', ' + ') || ' — ' || btrim(p_motivo))
   where id = p_servicio;

  return v_nuevo;
end;
$function$;

revoke all on function public.abrir_otro_circuito(uuid, uuid[], text) from public;
grant execute on function public.abrir_otro_circuito(uuid, uuid[], text) to authenticated;
