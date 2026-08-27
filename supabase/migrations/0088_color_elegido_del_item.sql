-- ============================================================
-- 0088 · El color que se eligió, en el ítem de la cotización
-- ============================================================
-- Reportado por Darwin el 27-08, el mismo día que entraron los coches de
-- transporte con una foto por color: «cuando selecciono en el modal que se
-- agarre la opción blanco, no aparece en la cotización PDF».
--
-- Tenía razón, y era mitad de la función: `ficha.colores` dice en qué colores
-- EXISTE el equipo y el PDF los listaba todos («Color disponible: Azul /
-- Blanco / Gris / Verde»), pero no había dónde guardar cuál se le está
-- ofreciendo A ESTE CLIENTE. Elegir la miniatura solo cambiaba la vista previa
-- del buscador y se perdía al agregar el equipo.
--
-- Se guarda en el ÍTEM y no en el producto porque es una decisión de esta
-- cotización: el mismo CO402 puede ir blanco a un cliente y azul al siguiente.
-- Queda como texto libre (no un enum ni una FK) por lo mismo que `colores` es
-- una lista en la ficha: los colores los pone el fabricante en su catálogo y
-- cambian con él.
--
-- El PDF, con el color elegido, imprime «Color: Blanco» y la foto de ESE
-- color; sin él sigue listando los disponibles, como hasta ahora.

alter table cotizacion_items add column if not exists color text;

comment on column cotizacion_items.color is
  'Color con el que se ofrece este equipo, elegido en el buscador del cotizador (migración 0088). Texto libre, uno de ficha.colores del producto. null = no se eligió: el PDF lista los colores disponibles.';

-- Las dos funciones que escriben los ítems se recrean iguales, con `color`
-- agregado al insert. Base: crear_cotizacion de la 0086 y editar_cotizacion de
-- la 0067.

create or replace function crear_cotizacion(
  p_oportunidad_id uuid,
  p_serie serie_cotizacion,
  p_items jsonb,
  p_condiciones text default null,
  p_vigencia_dias integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
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
begin
  select * into v_oportunidad from oportunidades where id = p_oportunidad_id;
  if v_oportunidad is null then
    raise exception 'Oportunidad % no encontrada', p_oportunidad_id;
  end if;
  if v_oportunidad.comercial_id <> auth.uid() and not es_backoffice() then
    raise exception 'No autorizado para cotizar esta oportunidad';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos un producto';
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
    if nullif(v_item->>'producto_id', '') is not null then
      select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
      if v_producto is null then
        raise exception 'Producto % no encontrado', v_item->>'producto_id';
      end if;
      v_tier_piso := case when v_producto.segmento = 'semi_industrial' then 'deseado' else 'base' end;
      select precio into v_precio_piso
        from precios_producto
        where producto_id = v_producto.id and tier = v_tier_piso and vigente_hasta is null;
    elsif nullif(btrim(coalesce(v_item->>'descripcion', '')), '') is null then
      raise exception 'Cada equipo necesita estar en el catálogo o traer una descripción';
    end if;

    v_bajo_lista := v_precio_piso is not null and (v_item->>'precio_unitario')::numeric < v_precio_piso;
    if exige_aprobacion_gerencia(v_producto.id, v_bajo_lista) then
      v_alguno_requiere := true;
    end if;

    v_subtotal := v_subtotal + (v_item->>'cantidad')::integer * (v_item->>'precio_unitario')::numeric;
  end loop;

  insert into cotizaciones (
    oportunidad_id, serie, cliente_snapshot, condiciones, vigencia_dias, creada_por,
    subtotal, total, estado_aprobacion
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
    (case when v_alguno_requiere then 'pendiente_gerencia' else 'auto_aprobada' end)::estado_aprobacion
  )
  returning id into v_cotizacion_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto := null;
    v_precio_piso := null;
    if nullif(v_item->>'producto_id', '') is not null then
      select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
      v_tier_piso := case when v_producto.segmento = 'semi_industrial' then 'deseado' else 'base' end;
      select precio into v_precio_piso
        from precios_producto
        where producto_id = v_producto.id and tier = v_tier_piso and vigente_hasta is null;
    end if;

    v_bajo_lista := v_precio_piso is not null and (v_item->>'precio_unitario')::numeric < v_precio_piso;
    v_requiere := exige_aprobacion_gerencia(v_producto.id, v_bajo_lista);

    insert into cotizacion_items (
      cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado,
      precio_lista, precio_unitario, bajo_lista, requiere_aprobacion, color
    )
    values (
      v_cotizacion_id,
      v_producto.id,
      nullif(btrim(coalesce(v_item->>'descripcion', '')), ''),
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      (v_item->>'precio_unitario')::numeric,
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


create or replace function editar_cotizacion(
  p_cotizacion_id uuid,
  p_items jsonb,
  p_condiciones text default null,
  p_vigencia_dias integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_cot          cotizaciones;
  v_item         jsonb;
  v_producto     productos;
  v_tier_piso    tier_precio;
  v_precio_piso  numeric;
  v_bajo_lista   boolean;
  v_requiere     boolean;
  v_hay_requiere boolean := false;
  v_subtotal     numeric := 0;
  v_descripcion  text;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Duplíquela para hacer una versión nueva.';
  end if;

  -- Solo el dueño de la oportunidad (o backoffice) la edita.
  if not exists (
    select 1 from oportunidades o
    where o.id = v_cot.oportunidad_id
      and (o.comercial_id = auth.uid() or es_backoffice())
  ) then
    raise exception 'Solo el comercial dueño de la oportunidad puede editar su cotización';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos un equipo';
  end if;

  delete from cotizacion_items where cotizacion_id = p_cotizacion_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_descripcion := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
    v_producto := null;
    v_precio_piso := null;

    if nullif(v_item->>'producto_id', '') is not null then
      select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
      if found then
        v_tier_piso := case when v_producto.segmento = 'semi_industrial' then 'deseado' else 'base' end;
        select precio into v_precio_piso
          from precios_producto
          where producto_id = v_producto.id and tier = v_tier_piso and vigente_hasta is null;
      end if;
    end if;

    -- Un equipo escrito a mano no tiene precio de lista contra el cual
    -- compararlo: no dispara aprobación, pero queda visible como fuera de
    -- catálogo.
    v_bajo_lista := v_precio_piso is not null and (v_item->>'precio_unitario')::numeric < v_precio_piso;
    v_requiere := exige_aprobacion_gerencia(v_producto.id, v_bajo_lista);
    if v_requiere then v_hay_requiere := true; end if;

    insert into cotizacion_items (
      cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado,
      precio_lista, precio_unitario, bajo_lista, requiere_aprobacion, color
    )
    values (
      p_cotizacion_id,
      v_producto.id,
      v_descripcion,
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      (v_item->>'precio_unitario')::numeric,
      v_bajo_lista,
      v_requiere,
      nullif(btrim(coalesce(v_item->>'color', '')), '')
    );

    v_subtotal := v_subtotal + ((v_item->>'cantidad')::integer * (v_item->>'precio_unitario')::numeric);
  end loop;

  update cotizaciones set
    subtotal          = v_subtotal,
    total             = v_subtotal,
    condiciones       = coalesce(p_condiciones, condiciones),
    vigencia_dias     = coalesce(p_vigencia_dias, vigencia_dias),
    estado_aprobacion = (case when v_hay_requiere then 'pendiente_gerencia' else 'auto_aprobada' end)::estado_aprobacion,
    aprobada_por      = case when v_hay_requiere then null else aprobada_por end,
    aprobada_at       = case when v_hay_requiere then null else aprobada_at end,
    updated_at        = now()
  where id = p_cotizacion_id;

  return p_cotizacion_id;
end
$function$;
