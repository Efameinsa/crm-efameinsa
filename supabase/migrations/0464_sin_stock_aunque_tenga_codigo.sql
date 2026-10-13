-- 0464 · «SIN STOCK» AUNQUE YA TENGA CÓDIGO (Lesly y Santos, 13-10)
--
-- Regla de la 0260: con serie = hay stock. Pero un repuesto de importación
-- necesita su código apenas Central lo pide, y todavía no llega: la tarjeta de
-- Vidawasi (OPEN 058-2026) quedó «IM000000236 · en stock» aunque Lesly marcó
-- importación, y para decir que no había intentó poner «NO HAY STOCK» como serie.
--
-- Ahora una fila con serie o código puede marcarse sin stock (con su motivo:
-- importación, compra local o fabricación) y desmarcarse cuando llega. Mientras
-- tanto cuenta como sin stock en el paso a paso, la macro y la lista de
-- importaciones. Registrar una serie en una fila que no la tenía sigue
-- limpiando el sin stock, como hasta hoy (llegó y se registró).

CREATE OR REPLACE FUNCTION public.marcar_sin_stock(p_item uuid, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo el almacén, postventa o Central marcan el stock';
  end if;
  if v_motivo is not null and v_motivo not in ('importacion', 'compra_local', 'fabricacion') then
    raise exception 'Motivo no válido: importación, compra local o fabricación';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese artículo no está en el pedido'; end if;

  -- Las unidades iguales del pedido van juntas; las que ya tienen serie o código
  -- solo cambian si están en la misma situación que la tocada (0464).
  update pedido_equipos
     set sin_stock_motivo = v_motivo,
         sin_stock_at = case when v_motivo is null then null else now() end,
         sin_stock_por = case when v_motivo is null then null else auth.uid() end,
         -- Sin serie, quitar el motivo quita también la procedencia (como antes);
         -- con código, «ya llegó» deja la procedencia como estaba.
         procedencia = case when v_motivo is not null then v_motivo when serie is null then null else procedencia end,
         procedencia_at = case when v_motivo is not null then now() when serie is null then null else procedencia_at end,
         procedencia_por = case when v_motivo is not null then auth.uid() when serie is null then null else procedencia_por end
   where servicio_id = v_it.servicio_id
     and btrim(descripcion) = btrim(v_it.descripcion)
     and (serie is null) = (v_it.serie is null);
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_procedencia(p_item uuid, p_procedencia text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it record;
  v_p text := nullif(btrim(coalesce(p_procedencia, '')), '');
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo el almacén, postventa o Central marcan la procedencia';
  end if;
  if v_p is not null and v_p not in ('importacion', 'compra_local', 'fabricacion') then
    raise exception 'Procedencia no válida: importación, compra local o fabricación';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese artículo no está en el pedido'; end if;

  -- Como el código sin serie y el sin stock: las unidades iguales del pedido
  -- comparten la procedencia (cinco lavadoras importadas juntas). Con código y
  -- marcada sin stock (0464), el motivo sigue a la procedencia.
  update pedido_equipos
     set procedencia = v_p,
         procedencia_at = case when v_p is null then null else now() end,
         procedencia_por = case when v_p is null then null else auth.uid() end,
         sin_stock_motivo = case when serie is null then v_p
                                 when sin_stock_motivo is not null then coalesce(v_p, sin_stock_motivo)
                                 else sin_stock_motivo end,
         sin_stock_at = case when serie is null then (case when v_p is null then null else now() end) else sin_stock_at end,
         sin_stock_por = case when serie is null then (case when v_p is null then null else auth.uid() end) else sin_stock_por end
   where servicio_id = v_it.servicio_id
     and btrim(descripcion) = btrim(v_it.descripcion);
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.importaciones_pendientes()
 RETURNS TABLE(item_id uuid, pedido_id uuid, cliente text, descripcion text, sku text, motivo text, marcado_at timestamp with time zone, eta date, nota text, actualizada_at timestamp with time zone, pedido_desde timestamp with time zone, tipo_pedido text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not puede_importaciones() then raise exception 'Solo importaciones, almacén, operaciones o gerencia ven esta lista'; end if;
  return query
    select pe.id, sp.id,
           coalesce(c.razon_social, sp.cliente_texto, '—'),
           pe.descripcion, pe.sku, pe.sin_stock_motivo, pe.sin_stock_at,
           pe.importacion_eta, pe.importacion_nota, pe.importacion_actualizada_at,
           coalesce(sp.pedido_generado_at, sp.liquidacion_at, sp.created_at),
           sp.tipo_pedido
      from pedido_equipos pe
      join servicios_postventa sp on sp.id = pe.servicio_id
      left join cuentas c on c.id = sp.cuenta_id
     where ((pe.serie is null and coalesce(pe.sin_serie, false) = false)
            or pe.sin_stock_motivo is not null)   -- 0464: con código pero sin stock
       and pe.parte_de is null
       and sp.cerrado_at is null
       and sp.despachado_at is null
       and not coalesce(sp.es_prueba, false)
       and not coalesce(sp.regularizado, false)
     order by (pe.sin_stock_motivo = 'importacion') desc nulls last, pe.importacion_eta nulls last, 11;
end $function$;
