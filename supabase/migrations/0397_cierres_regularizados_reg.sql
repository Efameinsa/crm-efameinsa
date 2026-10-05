-- 0397 · Cierres regularizados («REG»). Gerencia, 05-10 16:38 (audio con Santos):
-- los cierres hechos en Word antes del CRM se suben con el correlativo que sigue
-- en la serie del CRM, marcados REG, SIN sumar venta (la venta ya entró por el
-- Excel maestro) y pasan por el circuito desde Central; las series las copia
-- Central, no se le piden al almacén (ya entregó). Piloto: AGROCASAGRANDE
-- (EFA 003 en Word de Katerine, Presu 1755-26).

alter table public.informes_cierre add column if not exists regularizado boolean not null default false;
alter table public.servicios_postventa add column if not exists regularizado boolean not null default false;
comment on column public.informes_cierre.regularizado is 'REG: cierre en Word anterior al CRM, subido con el correlativo que sigue; no se ata a ventas ni cuenta como cierre del día (0397).';
comment on column public.servicios_postventa.regularizado is 'REG: pedido de un cierre regularizado; nace con preparación y despacho hechos (0397).';

CREATE OR REPLACE FUNCTION public.informe_emitido_para_venta(p_cuenta uuid, p_fecha date)
 RETURNS informes_cierre
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_informe informes_cierre%rowtype;
  v_n integer;
begin
  select count(*) into v_n
    from informes_cierre i
   where i.cuenta_id = p_cuenta
     and i.emitido_at is not null
     and i.anulado_at is null
     and i.venta_id is null
     and not i.regularizado
     and abs(i.fecha - p_fecha) <= 7;
  if v_n <> 1 then
    return null;  -- ninguno, o dos candidatos: no se adivina
  end if;
  select i.* into v_informe
    from informes_cierre i
   where i.cuenta_id = p_cuenta
     and i.emitido_at is not null
     and i.anulado_at is null
     and i.venta_id is null
     and not i.regularizado
     and abs(i.fecha - p_fecha) <= 7;
  return v_informe;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atar_informe_suelto(p_informe uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inf   informes_cierre%rowtype;
  v_venta ventas%rowtype;
  v_n     integer;
begin
  select * into v_inf from informes_cierre where id = p_informe;
  if not found
     or v_inf.venta_id is not null      -- ya está atado
     or v_inf.emitido_at is null        -- todavía es borrador
     or v_inf.anulado_at is not null    -- anulado: no ata nada
     or v_inf.cuenta_id is null         -- sin cliente no hay por dónde buscar
     or v_inf.regularizado then         -- REG: su venta ya está en el CRM; no se ata ni se le toca el importe (0397)
    return null;
  end if;

  -- Una sola venta candidata.
  select count(*) into v_n
    from ventas v join oportunidades o on o.id = v.oportunidad_id
   where o.cuenta_id = v_inf.cuenta_id
     and v.origen = 'crm' and v.anulada_at is null
     and abs(v.fecha_venta - v_inf.fecha) <= 7
     and not exists (select 1 from informes_cierre x where x.venta_id = v.id);
  if v_n <> 1 then return null; end if;

  select v.* into v_venta
    from ventas v join oportunidades o on o.id = v.oportunidad_id
   where o.cuenta_id = v_inf.cuenta_id
     and v.origen = 'crm' and v.anulada_at is null
     and abs(v.fecha_venta - v_inf.fecha) <= 7
     and not exists (select 1 from informes_cierre x where x.venta_id = v.id);

  -- Y un solo informe compitiendo por esa venta: si el cliente tiene dos
  -- cierres emitidos esa semana, no se elige por él.
  select count(*) into v_n
    from informes_cierre i
   where i.cuenta_id = v_inf.cuenta_id
     and i.emitido_at is not null and i.anulado_at is null and i.venta_id is null
     and abs(i.fecha - v_venta.fecha_venta) <= 7;
  if v_n <> 1 then return null; end if;

  update informes_cierre set venta_id = v_venta.id
   where id = p_informe and venta_id is null;

  return v_venta.id;
end $function$;

CREATE OR REPLACE FUNCTION public.avisar_central_cierre_emitido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quien text;
begin
  if coalesce(new.es_prueba, false) then return new; end if;
  select coalesce(codigo_comercial || ' · ', '') || nombre into v_quien from perfiles where id = new.creado_por;
  perform crear_notificacion(
    null, 'central', 'cierre_emitido',
    format('%sCierre %s emitido · %s', case when new.regularizado then 'REG · ' else '' end, coalesce(new.codigo, ''), coalesce(v_quien, 'sin autor')),
    left(coalesce(new.cliente_nombre, 'Cliente'), 120) || ' · ' || coalesce(new.moneda, 'USD') || ' ' || to_char(coalesce(new.monto_total, 0), 'FM999G999G990D00'),
    '/central/cierres');
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.supervision_diaria(p_fecha date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
  v_ini   timestamptz := v_fecha::timestamp at time zone 'America/Lima';
  v_fin   timestamptz := (v_fecha + 1)::timestamp at time zone 'America/Lima';
  v_meta  integer := coalesce((select valor::integer from parametros where clave = 'meta_seguimientos_diarios'), 30);
  v_tc    numeric := coalesce((select valor from parametros where clave = 'tc_usd_pen'), 3.75);
  v_comerciales jsonb;
  v_totales     jsonb;
  v_huerfanas   integer;
begin
  if not (es_backoffice() or rol_actual() = 'central'::rol_usuario) then
    raise exception 'No autorizado';
  end if;

  select count(*) into v_huerfanas
  from cotizaciones_historicas
  where fecha = v_fecha and comercial_id is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'nombre', p.nombre,
           'codigo', p.codigo_comercial,
           'es_postventa', p.es_postventa,
           'codigo_anterior', p.codigo_anterior,
           'seguimientos_efectivos', coalesce(a.efectivos, 0),
           'intentos_sin_contacto', coalesce(a.intentos, 0),
           'cumple_meta', coalesce(a.efectivos, 0) >= coalesce(p.meta_gestiones_diarias, v_meta),
           'meta_gestiones', coalesce(p.meta_gestiones_diarias, v_meta),
           'gestiones_postventa', coalesce(pv.n, 0),
           'hace_postventa', p.hace_postventa,
           'por_tipo', coalesce(pt.por_tipo, '{}'::jsonb),
           'cotizaciones', coalesce(cz.n, 0),
           'cotizaciones_archivo', coalesce(cha.n, 0),
           'ventas', coalesce(v.n, 0),
           'monto_vendido_usd', coalesce(v.monto_usd, 0),
           'informes_emitidos', coalesce(inf.n, 0),
           'derivados', coalesce(der.n, 0),
           'agenda_pendiente', coalesce(o.pendiente, 0),
           'agenda_vencida', coalesce(o.vencida, 0),
           'primera_gestion', least(a.primera, pv.primera),
           'ultima_gestion', greatest(a.ultima, pv.ultima)
         ) order by (coalesce(a.efectivos, 0) + coalesce(cz.n, 0) + coalesce(cha.n, 0)) desc, p.codigo_comercial), '[]'::jsonb)
  into v_comerciales
  from perfiles p
  left join lateral (
    select
      count(*) filter (where a.resultado_id is null or r.codigo is distinct from 'NO_CONTESTO') as efectivos,
      count(*) filter (where r.codigo = 'NO_CONTESTO') as intentos,
      min((a.realizada_at at time zone 'America/Lima')::time)
        filter (where a.resultado_id is null or r.codigo is distinct from 'NO_CONTESTO') as primera,
      max((a.realizada_at at time zone 'America/Lima')::time)
        filter (where a.resultado_id is null or r.codigo is distinct from 'NO_CONTESTO') as ultima
    from actividades a
    left join catalogo_resultados_gestion r on r.id = a.resultado_id
    left join oportunidades op_a on op_a.id = a.oportunidad_id
    where a.realizada_por = p.id
      and op_a.tipo_postventa is null
      and a.realizada_at >= v_ini and a.realizada_at < v_fin
      and a.tipo in ('llamada', 'whatsapp', 'email', 'visita', 'reunion_online')
  ) a on true
  left join lateral (
    select count(*) as n,
           min((a2.realizada_at at time zone 'America/Lima')::time) as primera,
           max((a2.realizada_at at time zone 'America/Lima')::time) as ultima
    from actividades a2
    join oportunidades op_b on op_b.id = a2.oportunidad_id
    where a2.realizada_por = p.id
      and a2.realizada_at >= v_ini and a2.realizada_at < v_fin
      and a2.tipo in ('llamada', 'whatsapp', 'email', 'visita', 'reunion_online')
      and op_b.tipo_postventa is not null
  ) pv on true
  left join lateral (
    select coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) as por_tipo
    from (
      select a.tipo::text as tipo, count(*) as n
      from actividades a
      where a.realizada_por = p.id
        and a.realizada_at >= v_ini and a.realizada_at < v_fin
      group by a.tipo
    ) t
  ) pt on true
  left join lateral (
    select count(*) as n
    from cotizaciones c
    join oportunidades o2 on o2.id = c.oportunidad_id
    where o2.comercial_id = p.id
      and c.created_at >= v_ini and c.created_at < v_fin
  ) cz on true
  left join lateral (
    select count(*) as n
    from cotizaciones_historicas ch
    where ch.comercial_id = p.id and ch.fecha = v_fecha
  ) cha on true
  left join lateral (
    select count(*) as n,
           coalesce(sum(case when v.moneda = 'USD' then v.monto_total else v.monto_total / v_tc end), 0) as monto_usd
    from ventas v
    join oportunidades o3 on o3.id = v.oportunidad_id
    where o3.comercial_id = p.id and o3.origen = 'crm' and v.fecha_venta = v_fecha and v.anulada_at is null
  ) v on true
  left join lateral (
    select count(*) as n
    from informes_cierre i
    where i.creado_por = p.id
      and i.emitido_at is not null
      and i.emitido_at >= v_ini and i.emitido_at < v_fin and i.anulado_at is null
      and not i.regularizado  -- REG no es trabajo del día del comercial (0397)
  ) inf on true
  -- Leads que Central le derivó ese día (migración 0059).
  left join lateral (
    select count(*) as n
    from leads l
    where l.asignado_a = p.id
      and l.asignado_at is not null
      and l.asignado_at >= v_ini and l.asignado_at < v_fin
  ) der on true
  left join lateral (
    select
      count(*) filter (
        where o.proxima_accion_at = v_fecha
          and not exists (
            select 1 from actividades a3
            where a3.oportunidad_id = o.id
              and a3.realizada_at >= v_ini and a3.realizada_at < v_fin
          )
      ) as pendiente,
      count(*) filter (where o.proxima_accion_at < v_fecha) as vencida
    from oportunidades o
    where o.comercial_id = p.id
      and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
  ) o on true
  where p.rol = 'comercial' and p.activo and not p.es_prueba;

  select jsonb_build_object(
    'seguimientos_efectivos', coalesce(sum((c->>'seguimientos_efectivos')::int), 0),
    'gestiones_postventa', coalesce(sum((c->>'gestiones_postventa')::int), 0),
    'cotizaciones', coalesce(sum((c->>'cotizaciones')::int), 0),
    'cotizaciones_archivo', coalesce(sum((c->>'cotizaciones_archivo')::int), 0),
    'cotizaciones_archivo_sin_asesor', v_huerfanas,
    'ventas', coalesce(sum((c->>'ventas')::int), 0),
    'informes_emitidos', coalesce(sum((c->>'informes_emitidos')::int), 0),
    'derivados', coalesce(sum((c->>'derivados')::int), 0),
    'comerciales_en_meta', coalesce(sum(((c->>'cumple_meta')::boolean)::int), 0),
    'comerciales_sin_actividad', coalesce(sum((
      (c->>'seguimientos_efectivos')::int = 0
      and (c->>'intentos_sin_contacto')::int = 0
      and (c->>'cotizaciones')::int = 0
      and (c->>'cotizaciones_archivo')::int = 0
      and (c->>'gestiones_postventa')::int = 0
    )::int), 0)
  )
  into v_totales
  from jsonb_array_elements(v_comerciales) c;

  return jsonb_build_object(
    'fecha', v_fecha,
    'meta_seguimientos', v_meta,
    'comerciales', v_comerciales,
    'totales', v_totales
  );
end $function$;

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
      'ENTREGA DE EQUIPO', v_informe.nota_despacho,
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
