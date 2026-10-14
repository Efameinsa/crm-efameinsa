-- 0488 — REG POR ENTREGAR: cierres hechos fuera del CRM cuyo equipo todavía no salió
--
-- Santos, 14-10: SEVENTH HEAVEN (Cusco) compró una calandria GMP G14.25 en
-- noviembre de 2025 (Presu 2074-25, INFORME 002-2025 en Word, US$ 17 000) y
-- la está pagando por partes; el equipo sigue embalado en el almacén hasta
-- que cancele. El pedido nunca se hizo en el CRM: «hay que regularizarlo».
--
-- El REG de la 0397 supone que el almacén ya entregó: el pedido nace con la
-- prueba, la apertura y el despacho hechos y las series las copia Central.
-- Aquí sería mentira y se saltaría el visto bueno de Finanzas (0469). El REG
-- «por entregar» sigue sin sumar venta, pero el pedido recorre el circuito
-- normal: series del almacén, apertura, guía y salida con su pago.

alter table public.informes_cierre add column if not exists reg_por_entregar boolean not null default false;
comment on column public.informes_cierre.reg_por_entregar is 'REG cuyo equipo todavía no se entregó: no suma venta, pero el pedido sigue el circuito normal de preparación y despacho (0488).';

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
    -- REG por entregar (0488): no suma venta, pero el equipo todavía no salió.
    if v_informe.regularizado and v_informe.reg_por_entregar then
      update servicios_postventa
         set regularizado = true,
             observaciones = concat_ws(chr(10), observaciones,
               format('REG · Pedido regularizado: cierre %s hecho fuera del CRM, con el equipo todavía por entregar. No suma venta; sigue el circuito normal de preparación y despacho.',
                      coalesce(v_informe.codigo, '')))
       where id = v_servicio_id;
    elsif v_informe.regularizado then
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


CREATE OR REPLACE FUNCTION public.generar_pedido(p_servicio uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s servicios_postventa%rowtype;
  v_anio text := to_char(now() at time zone 'America/Lima', 'YYYY');
  v_prefijo text;
  v_n integer;
  v_numero text;
  v_faltan integer;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'El pedido lo genera Central';
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.numero_pedido_erp is not null then return v_s.numero_pedido_erp; end if;

  -- REG (0403): sin series no hay pedido. El REG por entregar (0488) no: sus
  -- series las da el almacén, como en cualquier pedido.
  if v_s.regularizado and not coalesce((select reg_por_entregar from informes_cierre where id = v_s.informe_cierre_id), false) then
    select count(*) into v_faltan from pedido_equipos
     where servicio_id = p_servicio and nullif(btrim(coalesce(serie, '')), '') is null;
    if v_faltan > 0 then
      raise exception 'REG: %. Cópielas de las máquinas del cliente en «Equipos de este pedido» y recién genere el pedido',
        case when v_faltan = 1 then 'falta una serie' else format('faltan %s series', v_faltan) end;
    end if;
  end if;

  v_prefijo := case when v_s.es_prueba then 'PRUEBA-PED' else 'PED' end;
  perform pg_advisory_xact_lock(hashtext('generar_pedido_' || v_prefijo || v_anio));
  select coalesce(max(substring(numero_pedido_erp from '^' || v_prefijo || '-(\d+)-' || v_anio || '$')::integer), 0) + 1
    into v_n
    from servicios_postventa
   where es_prueba = v_s.es_prueba
     and numero_pedido_erp ~ ('^' || v_prefijo || '-\d+-' || v_anio || '$');
  v_numero := format('%s-%s-%s', v_prefijo, lpad(v_n::text, 4, '0'), v_anio);

  update servicios_postventa
     set numero_pedido_erp = v_numero, pedido_generado_at = now(), pedido_generado_por = auth.uid(), updated_at = now()
   where id = p_servicio;
  return v_numero;
end $function$;



insert into _migraciones_aplicadas (archivo) values ('0488_reg_por_entregar.sql')
on conflict do nothing;
