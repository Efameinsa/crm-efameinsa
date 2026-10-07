-- 0405 · Kit con cantidades propias en la cotización. Gerencia, reunión 06-10
-- 11:01: el kit (p. ej. instalación de secadora, US$ 950) cambia UNA cantidad
-- según el cliente (ducto 3 m → 10 m). Quien cotiza cambia solo las
-- cantidades de sus piezas en ESTE renglón; la ficha del catálogo no se toca
-- ni nace una ficha nueva. El precio lo pone quien cotiza y el renglón va a
-- aprobación de gerencia (sin PIN). Si gerencia ya aprobó ese kit con esas
-- cantidades y ese precio, editar otra cosa no vuelve a preguntar.

alter table public.cotizacion_items add column if not exists detalle_kit jsonb;
comment on column public.cotizacion_items.detalle_kit is 'Piezas del kit con sus cantidades para esta cotización (array de textos «PIEZA  3 UND»); null = las de la ficha (0405).';

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
  v_kit          jsonb;     -- cantidades del kit cambiadas (0405)
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
  select coalesce(jsonb_agg(jsonb_build_object('p', producto_id, 'u', precio_unitario, 'd', case when producto_id is null then descripcion end, 'k', detalle_kit)), '[]'::jsonb)
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

    -- 0405: cantidades del kit cambiadas en este renglón (solo para esta cotización).
    v_kit := case when jsonb_typeof(v_item->'detalle_kit') = 'array' and jsonb_array_length(v_item->'detalle_kit') > 0
                  then v_item->'detalle_kit' end;

    -- Un equipo escrito a mano no tiene precio de lista contra el cual
    -- compararlo: no dispara aprobación, pero queda visible como fuera de
    -- catálogo.
    v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);
    v_requiere := (exige_aprobacion_gerencia(v_producto.id, v_bajo_lista) or postventa_pasa_por_gerencia(v_cot.creada_por) or v_kit is not null);
    if v_requiere then v_hay_requiere := true; end if;
    v_ya_aprobado := v_requiere and v_aprobados_antes @> jsonb_build_array(
      jsonb_build_object('p', v_producto.id, 'u', v_unitario, 'd', case when v_producto.id is null then v_descripcion end, 'k', v_kit));
    if v_requiere and not v_ya_aprobado then v_hay_requiere_nuevo := true; end if;

    insert into cotizacion_items (
      cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado,
      precio_lista, precio_unitario, precio_con_igv, precio_impreso, nombre_impreso, bajo_lista, requiere_aprobacion, color, aprobado, detalle_kit
    )
    values (
      p_cotizacion_id,
      v_producto.id,
      v_descripcion,
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      v_unitario,
      v_con_igv, nullif(v_item->>'precio_impreso', '')::numeric,
      case when v_producto.id is not null then nullif(btrim(coalesce(v_item->>'nombre_impreso', '')), '') end,
      v_bajo_lista,
      v_requiere,
      nullif(btrim(coalesce(v_item->>'color', '')), ''),
      case when v_ya_aprobado then true else null end,
      v_kit
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
  v_kit               jsonb;     -- cantidades del kit cambiadas (0405)
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

    -- 0405: cantidades del kit cambiadas en este renglón (solo para esta cotización).
    v_kit := case when jsonb_typeof(v_item->'detalle_kit') = 'array' and jsonb_array_length(v_item->'detalle_kit') > 0
                  then v_item->'detalle_kit' end;
    v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);
    if (exige_aprobacion_gerencia(v_producto.id, v_bajo_lista) or postventa_pasa_por_gerencia(auth.uid()) or v_kit is not null) then
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

    -- 0405: cantidades del kit cambiadas en este renglón (solo para esta cotización).
    v_kit := case when jsonb_typeof(v_item->'detalle_kit') = 'array' and jsonb_array_length(v_item->'detalle_kit') > 0
                  then v_item->'detalle_kit' end;
    v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);
    v_requiere := (exige_aprobacion_gerencia(v_producto.id, v_bajo_lista) or postventa_pasa_por_gerencia(auth.uid()) or v_kit is not null);

    insert into cotizacion_items (
      cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado,
      precio_lista, precio_unitario, precio_con_igv, precio_impreso, nombre_impreso, bajo_lista, requiere_aprobacion, color, detalle_kit
    )
    values (
      v_cotizacion_id,
      v_producto.id,
      nullif(btrim(coalesce(v_item->>'descripcion', '')), ''),
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      v_unitario,
      v_con_igv, nullif(v_item->>'precio_impreso', '')::numeric,
      case when v_producto.id is not null then nullif(btrim(coalesce(v_item->>'nombre_impreso', '')), '') end,
      v_bajo_lista,
      v_requiere,
      nullif(btrim(coalesce(v_item->>'color', '')), ''),
      v_kit
    );
  end loop;

  -- La ETAPA no se mueve acá: el borrador no salió al cliente. Se guarda el
  -- monto, que sí sirve para dimensionar la oportunidad desde el primer momento.
  update oportunidades set monto_estimado = v_subtotal where id = p_oportunidad_id;

  return v_cotizacion_id;
end;
$function$;
