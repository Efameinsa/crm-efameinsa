-- ============================================================
-- CRM EFAMEINSA · Migración 0390 · El nombre del renglón, a la medida de
-- cada cotización
-- ============================================================
-- Santos, 05-10-2026, desde la cuenta de postventa: «luego de la elección
-- del nombre, dicho nombre también debería poder ser editado… para que pueda
-- personalizar más su cotización (sin editar los servicios y repuestos que
-- Lesly configura desde su vista para todos)».
--
-- `nombre_impreso` es el nombre con el que ESTE renglón sale en el PDF.
-- NULL = el del catálogo, como siempre. El producto no se toca: el código,
-- el precio de referencia, la ficha y la foto siguen siendo los del catálogo.
--
-- crear_cotizacion y editar_cotizacion se parchan sobre la definición viva
-- (nunca se copian: ver 0074/0091); si el bloque no aparece, se aborta.
-- ============================================================

alter table cotizacion_items add column if not exists nombre_impreso text;
comment on column cotizacion_items.nombre_impreso is
  'Nombre con el que este renglón sale impreso (0390). NULL = el nombre del catálogo. No cambia el producto.';

do $$
declare
  v_fn regprocedure;
  v_def text;
  v_nuevo text;
begin
  foreach v_fn in array array[
    'public.crear_cotizacion(uuid,serie_cotizacion,jsonb,text,integer,moneda,numeric)'::regprocedure,
    'public.editar_cotizacion(uuid,jsonb,text,integer,moneda,numeric)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(v_fn);
    if v_def like '%nombre_impreso%' then
      continue;
    end if;
    v_nuevo := replace(v_def,
      'precio_impreso, bajo_lista, requiere_aprobacion, color',
      'precio_impreso, nombre_impreso, bajo_lista, requiere_aprobacion, color');
    if v_nuevo = v_def then
      raise exception '0390: no se encontró la lista de columnas en %', v_fn;
    end if;
    v_def := v_nuevo;
    v_nuevo := replace(v_def,
      $r$v_con_igv, nullif(v_item->>'precio_impreso', '')::numeric,$r$,
      $r$v_con_igv, nullif(v_item->>'precio_impreso', '')::numeric,
      case when v_producto.id is not null then nullif(btrim(coalesce(v_item->>'nombre_impreso', '')), '') end,$r$);
    if v_nuevo = v_def then
      raise exception '0390: no se encontró el valor de precio_impreso en %', v_fn;
    end if;
    execute v_nuevo;
  end loop;
end $$;
