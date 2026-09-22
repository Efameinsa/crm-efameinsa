-- LA SERIE NO SE PODÍA REGISTRAR: «there is no unique or exclusion constraint
-- matching the ON CONFLICT specification» (22-09-2026).
--
-- El almacén escribió la serie 604KWLR5K768 de la lavadora LG Titan Max de
-- Ecolav y el CRM rechazó el registro con ese error en inglés. La causa es la
-- misma que ya corrigió la 0255 para `registrar_series_del_pedido`, y que la
-- 0260 volvió a cometer el día siguiente: el índice único de
-- `equipos_instalados` NO es sobre `serie`, es sobre la EXPRESIÓN
-- `upper(btrim(serie))` (índice `ux_equipos_serie`), así que Postgres no
-- encuentra a qué restricción se refiere `on conflict (serie)` y aborta.
--
-- Se parcha esa línea sobre la definición viva de `registrar_serie_del_equipo`.

CREATE OR REPLACE FUNCTION public.registrar_serie_del_equipo(p_item uuid, p_serie text, p_garantia_meses integer DEFAULT 24)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it    record;
  v_s     record;
  v_serie text;
  v_base  date;
  v_eq    uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)) then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  v_serie := upper(btrim(coalesce(p_serie, '')));
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;
  select * into v_s from servicios_postventa where id = v_it.servicio_id;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
    fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
    registrado_por, registrado_en, es_prueba)
  values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_it.descripcion, v_s.id, v_s.informe_cierre_id,
    v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
    case when v_base is null then null else (v_base + interval '6 months')::date end, v_s.ubicacion,
    auth.uid(), 'pedido', v_s.es_prueba)
  on conflict ((upper(btrim(serie)))) do update
    set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
        cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
        modelo_texto = coalesce(equipos_instalados.modelo_texto, excluded.modelo_texto),
        guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
        fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho)
  returning id into v_eq;

  update pedido_equipos set serie = v_serie, equipo_id = v_eq where id = p_item;
  return v_eq;
end;
$function$
