-- 0436 · QUÉ SE VENDE LO ELIGE EL COMERCIAL EN EL CIERRE (Rubí, buzón 12-10)
--
-- «Solicito que el área comercial tenga en el cierre de un pedido la opción de
-- cambiar cuando vende un equipo, repuesto, mantenimiento u otro servicio.»
-- El circuito del pedido salía solo de los renglones (tipo_pedido_del_informe)
-- y el variador F8496601 del cierre 053-2026, copiado de la cotización como
-- «Equipo», entró a postventa como venta de equipo.
--
-- informes_cierre.tipo_pedido: null = según los renglones (como hasta hoy).
-- liberar_pedido_postventa lo respeta; corregir_informe_emitido lo acepta y,
-- si el pedido ya está en postventa sin cerrar, cambia también su circuito.

alter table public.informes_cierre add column if not exists tipo_pedido text;
alter table public.informes_cierre drop constraint if exists informes_cierre_tipo_pedido_check;
alter table public.informes_cierre add constraint informes_cierre_tipo_pedido_check
  check (tipo_pedido is null or tipo_pedido = any (array['equipo', 'repuesto', 'accesorio', 'mantenimiento', 'revision', 'embalaje']));
comment on column public.informes_cierre.tipo_pedido is
  'Qué se vende (0436): manda sobre tipo_pedido_del_informe al liberar el pedido. null = según los renglones.';

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
  v_entregado timestamptz;
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
      case coalesce(v_informe.tipo_pedido, tipo_pedido_del_informe(v_informe.items))
        when 'mantenimiento' then 'MANTENIMIENTO' when 'revision' then 'REVISIÓN' when 'embalaje' then 'EMBALAJE'
        else 'ENTREGA DE EQUIPO' end, v_informe.nota_despacho,
      v_informe.monto_total, v_informe.moneda,
      array_to_string(v_informe.modalidad_pago, ' + '), v_modalidad,
      v_informe.pct_antes_despacho, v_informe.credito_dias,
      coalesce(v_informe.entrega_direccion, v_informe.entrega_lugar),
      v_informe.entrega_fecha, p_numero_pedido, 'crm',
      coalesce(v_informe.tipo_pedido, tipo_pedido_del_informe(v_informe.items))
    ) returning id into v_servicio_id;

    -- REG (gerencia 05-10 16:38, 0397): el cierre es un Word anterior al CRM y
    -- el almacén ya entregó. El pedido nace con la preparación y el despacho
    -- hechos a la fecha de entrega; queda lo de postventa (aprobar,
    -- preinstalación, puesta en marcha, cierre) y la confirmación de Finanzas.
    if v_informe.regularizado then
      v_entregado := (coalesce(
        case when coalesce(v_informe.entrega_fecha, '') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
             then to_date(v_informe.entrega_fecha, 'DD/MM/YYYY') end,
        v_informe.fecha) + time '12:00') at time zone 'America/Lima';
      update servicios_postventa
         set regularizado = true,
             -- El lugar de entrega del Word no dice «agencia»: Lima o provincia
             -- sale del departamento del cliente.
             modalidad = (select case when upper(coalesce(c.departamento, '')) in ('LIMA', 'CALLAO', '') then 'lima' else 'provincia' end
                            from cuentas c where c.id = v_informe.cuenta_id),
             prueba_lista_at = v_entregado,
             almacen_listo_at = v_entregado,
             plano_enviado_at = v_entregado,
             direccion_verificada_at = v_entregado,
             direccion_verificada_con = 'REG: entregado antes del CRM',
             apertura_despacho_at = v_entregado,
             despachado_at = v_entregado,
             observaciones = concat_ws(chr(10), observaciones,
               format('REG · Pedido regularizado: cierre %s en Word anterior al CRM, entregado el %s. No suma venta; el almacén no prepara ni despacha.',
                      coalesce(v_informe.codigo, ''), to_char(v_entregado at time zone 'America/Lima', 'DD-MM-YYYY')))
       where id = v_servicio_id;
    end if;
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

CREATE OR REPLACE FUNCTION public.corregir_informe_emitido(p_informe uuid, p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quien    uuid := auth.uid();
  v_permiso  correcciones_informe;
  v_inf      informes_cierre;
  v_items    jsonb;
  v_monto    numeric;
  v_sin_igv  numeric;
  v_venta    ventas;
  v_k        text;
  v_tipo     text;
  v_permitidas text[] := array[
    'cliente_nombre','cliente_doc','cliente_direccion','cliente_correo',
    'referencia','asunto','presupuesto_ref','orden_compra','cliente_nuevo','urgente',
    'modalidad_pago','forma_pago','comprobante','nota_condiciones',
    'entrega_fecha','entrega_hora','entrega_lugar','entrega_direccion','nota_despacho',
    'contacto_venta','contacto_contabilidad','contacto_despacho',
    'items','incluye','gratis','garantia','nota_final',
    -- 0436: qué se vende ("" = según los renglones).
    'tipo_pedido'
  ];
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select * into v_permiso
    from correcciones_informe
   where informe_id = p_informe and solicitante_id = v_quien
     and guardada_at is null and expira_at > now()
   order by abierta_at desc limit 1;
  if not found then
    raise exception 'La autorización para corregir este cierre venció o no se pidió. Toque «Editar» y pida un código nuevo a operaciones o gerencia.';
  end if;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then raise exception 'Ese cierre es un borrador: se edita directo, sin código'; end if;
  if v_inf.anulado_at is not null then raise exception 'El cierre % está anulado y no se corrige', v_inf.codigo; end if;

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No llegó ningún cambio';
  end if;
  for v_k in select jsonb_object_keys(p_cambios) loop
    if not (v_k = any (v_permitidas)) then
      raise exception 'El campo «%» no se corrige por esta vía', v_k;
    end if;
  end loop;

  v_items := coalesce(p_cambios->'items', v_inf.items);
  if jsonb_typeof(v_items) <> 'array'
     or (select count(*) from jsonb_array_elements(v_items) e where coalesce(e->>'bloque', 'venta') <> 'gratuito') = 0 then
    raise exception 'El cierre necesita al menos un equipo con precio';
  end if;

  insert into informes_cierre_versiones (informe_id, version, datos, motivo, corregido_por, autorizo)
  values (p_informe, v_inf.version, to_jsonb(v_inf), v_permiso.motivo, v_quien, v_permiso.autorizo);

  v_sin_igv := importe_informe_sin_igv(v_items);
  v_monto   := importe_informe_con_igv(v_items);

  perform set_config('app.corrigiendo_cierre', 'si', true);
  perform set_config('app.expediente_autorizado', 'si', true);
  update informes_cierre set
    cliente_nombre        = coalesce(p_cambios->>'cliente_nombre', cliente_nombre),
    cliente_doc           = case when p_cambios ? 'cliente_doc' then nullif(p_cambios->>'cliente_doc', '') else cliente_doc end,
    cliente_direccion     = case when p_cambios ? 'cliente_direccion' then nullif(p_cambios->>'cliente_direccion', '') else cliente_direccion end,
    cliente_correo        = case when p_cambios ? 'cliente_correo' then nullif(p_cambios->>'cliente_correo', '') else cliente_correo end,
    referencia            = case when p_cambios ? 'referencia' then nullif(p_cambios->>'referencia', '') else referencia end,
    asunto                = coalesce(nullif(p_cambios->>'asunto', ''), asunto),
    presupuesto_ref       = case when p_cambios ? 'presupuesto_ref' then nullif(p_cambios->>'presupuesto_ref', '') else presupuesto_ref end,
    orden_compra          = case when p_cambios ? 'orden_compra' then nullif(p_cambios->>'orden_compra', '') else orden_compra end,
    cliente_nuevo         = coalesce((p_cambios->>'cliente_nuevo')::boolean, cliente_nuevo),
    urgente               = coalesce((p_cambios->>'urgente')::boolean, urgente),
    modalidad_pago        = case when p_cambios ? 'modalidad_pago'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'modalidad_pago') x where trim(x) <> '')
                              else modalidad_pago end,
    forma_pago            = case when p_cambios ? 'forma_pago' then nullif(p_cambios->>'forma_pago', '')::forma_pago_informe else forma_pago end,
    comprobante           = case when p_cambios ? 'comprobante' then nullif(p_cambios->>'comprobante', '')::comprobante_venta else comprobante end,
    nota_condiciones      = case when p_cambios ? 'nota_condiciones' then nullif(p_cambios->>'nota_condiciones', '') else nota_condiciones end,
    entrega_fecha         = case when p_cambios ? 'entrega_fecha' then nullif(p_cambios->>'entrega_fecha', '') else entrega_fecha end,
    entrega_hora          = case when p_cambios ? 'entrega_hora' then nullif(p_cambios->>'entrega_hora', '') else entrega_hora end,
    entrega_lugar         = case when p_cambios ? 'entrega_lugar' then nullif(p_cambios->>'entrega_lugar', '') else entrega_lugar end,
    entrega_direccion     = case when p_cambios ? 'entrega_direccion' then nullif(p_cambios->>'entrega_direccion', '') else entrega_direccion end,
    nota_despacho         = case when p_cambios ? 'nota_despacho' then nullif(p_cambios->>'nota_despacho', '') else nota_despacho end,
    contacto_venta        = coalesce(p_cambios->'contacto_venta', contacto_venta),
    contacto_contabilidad = coalesce(p_cambios->'contacto_contabilidad', contacto_contabilidad),
    contacto_despacho     = coalesce(p_cambios->'contacto_despacho', contacto_despacho),
    items                 = v_items,
    incluye               = case when p_cambios ? 'incluye'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'incluye') x where trim(x) <> '')
                              else incluye end,
    gratis                = case when p_cambios ? 'gratis' then nullif(p_cambios->>'gratis', '') else gratis end,
    garantia              = case when p_cambios ? 'garantia' then nullif(p_cambios->>'garantia', '') else garantia end,
    nota_final            = case when p_cambios ? 'nota_final' then nullif(p_cambios->>'nota_final', '') else nota_final end,
    tipo_pedido           = case when p_cambios ? 'tipo_pedido' then nullif(p_cambios->>'tipo_pedido', '') else tipo_pedido end,
    monto_total           = v_monto,
    version               = version + 1,
    corregido_at          = now(),
    corregido_por         = v_quien
  where id = p_informe;

  if v_inf.venta_id is not null and v_monto <> v_inf.monto_total then
    select * into v_venta from ventas where id = v_inf.venta_id;
    if found and v_venta.monto_total <> v_sin_igv then
      update ventas
         set monto_total = v_sin_igv,
             notas = concat_ws(E'\n', notas, format(
               'El informe %s se corrigió (versión %s): la venta pasa de %s %s a %s %s.',
               coalesce(v_inf.codigo, '(sin código)'), v_inf.version + 1,
               v_venta.moneda, to_char(v_venta.monto_total, 'FM999G999G990D00'),
               v_venta.moneda, to_char(v_sin_igv, 'FM999G999G990D00')))
       where id = v_venta.id;
    end if;
  end if;

  -- 0436: si el comercial cambió qué se vende y el pedido ya está en
  -- postventa sin cerrar, el circuito del pedido cambia también (Rubí, 12-10).
  if p_cambios ? 'tipo_pedido' then
    v_tipo := coalesce(nullif(p_cambios->>'tipo_pedido', ''), tipo_pedido_del_informe(v_items));
    update servicios_postventa
       set tipo_pedido     = v_tipo,
           entrega_en      = case when v_tipo in ('repuesto', 'accesorio') and tipo_pedido in ('repuesto', 'accesorio') then entrega_en end,
           con_instalacion = case when v_tipo = 'repuesto' and tipo_pedido = 'repuesto' then con_instalacion
                                  when v_tipo = 'accesorio' then false end,
           tipo_servicio   = case v_tipo when 'mantenimiento' then 'MANTENIMIENTO' when 'revision' then 'REVISIÓN'
                                         when 'embalaje' then 'EMBALAJE' else 'ENTREGA DE EQUIPO' end,
           observaciones   = concat_ws(chr(10), observaciones,
             format('El comercial corrigió el cierre %s: se vendió %s.', coalesce(v_inf.codigo, ''),
               case v_tipo when 'equipo' then 'un equipo' when 'repuesto' then 'un repuesto' when 'accesorio' then 'un accesorio'
                           when 'mantenimiento' then 'un mantenimiento' when 'revision' then 'un servicio de revisión'
                           else 'un servicio de embalaje' end))
     where informe_cierre_id = p_informe
       and cerrado_at is null
       and tipo_pedido is distinct from v_tipo;
  end if;

  update correcciones_informe set guardada_at = now() where id = v_permiso.id;

  return (select to_jsonb(i) from informes_cierre i where i.id = p_informe);
end;
$function$;
