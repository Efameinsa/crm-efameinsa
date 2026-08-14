-- ============================================================
-- CRM EFAMEINSA · Migración 0010 · Cotizar actualiza la oportunidad
-- ============================================================
-- Hueco detectado por Darwin (2026-08-14): la etapa 'cotizada' era
-- inalcanzable — estaba bloqueada del cambio manual "porque la pone el
-- cotizador", pero crear_cotizacion() nunca la asignaba. Además, el monto
-- estimado de la oportunidad ahora se actualiza solo con el total de la
-- cotización más reciente (sigue siendo editable a mano en Calificación).
--
-- Reglas:
--  * etapa pasa a 'cotizada' SOLO desde asignada/filtrada — si ya está en
--    seguimiento o potencial, recotizar no la regresa (la negociación no
--    retrocede por emitir una cotización nueva).
--  * monto_estimado y moneda se actualizan SIEMPRE con la última cotización.

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
as $$
declare
  v_oportunidad   oportunidades%rowtype;
  v_cuenta        cuentas%rowtype;
  v_cotizacion_id uuid;
  v_item          jsonb;
  v_producto      productos%rowtype;
  v_tier_piso     tier_precio;
  v_precio_piso   numeric(12,2);
  v_bajo_lista    boolean;
  v_alguna_bajo_lista boolean := false;
  v_subtotal      numeric(12,2) := 0;
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

  insert into cotizaciones (oportunidad_id, serie, cliente_snapshot, condiciones, vigencia_dias, creada_por)
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
    auth.uid()
  )
  returning id into v_cotizacion_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
    if v_producto is null then
      raise exception 'Producto % no encontrado', v_item->>'producto_id';
    end if;

    v_tier_piso := case when v_producto.segmento = 'semi_industrial' then 'deseado' else 'base' end;
    select precio into v_precio_piso
      from precios_producto
      where producto_id = v_producto.id and tier = v_tier_piso and vigente_hasta is null;

    v_bajo_lista := v_precio_piso is not null and (v_item->>'precio_unitario')::numeric < v_precio_piso;
    if v_bajo_lista then v_alguna_bajo_lista := true; end if;

    insert into cotizacion_items (cotizacion_id, producto_id, cantidad, tier_aplicado, precio_lista, precio_unitario, bajo_lista)
    values (
      v_cotizacion_id,
      v_producto.id,
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      (v_item->>'precio_unitario')::numeric,
      v_bajo_lista
    );

    v_subtotal := v_subtotal + (v_item->>'cantidad')::integer * (v_item->>'precio_unitario')::numeric;
  end loop;

  update cotizaciones set
    subtotal = v_subtotal,
    total = v_subtotal,
    estado_aprobacion = (case when v_alguna_bajo_lista then 'pendiente_gerencia' else 'auto_aprobada' end)::estado_aprobacion
  where id = v_cotizacion_id;

  -- Lo nuevo de esta migración:
  update oportunidades set
    etapa = case
      when etapa in ('asignada', 'filtrada') then 'cotizada'::etapa_oportunidad
      else etapa
    end,
    monto_estimado = v_subtotal
  where id = p_oportunidad_id;

  return v_cotizacion_id;
end;
$$;
