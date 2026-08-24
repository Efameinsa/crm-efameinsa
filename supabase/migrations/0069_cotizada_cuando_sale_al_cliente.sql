-- ============================================================
-- CRM EFAMEINSA · Migración 0069 · «Cotizada» cuando el cliente la recibe
-- ============================================================
-- Reportado por C4 el 24-08: «el prospecto sale como cotizado cuando no se le
-- ha cotizado».
--
-- Tenía razón, y el rastro está en los segundos: la cotización se creó a las
-- 17:46:15 y la oportunidad se tocó a las 17:46:23 — la comercial la devolvió a
-- «Filtrada» a mano ocho segundos después de verla mal.
--
-- QUÉ PASABA. `crear_cotizacion()` adelantaba la etapa a 'cotizada' al CREAR el
-- borrador. Pero un borrador no lo vio nadie: no tiene número desde la
-- migración 0064, y desde la 0067 la mayoría espera además el visto bueno de
-- gerencia. El cliente no recibió nada.
--
-- Es el mismo error de fondo que ya se corrigió dos veces hoy —con el
-- correlativo y con el informe de cierre—: el estado avanzaba cuando el trabajo
-- EMPIEZA, no cuando LLEGA. Un prospecto está cotizado cuando tiene la
-- cotización en la mano, no cuando alguien empezó a armársela.
--
-- Y no era solo cosmético: la etapa alimenta el tablero, el reporte diario y
-- los indicadores de gerencia. Un borrador que nunca se envía inflaba el embudo
-- con una cotización que no existe.
--
-- El monto estimado SÍ se sigue guardando al crear: sirve para dimensionar la
-- oportunidad aunque todavía no haya salido nada.

-- ------------------------------------------------------------
-- crear_cotizacion: deja de mover la etapa.
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

  -- La ETAPA ya no se mueve acá: el borrador no salió al cliente. Se guarda el
  -- monto, que sí sirve para dimensionar la oportunidad desde el primer momento.
  update oportunidades set monto_estimado = v_subtotal where id = p_oportunidad_id;

  return v_cotizacion_id;
end;
$function$;

-- ------------------------------------------------------------
-- emitir_cotizacion: acá sí, porque acá el documento sale al cliente.
-- ------------------------------------------------------------
create or replace function emitir_cotizacion(p_cotizacion_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cot         cotizaciones%rowtype;
  v_correlativo integer;
  v_codigo      text;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if not exists (
    select 1 from oportunidades o
    where o.id = v_cot.oportunidad_id
      and (o.comercial_id = auth.uid() or es_backoffice())
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

  v_correlativo := siguiente_correlativo_anual(v_cot.serie::text);
  v_codigo := 'Presu_' || v_correlativo::text || '-' ||
              to_char((now() at time zone 'America/Lima'), 'YY');

  update cotizaciones
     set correlativo = v_correlativo,
         codigo      = v_codigo,
         estado      = 'enviada',
         enviada_at  = now()
   where id = p_cotizacion_id;

  -- Recién ahora el prospecto está cotizado: tiene el documento en la mano.
  -- Solo avanza desde las etapas previas; si ya iba en seguimiento, potencial o
  -- venta, no se retrocede por mandar otra cotización.
  update oportunidades set
    etapa = case
      when etapa in ('asignada', 'filtrada') then 'cotizada'::etapa_oportunidad
      else etapa
    end
  where id = v_cot.oportunidad_id;

  return v_codigo;
end;
$fn$;
