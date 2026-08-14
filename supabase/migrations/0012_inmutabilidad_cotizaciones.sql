-- ============================================================
-- CRM EFAMEINSA · Migración 0012 · Inmutabilidad de cotizaciones (B7.6)
-- ============================================================
-- Regla de gerencia (docs/06): "tan pronto se sube, no se puede modificar" —
-- les ha pasado que el mismo número de cotización se envía al cliente con dos
-- precios distintos. Ya era inmutable de facto (no hay UI de edición); esto
-- lo formaliza a nivel de base de datos para que ni un futuro cambio de UI
-- ni un script directo puedan violarla.
--
-- Importante: crear_cotizacion() (migración 0010) calculaba subtotal/total/
-- estado_aprobacion con un UPDATE posterior al INSERT de la cotización — eso
-- chocaría con el trigger de abajo (dispararía sobre la fila recién creada,
-- ya que subtotal/total no están en la lista de columnas editables). Se
-- redefine para calcular todo ANTES del insert: la fila nace completa y
-- ningún flujo normal (crear, duplicar) vuelve a tocar esas columnas.
--
-- Los scripts de limpieza de datos de prueba que necesiten borrar
-- cotizacion_items deben conectarse con DATABASE_URL (pg directo, no
-- supabase-js) y ejecutar `set session_replication_role = replica` antes del
-- delete — service_role bypassa RLS pero NO triggers normales.

create or replace function bloquear_edicion_items_cotizacion()
returns trigger language plpgsql as $$
begin
  raise exception 'Los ítems de una cotización no se modifican; duplique la cotización';
end;
$$;

create trigger trg_cotizacion_items_inmutable
  before update or delete on cotizacion_items
  for each row execute function bloquear_edicion_items_cotizacion();

create or replace function bloquear_edicion_cotizacion()
returns trigger language plpgsql as $$
begin
  if new.serie is distinct from old.serie
     or new.correlativo is distinct from old.correlativo
     or new.codigo is distinct from old.codigo
     or new.oportunidad_id is distinct from old.oportunidad_id
     or new.cliente_snapshot is distinct from old.cliente_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.moneda is distinct from old.moneda
     or new.condiciones is distinct from old.condiciones
     or new.vigencia_dias is distinct from old.vigencia_dias
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at
  then
    raise exception 'La cotización es inmutable; duplíquela para modificarla';
  end if;
  return new;
end;
$$;

create trigger trg_cotizaciones_inmutable
  before update on cotizaciones
  for each row execute function bloquear_edicion_cotizacion();

-- Redefinición: calcula subtotal/total/estado_aprobacion ANTES del insert,
-- así la fila de cotizaciones nace completa (ver nota arriba). El resto de
-- la lógica (validación, tier piso, bajo_lista, items, oportunidad) es
-- idéntica a la migración 0010.
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
  v_oportunidad       oportunidades%rowtype;
  v_cuenta            cuentas%rowtype;
  v_cotizacion_id     uuid;
  v_item              jsonb;
  v_producto          productos%rowtype;
  v_tier_piso         tier_precio;
  v_precio_piso       numeric(12,2);
  v_bajo_lista        boolean;
  v_alguna_bajo_lista boolean := false;
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
    select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
    if v_producto is null then
      raise exception 'Producto % no encontrado', v_item->>'producto_id';
    end if;

    v_tier_piso := case when v_producto.segmento = 'semi_industrial' then 'deseado' else 'base' end;
    select precio into v_precio_piso
      from precios_producto
      where producto_id = v_producto.id and tier = v_tier_piso and vigente_hasta is null;

    if v_precio_piso is not null and (v_item->>'precio_unitario')::numeric < v_precio_piso then
      v_alguna_bajo_lista := true;
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
    (case when v_alguna_bajo_lista then 'pendiente_gerencia' else 'auto_aprobada' end)::estado_aprobacion
  )
  returning id into v_cotizacion_id;

  -- Segunda pasada: insertar los ítems (necesitan el id ya asignado arriba).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;

    v_tier_piso := case when v_producto.segmento = 'semi_industrial' then 'deseado' else 'base' end;
    select precio into v_precio_piso
      from precios_producto
      where producto_id = v_producto.id and tier = v_tier_piso and vigente_hasta is null;

    v_bajo_lista := v_precio_piso is not null and (v_item->>'precio_unitario')::numeric < v_precio_piso;

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
$$;
