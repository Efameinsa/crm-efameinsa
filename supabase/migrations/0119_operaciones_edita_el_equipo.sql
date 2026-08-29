-- ============================================================
-- CRM EFAMEINSA · Migración 0119 · Operaciones edita el equipo
-- ============================================================
-- «Puedo ver que Lesly puede ver el total de catálogos y agregar nuevos equipos
-- pero no puede editar los existentes» (28-08). Cierto: se podía cargar uno
-- nuevo y no corregir el que ya estaba, que es lo que pasa el 99 % de las veces
-- —un precio que sube, una descripción con una errata, una capacidad mal
-- puesta—.
--
-- Cambiar un PRECIO no es escribir un número encima: los precios se versionan
-- (`vigente_hasta`), y el histórico de precios es lo que el cotizador mira para
-- avisarle al comercial a cuánto se le vendió antes a ese cliente. Se vence el
-- vigente y se abre uno nuevo, en una sola operación: hacerlo en dos pasos
-- desde la aplicación deja el equipo sin precio si el segundo falla.
--
-- (El `::tier_precio` no es adorno: `tier` es un enum, y sin el casteo la
-- función falla con «operator does not exist». Lo encontró la verificación, no
-- la lectura.)

create or replace function fijar_precio_producto(p_producto uuid, p_tier text, p_precio numeric)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_actual numeric;
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'Los precios los fija operaciones o gerencia';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;
  if not exists (select 1 from productos where id = p_producto) then
    raise exception 'Ese equipo no existe';
  end if;

  select precio into v_actual
    from precios_producto
   where producto_id = p_producto and tier = p_tier::tier_precio and vigente_hasta is null
   limit 1;

  -- El mismo precio no abre una versión nueva: llenaría el histórico de filas
  -- idénticas y haría ilegible justamente lo que el histórico sirve para leer.
  if v_actual is not null and v_actual = p_precio then
    return jsonb_build_object('sin_cambio', true, 'precio', p_precio);
  end if;

  update precios_producto
     set vigente_hasta = current_date
   where producto_id = p_producto and tier = p_tier::tier_precio and vigente_hasta is null;

  -- DOS CAMBIOS EL MISMO DÍA NO SON DOS VERSIONES, SON UNA CORREGIDA.
  --
  -- El índice uq_precio_vigente es por (producto, tier, vigente_desde): una
  -- versión por día. Sin esto, cambiar un precio y darse cuenta a los cinco
  -- minutos de que faltaba un cero fallaba con «duplicate key» —un error de
  -- base de datos en la cara de quien solo quería corregirse—. Si ya hay una
  -- versión de hoy se reescribe; el histórico de los días anteriores no se
  -- toca, que es lo que hay que conservar.
  if exists (select 1 from precios_producto
              where producto_id = p_producto and tier = p_tier::tier_precio
                and vigente_desde = current_date) then
    update precios_producto
       set precio = p_precio, vigente_hasta = null
     where producto_id = p_producto and tier = p_tier::tier_precio
       and vigente_desde = current_date;
  else
    -- La moneda se hereda del precio que se vence; si no había ninguno, la
    -- que usa el catálogo. Un precio sin moneda no se puede cotizar.
    insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
    values (p_producto, p_tier::tier_precio, p_precio,
            coalesce((select moneda from precios_producto
                       where producto_id = p_producto and tier = p_tier::tier_precio
                       order by vigente_hasta desc nulls first limit 1), 'USD'),
            current_date);
  end if;

  return jsonb_build_object('anterior', v_actual, 'precio', p_precio);
end;
$fn$;

revoke all on function fijar_precio_producto(uuid, text, numeric) from public;
grant execute on function fijar_precio_producto(uuid, text, numeric) to authenticated;
