-- 0403 · Un pedido REG no se genera sin series. Santos, 06-10: Central generó
-- el PED-0014-2026 de AGROCASAGRANDE (EFAMEINSA 005-2026 REG) con «Generar el
-- pedido» sin pasar por «Las escribo yo», y el pedido quedó con sus dos
-- secadoras sin serie. En un REG el almacén ya entregó: nadie más va a
-- escribirlas, así que las copia Central ANTES de generar el pedido. Los
-- pedidos normales siguen pudiendo salir con «serie pendiente».

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

  -- REG (0403): sin series no hay pedido.
  if v_s.regularizado then
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
