-- ============================================================
-- CRM EFAMEINSA · Migración 0005 · Cotizador (B4)
-- ============================================================

-- R5: crea la cotización y sus items en una sola transacción, calculando por
-- cada item si el precio ofrecido está por debajo del piso permitido
-- (tier 'deseado' en semi-industrial, 'base' en industrial — ⚠️ confirmar con
-- gerencia cuál tier es el piso real del vendedor, ver docs/03-reglas-negocio.md
-- R5). Si algún item queda bajo_lista, la cotización completa nace
-- `pendiente_gerencia` y el constraint `enviada_requiere_aprobacion` de la
-- migración 0001 impide enviarla hasta que gerencia apruebe.
create or replace function crear_cotizacion(
  p_oportunidad_id uuid,
  p_serie serie_cotizacion,
  p_items jsonb,  -- [{producto_id, cantidad, precio_unitario, tier_aplicado?}]
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
    estado_aprobacion = case when v_alguna_bajo_lista then 'pendiente_gerencia' else 'auto_aprobada' end
  where id = v_cotizacion_id;

  return v_cotizacion_id;
end;
$$;

revoke all on function crear_cotizacion(uuid, serie_cotizacion, jsonb, text, integer) from public;
grant execute on function crear_cotizacion(uuid, serie_cotizacion, jsonb, text, integer) to authenticated;

-- Cierra el ciclo: cotización aceptada → venta registrada → etapa de la
-- oportunidad pasa a 'venta' → el trigger de la migración 0001 actualiza
-- cuentas.ultima_venta_at (regla de cartera de 6 meses).
create or replace function registrar_venta(p_cotizacion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cotizacion cotizaciones%rowtype;
  v_oportunidad oportunidades%rowtype;
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
  if v_oportunidad.comercial_id <> auth.uid() and not es_backoffice() then
    raise exception 'No autorizado';
  end if;

  insert into ventas (oportunidad_id, cotizacion_id, serie, monto_total, moneda, registrada_por)
  values (v_oportunidad.id, v_cotizacion.id, v_cotizacion.serie, v_cotizacion.total, v_cotizacion.moneda, auth.uid())
  returning id into v_venta_id;

  update cotizaciones set estado = 'aceptada' where id = v_cotizacion.id;
  update oportunidades set etapa = 'venta', cerrada_at = now() where id = v_oportunidad.id;

  return v_venta_id;
end;
$$;

revoke all on function registrar_venta(uuid) from public;
grant execute on function registrar_venta(uuid) to authenticated;
