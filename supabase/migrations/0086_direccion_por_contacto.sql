-- ============================================================
-- CRM EFAMEINSA · Migración 0086 · La dirección de la cotización sale del contacto, no del cliente
-- ============================================================
-- Pedido de Darwin el 26-08, a partir de un caso real: un cliente (ej.
-- "Alojamientos Andes Prime") puede tener varias sedes o varios contactos en
-- lugares distintos, así que una sola dirección por cuenta no alcanza. La
-- dirección pasa a ser un dato por contacto —como ya lo son el teléfono y el
-- correo— y la cotización imprime la del contacto marcado como principal: el
-- mismo que ya presta el "Atención:".
--
-- (Antes de esto se probó ponerla en la cuenta, editable junto al RUC y la
-- razón social — se descartó el mismo día por la razón de arriba, antes de
-- llegar a producción.)
--
-- NO SE PIERDE LO QUE YA HABÍA: si el contacto principal no tiene dirección
-- cargada (todavía nadie la llenó ahí), se sigue usando `cuentas.direccion`
-- —el dato que ya traían las cuentas importadas— como respaldo, para que las
-- cotizaciones no dejen de traer la dirección que ya traían.

alter table contactos add column if not exists direccion text;

comment on column contactos.direccion is
  'Dirección física de este contacto/sede. La cotización imprime la del contacto principal; si no la tiene, usa cuentas.direccion como respaldo (migración 0086).';

-- ------------------------------------------------------------
-- crear_cotizacion: la dirección del snapshot sale del contacto principal.
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

  -- La ETAPA no se mueve acá: el borrador no salió al cliente. Se guarda el
  -- monto, que sí sirve para dimensionar la oportunidad desde el primer momento.
  update oportunidades set monto_estimado = v_subtotal where id = p_oportunidad_id;

  return v_cotizacion_id;
end;
$function$;
