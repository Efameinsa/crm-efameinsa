-- ============================================================
-- CRM EFAMEINSA · Migración 0067 · Todo equipo industrial pasa por gerencia
-- ============================================================
-- Pedido del área comercial el 24-08: «en semi industriales ya están definidos
-- los precios, pero en industriales por lo general se necesita aprobar por
-- gerencia, así que mejor siempre pida aprobación».
--
-- Hasta ahora la aprobación se disparaba SOLO por precio: si algún equipo iba
-- por debajo de su piso. Un industrial cotizado justo al precio de lista salía
-- auto-aprobado y se enviaba sin que gerencia lo viera. Y en industriales el
-- precio de lista es un punto de partida, no un precio cerrado: casi siempre se
-- negocia. Por eso el pedido.
--
-- ⚠️ ALCANCE, PARA QUE NO SORPRENDA: 55 de los 65 equipos activos son
-- industriales. Esto significa que la mayoría de las cotizaciones va a quedar
-- detenida esperando a gerencia. Es exactamente lo que se pidió, pero cambia el
-- ritmo de trabajo de todos los días: si gerencia no aprueba, el comercial no
-- envía. Conviene que el ing. Carlos lo sepa antes de que le lleguen.
--
-- SE SEPARA EL "POR QUÉ" DEL "SI". `bajo_lista` sigue significando lo que
-- significaba —este precio está por debajo del piso— porque es lo que se mira
-- para saber cuánto margen se está cediendo. Se agrega `requiere_aprobacion`,
-- que es lo que gerencia tiene que resolver: bajo lista O industrial. Sin esta
-- separación, la pantalla de aprobación por ítem (migración 0064) no tendría
-- nada que mostrar cuando un industrial va al precio de lista.

alter table cotizacion_items
  add column if not exists requiere_aprobacion boolean not null default false;

comment on column cotizacion_items.requiere_aprobacion is
  'Este equipo necesita el visto bueno de gerencia: va bajo el precio piso, o es industrial (donde el precio de lista es un punto de partida). Es lo que se decide en la pantalla de aprobación; `bajo_lista` sigue midiendo solo el precio. Migración 0067.';

-- Lo ya cargado conserva su criterio anterior: solo el precio. No se reabre una
-- cotización que ya se resolvió.
update cotizacion_items set requiere_aprobacion = bajo_lista where requiere_aprobacion is distinct from bajo_lista;

-- ------------------------------------------------------------
-- Un solo lugar donde vive la regla, para que las dos funciones no se
-- desincronicen cuando mañana cambie.
-- ------------------------------------------------------------
create or replace function exige_aprobacion_gerencia(p_producto_id uuid, p_bajo_lista boolean)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_bajo_lista, false)
      or exists (select 1 from productos p where p.id = p_producto_id and p.segmento = 'industrial');
$$;

comment on function exige_aprobacion_gerencia(uuid, boolean) is
  'Regla única: gerencia decide sobre un equipo si va bajo el precio piso o si es industrial (migración 0067).';

-- ------------------------------------------------------------
-- crear_cotizacion: idéntica a la anterior salvo el criterio de aprobación.
-- ------------------------------------------------------------
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

  -- Primera pasada: validar productos y calcular subtotal/aprobación ANTES
  -- de crear la fila (así no hace falta un update posterior, bloqueado por
  -- el trigger de inmutabilidad).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Equipo fuera de catálogo (migración 0062): sin producto_id, se
    -- identifica por la descripción escrita a mano. No tiene precio de lista
    -- contra el cual compararlo, así que no dispara aprobación.
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
      'direccion', v_cuenta.direccion
    ),
    p_condiciones,
    p_vigencia_dias,
    auth.uid(),
    v_subtotal,
    v_subtotal,
    (case when v_alguno_requiere then 'pendiente_gerencia' else 'auto_aprobada' end)::estado_aprobacion
  )
  returning id into v_cotizacion_id;

  -- Segunda pasada: insertar los ítems (necesitan el id ya asignado arriba).
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
      precio_lista, precio_unitario, bajo_lista, requiere_aprobacion
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
      v_requiere
    );
  end loop;

  update oportunidades set
    etapa = case
      when etapa in ('asignada', 'filtrada') then 'cotizada'::etapa_oportunidad
      else etapa
    end,
    monto_estimado = v_subtotal
  where id = p_oportunidad_id;

  return v_cotizacion_id;
end;
$function$;

-- ------------------------------------------------------------
-- editar_cotizacion: mismo cambio.
-- ------------------------------------------------------------
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
      precio_lista, precio_unitario, bajo_lista, requiere_aprobacion
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
      v_requiere
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

-- ------------------------------------------------------------
-- La resolución por ítem pasa a mirar `requiere_aprobacion` en vez de
-- `bajo_lista`: si no, un industrial al precio de lista no aparecería para
-- decidir y la cotización se aprobaría sola sin que gerencia viera nada.
-- ------------------------------------------------------------
create or replace function resolver_aprobacion_cotizacion(
  p_cotizacion_id uuid,
  p_aprobados     uuid[],
  p_rechazados    uuid[],
  p_nota          text default null
)
returns estado_aprobacion
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cot         cotizaciones%rowtype;
  v_sin_decidir integer;
  v_resultado   estado_aprobacion;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if not es_backoffice() then
    raise exception 'Solo gerencia aprueba precios bajo lista';
  end if;

  if v_cot.estado_aprobacion <> 'pendiente_gerencia' then
    raise exception 'Esta cotización ya fue resuelta';
  end if;

  select count(*) into v_sin_decidir
    from cotizacion_items ci
   where ci.cotizacion_id = p_cotizacion_id
     and ci.requiere_aprobacion
     and not (ci.id = any(coalesce(p_aprobados, '{}'::uuid[])))
     and not (ci.id = any(coalesce(p_rechazados, '{}'::uuid[])));
  if v_sin_decidir > 0 then
    raise exception 'Faltan % equipo(s) por aprobar o rechazar', v_sin_decidir;
  end if;

  update cotizacion_items set aprobado = true
   where cotizacion_id = p_cotizacion_id and id = any(coalesce(p_aprobados, '{}'::uuid[]));
  update cotizacion_items set aprobado = false
   where cotizacion_id = p_cotizacion_id and id = any(coalesce(p_rechazados, '{}'::uuid[]));

  v_resultado := (case
    when coalesce(array_length(p_rechazados, 1), 0) > 0 then 'rechazada_gerencia'
    else 'aprobada_gerencia'
  end)::estado_aprobacion;

  update cotizaciones
     set estado_aprobacion = v_resultado,
         aprobada_por      = auth.uid(),
         aprobada_at       = now(),
         nota_gerencia     = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_cotizacion_id;

  return v_resultado;
end;
$fn$;
