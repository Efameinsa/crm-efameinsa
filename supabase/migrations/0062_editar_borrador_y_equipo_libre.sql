-- ============================================================
-- CRM EFAMEINSA · Migración 0062 · Editar el borrador y cotizar fuera de catálogo
-- ============================================================
-- Dos pedidos del área comercial del 24-08, primer día de uso real, que van
-- juntos porque atacan el mismo problema: el catálogo todavía no está completo
-- y la cotización no perdonaba ni un error.
--
-- 1) EDITAR ANTES DE ENVIAR. Brenda: «tu apoyo para agregar editar previamente
--    la cotización». Hoy no se puede: la migración 0012 hizo la cotización
--    inmutable a nivel de base.
--
--    Esa regla NO se toca en lo que importa. Viene de un problema real de
--    gerencia —«el mismo número de cotización se envía al cliente con dos
--    precios distintos»— y lo que protege es un documento QUE YA SALIÓ. Un
--    borrador no lo vio nadie todavía.
--
--    Así que la inmutabilidad ahora arranca cuando el documento sale, no cuando
--    se crea: se puede editar mientras `estado = 'borrador'` Y `enviada_at is
--    null`. En el instante en que se envía, queda congelada para siempre y hay
--    que duplicarla, igual que antes. La identidad del documento (serie,
--    número, código, oportunidad, autor, fecha de creación) no se puede tocar
--    nunca, ni siquiera en borrador.
--
-- 2) EQUIPO FUERA DE CATÁLOGO. Decisión de Darwin: «es una solución temporal
--    necesaria porque todavía no están todos los productos del inventario
--    subidos al sistema, así que por el momento deberían ser más flexibles».
--    Hoy `producto_id` es obligatorio, así que lo que no está cargado no se
--    puede cotizar y el comercial se queda esperando a logística.
--
--    Se permite un ítem con descripción escrita a mano. Queda marcado como tal
--    para que se vea cuánto se está cotizando por fuera del catálogo — es la
--    medida de cuánto falta cargar, y el día que el inventario esté completo
--    este camino debería quedar en desuso solo.

-- ── 1. Ítems fuera de catálogo ──────────────────────────────────────────────
alter table cotizacion_items
  alter column producto_id drop not null,
  add column if not exists descripcion text;

comment on column cotizacion_items.descripcion is
  'Descripción escrita a mano cuando el equipo todavía no está en el catálogo (migración 0062). Con producto_id nulo, es lo único que identifica al equipo.';

-- Un ítem es de catálogo o es escrito a mano, pero algo tiene que decir.
alter table cotizacion_items
  drop constraint if exists item_identificable;
alter table cotizacion_items
  add constraint item_identificable
  check (producto_id is not null or nullif(btrim(descripcion), '') is not null);

-- ── 2. Inmutabilidad: desde que sale, no desde que se crea ──────────────────
create or replace function bloquear_edicion_items_cotizacion()
returns trigger language plpgsql as $$
declare
  v_estado  estado_cotizacion;
  v_enviada timestamptz;
  v_fila    cotizacion_items;
begin
  v_fila := case when tg_op = 'DELETE' then old else new end;

  select c.estado, c.enviada_at into v_estado, v_enviada
  from cotizaciones c
  where c.id = (case when tg_op = 'DELETE' then old.cotizacion_id else new.cotizacion_id end);

  -- El padre ya no existe: es el borrado en cascada de la cotización entera.
  -- No hay documento que proteger.
  if not found then
    return v_fila;
  end if;

  if v_estado = 'borrador' and v_enviada is null then
    return v_fila;
  end if;

  raise exception 'Esta cotización ya salió al cliente: sus equipos no se modifican. Duplíquela para hacer una versión nueva.';
end;
$$;

create or replace function bloquear_edicion_cotizacion()
returns trigger language plpgsql as $$
declare
  v_editable boolean := old.estado = 'borrador' and old.enviada_at is null;
begin
  -- La IDENTIDAD del documento no cambia nunca, ni en borrador: si el número
  -- o el cliente pudieran moverse, el correlativo dejaría de significar algo.
  if new.serie is distinct from old.serie
     or new.correlativo is distinct from old.correlativo
     or new.codigo is distinct from old.codigo
     or new.oportunidad_id is distinct from old.oportunidad_id
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at
  then
    raise exception 'La serie, el número y el cliente de una cotización no se cambian.';
  end if;

  if v_editable then
    return new;
  end if;

  if new.cliente_snapshot is distinct from old.cliente_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.moneda is distinct from old.moneda
     or new.condiciones is distinct from old.condiciones
     or new.vigencia_dias is distinct from old.vigencia_dias
  then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Duplíquela para hacer una versión nueva.';
  end if;

  return new;
end;
$$;

-- ── 3. Editar el borrador ───────────────────────────────────────────────────
-- Reemplaza los equipos y las condiciones de una cotización que todavía no se
-- envió, recalculando importes y aprobación. Mismo criterio de precio piso que
-- crear_cotizacion: si algún equipo queda bajo lista, vuelve a pedir la
-- aprobación de gerencia (y si el comercial corrigió el precio hacia arriba,
-- la aprobación pendiente se cancela sola).
create or replace function editar_cotizacion(
  p_cotizacion_id uuid,
  p_items         jsonb,
  p_condiciones   text default null,
  p_vigencia_dias integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot          cotizaciones;
  v_item         jsonb;
  v_producto     productos;
  v_tier_piso    tier_precio;
  v_precio_piso  numeric;
  v_bajo_lista   boolean;
  v_hay_bajo     boolean := false;
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
    if v_bajo_lista then v_hay_bajo := true; end if;

    insert into cotizacion_items (
      cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado,
      precio_lista, precio_unitario, bajo_lista
    )
    values (
      p_cotizacion_id,
      v_producto.id,
      v_descripcion,
      (v_item->>'cantidad')::integer,
      nullif(v_item->>'tier_aplicado', '')::tier_precio,
      v_precio_piso,
      (v_item->>'precio_unitario')::numeric,
      v_bajo_lista
    );

    v_subtotal := v_subtotal + ((v_item->>'cantidad')::integer * (v_item->>'precio_unitario')::numeric);
  end loop;

  update cotizaciones set
    subtotal          = v_subtotal,
    total             = v_subtotal,
    condiciones       = coalesce(p_condiciones, condiciones),
    vigencia_dias     = coalesce(p_vigencia_dias, vigencia_dias),
    estado_aprobacion = (case when v_hay_bajo then 'pendiente_gerencia' else 'auto_aprobada' end)::estado_aprobacion,
    aprobada_por      = case when v_hay_bajo then null else aprobada_por end,
    aprobada_at       = case when v_hay_bajo then null else aprobada_at end,
    updated_at        = now()
  where id = p_cotizacion_id;

  return p_cotizacion_id;
end $$;

revoke all on function editar_cotizacion(uuid, jsonb, text, integer) from public;
grant execute on function editar_cotizacion(uuid, jsonb, text, integer) to authenticated;

-- ── 4. crear_cotizacion acepta equipos fuera de catálogo ────────────────────
CREATE OR REPLACE FUNCTION public.crear_cotizacion(p_oportunidad_id uuid, p_serie serie_cotizacion, p_items jsonb, p_condiciones text DEFAULT NULL::text, p_vigencia_dias integer DEFAULT 15)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    insert into cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, tier_aplicado, precio_lista, precio_unitario, bajo_lista)
    values (
      v_cotizacion_id,
      v_producto.id,
      nullif(btrim(coalesce(v_item->>'descripcion', '')), ''),
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
$function$

