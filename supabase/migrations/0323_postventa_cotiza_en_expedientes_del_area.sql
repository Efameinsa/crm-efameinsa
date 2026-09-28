-- POSTVENTA COTIZA EN LOS EXPEDIENTES DEL ÁREA, SEAN DE QUIEN SEAN (28-09).
--
-- Gabriela (Postventa 2) quiso cotizar un repuesto desde postventa y le salió
-- «no se pudo guardar la cotización… no autorizado»: crear, editar y emitir
-- una cotización solo lo podía hacer el DUEÑO del expediente, y los casos de
-- postventa están a nombre de Rubí (PV). En la reunión del 28-09 quedó que
-- Gabriela es la que cotiza para el área («Gabriela, cotización… post-venta lo
-- va a atacar solamente Rubí»), y ya desde la 0238 cualquiera del área anota
-- en un expediente de postventa.
--
-- Regla: en un expediente DE POSTVENTA (tipo_postventa no nulo) cotiza, edita,
-- emite, cotiza a nombre de otra empresa del grupo y registra la venta
-- cualquiera del área. En los expedientes comerciales no cambia nada: el dueño
-- o gerencia. Las cinco funciones son las vivas con solo su comprobación
-- cambiada, y las políticas nuevas hacen la pregunta de rol UNA vez por
-- consulta (lección de la 0322).

create or replace function puede_cotizar_en(p_oportunidad uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from oportunidades o
     where o.id = p_oportunidad
       and (o.comercial_id = auth.uid()
            or coalesce(es_backoffice(), false)
            or (o.tipo_postventa is not null and coalesce(puede_postventa(), false)))
  )
$$;

CREATE OR REPLACE FUNCTION public.crear_cotizacion(p_oportunidad_id uuid, p_serie serie_cotizacion, p_items jsonb, p_condiciones text DEFAULT NULL::text, p_vigencia_dias integer DEFAULT 15, p_moneda_impresa moneda DEFAULT 'USD'::moneda, p_tipo_cambio numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_oportunidad       oportunidades%rowtype;
  v_cuenta            cuentas%rowtype;
  v_direccion         text;
  v_cotizacion_id     uuid;
  v_item              jsonb;
  v_producto          productos%rowtype;
  v_tier_piso         tier_precio;
  v_precio_piso       numeric(12,2);
  v_bajo_lista        boolean;
  v_requiere          boolean;
  v_alguno_requiere   boolean := false;
  v_subtotal          numeric(12,2) := 0;
  v_con_igv           numeric;   -- precio pactado con IGV (0233)
  v_unitario          numeric;   -- el neto que se guarda e imprime
begin
  select * into v_oportunidad from oportunidades where id = p_oportunidad_id;
  if v_oportunidad is null then
    raise exception 'Oportunidad % no encontrada', p_oportunidad_id;
  end if;
  if not puede_cotizar_en(v_oportunidad.id) then
    raise exception 'No autorizado para cotizar esta oportunidad';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos un producto';
  end if;
  if p_moneda_impresa = 'PEN' and coalesce(p_tipo_cambio, 0) <= 0 then
    raise exception 'Para cotizar en soles hace falta el tipo de cambio que fija gerencia';
  end if;

  select * into v_cuenta from cuentas where id = v_oportunidad.cuenta_id;

  -- Dirección del contacto principal; si no tiene, la de la cuenta.
  select coalesce(
    (select c.direccion from contactos c
      where c.cuenta_id = v_oportunidad.cuenta_id and c.es_principal
      limit 1),
    v_cuenta.direccion
  ) into v_direccion;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto := null;
    v_precio_piso := null;
    v_con_igv := nullif(v_item->>'precio_con_igv', '')::numeric;
    v_unitario := case when v_con_igv is not null then round(v_con_igv / 1.18, 2)
                       else (v_item->>'precio_unitario')::numeric end;
    if nullif(v_item->>'producto_id', '') is not null then
      select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
      if v_producto is null then
        raise exception 'Producto % no encontrado', v_item->>'producto_id';
      end if;
      v_precio_piso := precio_referencia_producto(v_producto.id);
    elsif nullif(btrim(coalesce(v_item->>'descripcion', '')), '') is null then
      raise exception 'Cada equipo necesita estar en el catálogo o traer una descripción';
    end if;

    v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);
    if exige_aprobacion_gerencia(v_producto.id, v_bajo_lista) then
      v_alguno_requiere := true;
    end if;

    v_subtotal := v_subtotal + (v_item->>'cantidad')::integer * v_unitario;
  end loop;

  insert into cotizaciones (
    oportunidad_id, serie, cliente_snapshot, condiciones, vigencia_dias, creada_por,
    subtotal, total, estado_aprobacion, moneda_impresa, tipo_cambio
  )
  values (
    p_oportunidad_id,
    p_serie,
    jsonb_build_object(
      'razon_social', v_cuenta.razon_social,
      'tipo_doc', v_cuenta.tipo_doc,
      'num_doc', v_cuenta.num_doc,
      'direccion', v_direccion
    ),
    p_condiciones,
    p_vigencia_dias,
    auth.uid(),
    v_subtotal,
    v_subtotal,
    (case when v_alguno_requiere then 'pendiente_gerencia' else 'auto_aprobada' end)::estado_aprobacion,
    p_moneda_impresa,
    case when p_moneda_impresa = 'PEN' then p_tipo_cambio end
  )
  returning id into v_cotizacion_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto := null;
    v_precio_piso := null;
    v_con_igv := nullif(v_item->>'precio_con_igv', '')::numeric;
    v_unitario := case when v_con_igv is not null then round(v_con_igv / 1.18, 2)
                       else (v_item->>'precio_unitario')::numeric end;
    if nullif(v_item->>'producto_id', '') is not null then
      select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
      v_precio_piso := precio_referencia_producto(v_producto.id);
    end if;

    v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);
    v_requiere := exige_aprobacion_gerencia(v_producto.id, v_bajo_lista);

    insert into cotizacion_items (
      cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado,
      precio_lista, precio_unitario, precio_con_igv, bajo_lista, requiere_aprobacion, color
    )
    values (
      v_cotizacion_id,
      v_producto.id,
      nullif(btrim(coalesce(v_item->>'descripcion', '')), ''),
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      v_unitario,
      v_con_igv,
      v_bajo_lista,
      v_requiere,
      nullif(btrim(coalesce(v_item->>'color', '')), '')
    );
  end loop;

  -- La ETAPA no se mueve acá: el borrador no salió al cliente. Se guarda el
  -- monto, que sí sirve para dimensionar la oportunidad desde el primer momento.
  update oportunidades set monto_estimado = v_subtotal where id = p_oportunidad_id;

  return v_cotizacion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.editar_cotizacion(p_cotizacion_id uuid, p_items jsonb, p_condiciones text DEFAULT NULL::text, p_vigencia_dias integer DEFAULT 15, p_moneda_impresa moneda DEFAULT NULL::moneda, p_tipo_cambio numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cot          cotizaciones;
  v_item         jsonb;
  v_producto     productos;
  v_tier_piso    tier_precio;
  v_precio_piso  numeric;
  v_bajo_lista   boolean;
  v_requiere     boolean;
  v_hay_requiere boolean := false;
  v_hay_requiere_nuevo boolean := false;
  v_ya_aprobado    boolean;
  v_aprobados_antes jsonb;
  v_subtotal     numeric := 0;
  v_descripcion  text;
  v_con_igv      numeric;   -- precio pactado con IGV (0233)
  v_unitario     numeric;   -- el neto que se guarda e imprime
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if (v_cot.estado <> 'borrador' or v_cot.enviada_at is not null) and coalesce(current_setting('app.corrigiendo_cotizacion', true), '') <> 'si' then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Duplíquela para hacer una versión nueva.';
  end if;

  -- LA RECHAZADA QUEDA COMO HISTÓRICO (Carlos, 15-09; 0237): con el motivo
  -- de gerencia a la vista, y el comercial hace una cotización nueva.
  if v_cot.estado_aprobacion = 'rechazada_gerencia' and coalesce(current_setting('app.corrigiendo_cotizacion', true), '') <> 'si' then
    raise exception 'Gerencia rechazó esta cotización y queda como histórico con su motivo. Haga una cotización nueva con los precios corregidos.';
  end if;

  -- Solo el dueño de la oportunidad (o backoffice) la edita.
  if not exists (
    select 1 from oportunidades o
    where o.id = v_cot.oportunidad_id
      and puede_cotizar_en(o.id)
  ) then
    raise exception 'Solo el comercial dueño de la oportunidad puede editar su cotización';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos un equipo';
  end if;

  -- Lo que gerencia ya aprobó no se le vuelve a preguntar: la aprobación
  -- se pega al par equipo+precio y sobrevive a la edición (01-09, caso
  -- Gavina/Ariana: editar una cláusula la mandaba a pedir permiso de nuevo).
  select coalesce(jsonb_agg(jsonb_build_object('p', producto_id, 'u', precio_unitario)), '[]'::jsonb)
    into v_aprobados_antes
    from cotizacion_items
   where cotizacion_id = p_cotizacion_id and aprobado is true;

  delete from cotizacion_items where cotizacion_id = p_cotizacion_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_descripcion := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
    v_producto := null;
    v_precio_piso := null;
    v_con_igv := nullif(v_item->>'precio_con_igv', '')::numeric;
    v_unitario := case when v_con_igv is not null then round(v_con_igv / 1.18, 2)
                       else (v_item->>'precio_unitario')::numeric end;

    if nullif(v_item->>'producto_id', '') is not null then
      select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
      if found then
        v_precio_piso := precio_referencia_producto(v_producto.id);
      end if;
    end if;

    -- Un equipo escrito a mano no tiene precio de lista contra el cual
    -- compararlo: no dispara aprobación, pero queda visible como fuera de
    -- catálogo.
    v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);
    v_requiere := exige_aprobacion_gerencia(v_producto.id, v_bajo_lista);
    if v_requiere then v_hay_requiere := true; end if;
    v_ya_aprobado := v_requiere and v_producto.id is not null and v_aprobados_antes @> jsonb_build_array(
      jsonb_build_object('p', v_producto.id, 'u', v_unitario));
    if v_requiere and not v_ya_aprobado then v_hay_requiere_nuevo := true; end if;

    insert into cotizacion_items (
      cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado,
      precio_lista, precio_unitario, precio_con_igv, bajo_lista, requiere_aprobacion, color, aprobado
    )
    values (
      p_cotizacion_id,
      v_producto.id,
      v_descripcion,
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      v_unitario,
      v_con_igv,
      v_bajo_lista,
      v_requiere,
      nullif(btrim(coalesce(v_item->>'color', '')), ''),
      case when v_ya_aprobado then true else null end
    );

    v_subtotal := v_subtotal + ((v_item->>'cantidad')::integer * v_unitario);
  end loop;

  update cotizaciones set
    subtotal          = v_subtotal,
    total             = v_subtotal,
    condiciones       = coalesce(p_condiciones, condiciones),
    moneda_impresa    = coalesce(p_moneda_impresa, moneda_impresa),
    tipo_cambio       = case
      when p_moneda_impresa is null then tipo_cambio
      when p_moneda_impresa = 'PEN' then coalesce(p_tipo_cambio, tipo_cambio)
      else null end,
    vigencia_dias     = coalesce(p_vigencia_dias, vigencia_dias),
    estado_aprobacion = (case
      when coalesce(current_setting('app.corrigiendo_cotizacion', true), '') = 'si' then estado_aprobacion::text
      -- hay algo bajo lista que gerencia NO ha visto: a la cola
      when v_hay_requiere_nuevo then 'pendiente_gerencia'
      -- todo lo que requiere ya estaba aprobado: la aprobación se conserva
      when v_hay_requiere then estado_aprobacion::text
      else 'auto_aprobada' end)::estado_aprobacion,
    aprobada_por      = case when v_hay_requiere_nuevo then null else aprobada_por end,
    aprobada_at       = case when v_hay_requiere_nuevo then null else aprobada_at end,
    updated_at        = now()
  where id = p_cotizacion_id;

  -- El monto de la oportunidad sigue al de su cotización (0188): sin
  -- esto el embudo de gerencia se quedaba con la primera versión.
  update oportunidades set monto_estimado = v_subtotal
   where id = v_cot.oportunidad_id;

  return p_cotizacion_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.emitir_cotizacion(p_cotizacion_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cot         cotizaciones%rowtype;
  v_correlativo integer;
  v_codigo      text;
  v_hoy         date := (now() at time zone 'America/Lima')::date;
  v_siguiente   date;
  v_anio        integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_yy          text := to_char((now() at time zone 'America/Lima'), 'YY');
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if not exists (
    select 1 from oportunidades o
    where o.id = v_cot.oportunidad_id
      and puede_cotizar_en(o.id)
  ) then
    raise exception 'Solo el comercial dueño de la oportunidad puede enviarla';
  end if;

  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya fue enviada al cliente';
  end if;

  if v_cot.estado_aprobacion = 'pendiente_gerencia' then
    raise exception 'Gerencia todavía no aprueba los precios de esta cotización';
  end if;
  if v_cot.estado_aprobacion = 'rechazada_gerencia' then
    raise exception 'Gerencia rechazó los precios de esta cotización; corríjala antes de enviarla';
  end if;

  if not exists (select 1 from cotizacion_items where cotizacion_id = p_cotizacion_id) then
    raise exception 'La cotización necesita al menos un equipo';
  end if;

  if cotizacion_es_de_practica(p_cotizacion_id) then
    -- Serie de práctica: contador propio, número lejos de la serie real y
    -- código que lo dice. Si el número ya estuviera ocupado (una siembra
    -- vieja), se salta igual que en la serie real.
    loop
      v_correlativo := siguiente_correlativo_de_practica(
        'PRUEBA-' || v_cot.serie::text || '-' || v_anio::text, 900000);
      exit when not exists (
        select 1 from cotizaciones where serie = v_cot.serie and correlativo = v_correlativo);
    end loop;
    v_codigo := 'PRUEBA_' || (v_correlativo - 900000)::text || '-' || v_yy;
  else
    v_correlativo := siguiente_correlativo_anual(v_cot.serie::text);
    v_codigo := 'Presu_' || v_correlativo::text || '-' || v_yy;
  end if;

  update cotizaciones
     set correlativo = v_correlativo,
         codigo      = v_codigo,
         estado      = 'enviada',
         enviada_at  = now()
   where id = p_cotizacion_id;

  -- El día hábil siguiente: acá se trabaja de lunes a sábado, así que lo único
  -- que se salta es el domingo.
  v_siguiente := v_hoy + 1;
  if extract(dow from v_siguiente) = 0 then v_siguiente := v_siguiente + 1; end if;

  update oportunidades set
    etapa = case
      when etapa in ('asignada', 'filtrada', 'seguimiento') then 'cotizada'::etapa_oportunidad
      else etapa
    end,
    proxima_accion = case
      when proxima_accion ~* 'enviar.*cotiza' then 'Hacer seguimiento'
      else proxima_accion
    end,
    proxima_accion_at = case
      when proxima_accion ~* 'enviar.*cotiza' then v_siguiente
      else proxima_accion_at
    end,
    updated_at = now()
  where id = v_cot.oportunidad_id;

  return v_codigo;
end $function$;

CREATE OR REPLACE FUNCTION public.cotizar_a_nombre_de(p_cotizacion uuid, p_cuenta uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cot       cotizaciones%rowtype;
  v_op        oportunidades%rowtype;
  v_expediente cuentas%rowtype;
  v_destino   cuentas%rowtype;
  v_direccion text;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion;
  if v_cot.id is null then
    raise exception 'La cotización no existe';
  end if;
  select * into v_op from oportunidades where id = v_cot.oportunidad_id;
  if not puede_cotizar_en(v_op.id) then
    raise exception 'No autorizado para cambiar esta cotización';
  end if;
  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya salió al cliente: su razón social no se cambia. Haga una copia y cámbiela ahí';
  end if;

  select * into v_expediente from cuentas where id = v_op.cuenta_id;
  select * into v_destino from cuentas where id = coalesce(p_cuenta, v_op.cuenta_id);
  if v_destino.id is null then
    raise exception 'Esa empresa no existe';
  end if;
  if coalesce(v_destino.cuenta_padre_id, v_destino.id) <> coalesce(v_expediente.cuenta_padre_id, v_expediente.id) then
    raise exception 'Esa empresa no es del mismo grupo que el cliente';
  end if;

  -- Como crear_cotizacion: la dirección del contacto principal del
  -- expediente; si sale a nombre de otra empresa, la dirección fiscal de ella.
  if v_destino.id = v_op.cuenta_id then
    select coalesce(
      (select c.direccion from contactos c where c.cuenta_id = v_op.cuenta_id and c.es_principal limit 1),
      v_expediente.direccion
    ) into v_direccion;
  else
    v_direccion := v_destino.direccion;
  end if;

  update cotizaciones
     set facturar_a_cuenta_id = case when v_destino.id = v_op.cuenta_id then null else v_destino.id end,
         cliente_snapshot = coalesce(cliente_snapshot, '{}'::jsonb) || jsonb_build_object(
           'razon_social', v_destino.razon_social,
           'tipo_doc', v_destino.tipo_doc,
           'num_doc', v_destino.num_doc,
           'direccion', v_direccion
         )
   where id = p_cotizacion;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_venta(p_cotizacion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cotizacion cotizaciones%rowtype;
  v_oportunidad oportunidades%rowtype;
  v_informe informes_cierre%rowtype;
  v_monto numeric;
  v_moneda moneda;
  v_notas text;
  v_venta_id uuid;
begin
  select * into v_cotizacion from cotizaciones where id = p_cotizacion_id;
  if v_cotizacion is null then
    raise exception 'Cotización % no encontrada', p_cotizacion_id;
  end if;
  if v_cotizacion.estado_aprobacion not in ('auto_aprobada', 'aprobada_gerencia') then
    raise exception 'La cotización aún no está aprobada';
  end if;

  select * into v_oportunidad from oportunidades where id = v_cotizacion.oportunidad_id;
  if not puede_cotizar_en(v_oportunidad.id) then
    raise exception 'No autorizado';
  end if;

  -- Lo que se vendió es lo que dice el informe de cierre, si ya se emitió.
  v_monto := v_cotizacion.total;
  v_moneda := v_cotizacion.moneda;
  v_informe := informe_emitido_para_venta(v_oportunidad.cuenta_id, hoy_lima());
  if v_informe.id is not null then
    v_monto := importe_informe_sin_igv(v_informe.items);
    v_moneda := coalesce(v_informe.moneda, v_cotizacion.moneda);
    if v_monto <> v_cotizacion.total or v_moneda <> v_cotizacion.moneda then
      v_notas := format(
        'La cotización %s es por %s %s; la venta se registró por %s %s, que es lo que dice el informe de cierre %s.',
        coalesce(v_cotizacion.codigo, 'sin número'),
        v_cotizacion.moneda, to_char(v_cotizacion.total, 'FM999G999G990D00'),
        v_moneda, to_char(v_monto, 'FM999G999G990D00'),
        coalesce(v_informe.codigo, '(sin código)'));
    end if;
  end if;

  insert into ventas (oportunidad_id, cotizacion_id, serie, monto_total, moneda, registrada_por, notas)
  values (v_oportunidad.id, v_cotizacion.id, v_cotizacion.serie, v_monto, v_moneda, auth.uid(), v_notas)
  returning id into v_venta_id;

  -- Se atan en el acto: el importe y la atadura salen de la misma decisión.
  if v_informe.id is not null then
    update informes_cierre set venta_id = v_venta_id where id = v_informe.id and venta_id is null;
  end if;

  update cotizaciones set estado = 'aceptada' where id = v_cotizacion.id;
  update oportunidades set etapa = 'venta', cerrada_at = now() where id = v_oportunidad.id;

  return v_venta_id;
end;
$function$;

-- Las cotizaciones y sus renglones de un expediente de postventa, para el área.
drop policy if exists cotizaciones_postventa_escribe on cotizaciones;
create policy cotizaciones_postventa_escribe on cotizaciones
  for all
  using ((select coalesce(puede_postventa(), false)) and exists (select 1 from oportunidades o where o.id = cotizaciones.oportunidad_id and o.tipo_postventa is not null))
  with check ((select coalesce(puede_postventa(), false)) and exists (select 1 from oportunidades o where o.id = cotizaciones.oportunidad_id and o.tipo_postventa is not null));

drop policy if exists items_cotizacion_postventa on cotizacion_items;
create policy items_cotizacion_postventa on cotizacion_items
  for all
  using ((select coalesce(puede_postventa(), false)) and exists (select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id where cz.id = cotizacion_items.cotizacion_id and o.tipo_postventa is not null))
  with check ((select coalesce(puede_postventa(), false)) and exists (select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id where cz.id = cotizacion_items.cotizacion_id and o.tipo_postventa is not null));

drop policy if exists versiones_postventa on cotizacion_versiones;
create policy versiones_postventa on cotizacion_versiones
  for select
  using ((select coalesce(puede_postventa(), false)) and exists (select 1 from cotizaciones c join oportunidades o on o.id = c.oportunidad_id where c.id = cotizacion_versiones.cotizacion_id and o.tipo_postventa is not null));
