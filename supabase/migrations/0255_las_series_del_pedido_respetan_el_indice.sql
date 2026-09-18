-- 18-09-2026: postventa intentó registrar las 3 series de Gary Group y salió
-- «there is no unique or exclusion constraint matching the ON CONFLICT
-- specification». El único de la serie es por expresión (ux_equipos_serie:
-- upper(trim(serie))), así que `on conflict (serie)` no lo encuentra. Se usa
-- la misma expresión.
create or replace function public.registrar_series_del_pedido(p_servicio uuid, p_series text[], p_garantia_meses int default 24)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s record;
  v_serie text;
  v_base date;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)) then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  foreach v_serie in array p_series loop
    v_serie := upper(btrim(coalesce(v_serie, '')));
    if v_serie = '' then continue; end if;
    insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
      fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
      registrado_por, registrado_en)
    values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_s.equipo, v_s.id, v_s.informe_cierre_id,
      v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
      case when v_base is null then null else (v_base + interval '6 months')::date end, v_s.ubicacion,
      auth.uid(), 'pedido')
    on conflict (upper(btrim(serie))) do update
      set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
          cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
          guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
          fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
