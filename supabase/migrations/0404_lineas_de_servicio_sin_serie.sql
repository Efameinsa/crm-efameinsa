-- 0404 · Las líneas de SERVICIO del cierre no piden serie. Santos/Central, 06-10:
-- Panaservice (OPEN 037-2026, PED-0015) y San Fernando (PED-0016) son
-- mantenimientos preventivos y su pedido salió como «ENTREGA DE EQUIPO» con 4
-- «equipos» esperando serie. Los cierres cargados desde Word no traen `tipo` en
-- sus líneas, así que el servicio se reconoce también por la descripción
-- («SERVICIO DE …»). Gerencia en la reunión de las 11:01: es un pedido y sigue
-- el procedimiento; solo deja de pedir series que no existen.

create or replace function public.es_linea_de_servicio(p_item jsonb)
 returns boolean
 language sql
 immutable
as $$
  select coalesce(p_item->>'tipo', '') = 'servicio'
      or (p_item->>'tipo' is null and upper(coalesce(p_item->>'descripcion', '')) ~ '^[[:space:]]*SERVICIO[[:space:]]');
$$;

CREATE OR REPLACE FUNCTION public.tipo_pedido_del_informe(p_items jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with v as (
    select case when es_linea_de_servicio(x) then 'servicio' else coalesce(x->>'tipo', 'equipo') end as tipo,
           lower(coalesce(x->>'descripcion', '')) as d
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
     where coalesce(x->>'bloque', 'venta') = 'venta'
  )
  select case
    when not exists (select 1 from v) then 'equipo'
    -- 0314: coches y carros de lavandería no se conectan: se entregan y se cierran.
    when bool_and(d ~ '^[[:space:]]*(coche|carro)[[:space:]]') then 'accesorio'
    when bool_and(tipo = 'repuesto') then 'repuesto'
    -- 0301: el embalaje (jaula, enjaulado) es un servicio que se cierra con fotos, no con informe.
    when bool_and(tipo = 'servicio') and bool_and(d ~ '(embala|jaula|enjaul)') then 'embalaje'
    when bool_and(tipo = 'servicio') and bool_or(d ~ 'revisi') and not bool_or(d ~ 'manteni') then 'revision'
    when bool_and(tipo = 'servicio') then 'mantenimiento'
    else 'equipo' end
  from v;
$function$;

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
        for v_i in 1..v_cant loop
          v_n := v_n + 1;
          insert into pedido_equipos (servicio_id, orden, descripcion, sku, es_prueba)
          values (p_servicio, v_n, v_desc, v_sku, v_s.es_prueba);
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
      case tipo_pedido_del_informe(v_informe.items)
        when 'mantenimiento' then 'MANTENIMIENTO' when 'revision' then 'REVISIÓN' when 'embalaje' then 'EMBALAJE'
        else 'ENTREGA DE EQUIPO' end, v_informe.nota_despacho,
      v_informe.monto_total, v_informe.moneda,
      array_to_string(v_informe.modalidad_pago, ' + '), v_modalidad,
      v_informe.pct_antes_despacho, v_informe.credito_dias,
      coalesce(v_informe.entrega_direccion, v_informe.entrega_lugar),
      v_informe.entrega_fecha, p_numero_pedido, 'crm',
      tipo_pedido_del_informe(v_informe.items)
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

-- Los pedidos ya generados: solo los de puro servicio cuyas filas están vacías
-- (sin serie, sin prueba, sin máquina): PED-0015 y PED-0016 al 06-10.
with afectados as (
  select s.id, tipo_pedido_del_informe(i.items) as tipo
    from servicios_postventa s join informes_cierre i on i.id = s.informe_cierre_id
   where jsonb_typeof(i.items) = 'array'
     and tipo_pedido_del_informe(i.items) in ('mantenimiento', 'revision', 'embalaje')
     and s.tipo_pedido = 'equipo'
     and not exists (select 1 from pedido_equipos e where e.servicio_id = s.id
                      and (e.serie is not null or e.prueba_lista_at is not null or e.equipo_id is not null or e.parte_de is not null))
), borrados as (
  delete from pedido_equipos e using afectados a where e.servicio_id = a.id returning e.id
)
update servicios_postventa s
   set tipo_pedido = a.tipo,
       tipo_servicio = case a.tipo when 'mantenimiento' then 'MANTENIMIENTO' when 'revision' then 'REVISIÓN' else 'EMBALAJE' end,
       updated_at = now()
  from afectados a
 where s.id = a.id;
