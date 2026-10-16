-- EL PROTOCOLO DE UN PEDIDO DE REPUESTOS ES DEL KIT COMPLETO (Ariana, almacén,
-- 16-10, buzón 398be8d3, LINO ESPIRITU JOSMEL ETZON PED-0032-2026: «verificar
-- que el protocolo salga como kit completo y no como foto detallada de cada
-- repuesto»). El kit de instalación a gas de la secadora son 14 piezas
-- (válvulas, manómetro, manguera, niples, bush, codo, tee): se prueba y se
-- embala junto, con unas fotos del kit armado y un técnico.
--
-- 1. protocolo_falta_para_probar (tomada viva, igual a la 0489): en un pedido
--    de repuestos las fotos de cualquier pieza del pedido y el técnico de
--    cualquiera cuentan para todas.
-- 2. almacen_probar_kit: marca de una vez todas las piezas que van en este
--    despacho; lo que se sube con el clic queda en la primera pieza.

CREATE OR REPLACE FUNCTION public.protocolo_falta_para_probar(p_item uuid, p_protocolo_ref text, p_fotos jsonb, p_partes jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it record;
  v_p record;
  v text[] := '{}';
  v_repuesto boolean;
  v_nombre text;
  v_todos jsonb;
  v_desc text;
  v_datos jsonb;
begin
  select pe.*, s.tipo_pedido into v_it from pedido_equipos pe join servicios_postventa s on s.id = pe.servicio_id where pe.id = p_item;
  if v_it.id is null then return array['Ese equipo no está en el pedido']; end if;
  v_repuesto := coalesce(v_it.tipo_pedido, '') = 'repuesto';
  v_nombre := 'Máquina ' || v_it.orden;
  v_desc := upper(coalesce(v_it.descripcion, ''));
  v_todos := (case when jsonb_typeof(v_it.protocolo_fotos) = 'array' then v_it.protocolo_fotos else '[]'::jsonb end)
          || (case when jsonb_typeof(p_fotos) = 'array' then p_fotos else '[]'::jsonb end);
  v_datos := coalesce(v_it.protocolo_datos->'principal', '{}');
  -- 0517: en un pedido de repuestos el protocolo es del KIT completo (Ariana,
  -- 16-10, LINO PED-0032-2026): las fotos de cualquier pieza y el técnico de
  -- cualquiera valen para todas.
  if v_repuesto then
    v_todos := v_todos || coalesce((select jsonb_agg(f) from pedido_equipos pe, jsonb_array_elements(case when jsonb_typeof(pe.protocolo_fotos) = 'array' then pe.protocolo_fotos else '[]'::jsonb end) f
                                     where pe.servicio_id = v_it.servicio_id and pe.id <> p_item), '[]'::jsonb);
    if btrim(coalesce(v_datos->>'tecnico', '')) = '' then
      v_datos := v_datos || coalesce((select jsonb_build_object('tecnico', pe.protocolo_datos->'principal'->>'tecnico') from pedido_equipos pe
                                       where pe.servicio_id = v_it.servicio_id and btrim(coalesce(pe.protocolo_datos->'principal'->>'tecnico', '')) <> ''
                                       order by pe.orden limit 1), '{}'::jsonb);
    end if;
  end if;
  v := v || protocolo_falta_en_maquina(
    v_nombre, v_datos, coalesce(v_it.protocolo_chequeo->'principal', '{}'),
    (select coalesce(jsonb_agg(a), '[]') from jsonb_array_elements(v_todos) a where coalesce(a->>'path', '') !~ '-secadora-'),
    coalesce(nullif(btrim(split_part(coalesce(v_it.serie, ''), '/', 1)), ''), case when v_desc ~ 'SERIE' then 'en la descripción' end),
    protocolo_es_lavadora(v_it.descripcion, v_it.protocolo_datos->'principal', v_it.parte_nombre), v_repuesto);
  -- La secadora de una torre sin renglón propio (sus archivos suben con «-secadora-»).
  if not v_repuesto and not exists (select 1 from pedido_equipos where parte_de = p_item)
     and (v_desc ~ '\mTORRE\M' or (v_desc like '%LAVADORA%' and v_desc like '%SECADORA%')) then
    v := v || protocolo_falta_en_maquina(
      'Secadora de la torre', coalesce(v_it.protocolo_datos->'secadora', '{}'), coalesce(v_it.protocolo_chequeo->'secadora', '{}'),
      (select coalesce(jsonb_agg(a), '[]') from jsonb_array_elements(v_todos) a where coalesce(a->>'path', '') ~ '-secadora-'),
      coalesce(nullif(btrim(split_part(coalesce(v_it.serie, ''), '/', 2)), ''), case when v_desc ~ 'SERIE.*SERIE' then 'en la descripción' end),
      true, false);  -- 0489: la secadora de la torre también tiene su hoja
  end if;
  for v_p in select * from pedido_equipos where parte_de = p_item order by orden loop
    v := v || protocolo_falta_en_maquina(
      coalesce(v_p.parte_nombre, 'Otra máquina'), coalesce(v_p.protocolo_datos->'principal', '{}'), coalesce(v_p.protocolo_chequeo->'principal', '{}'),
      (case when jsonb_typeof(v_p.protocolo_fotos) = 'array' then v_p.protocolo_fotos else '[]'::jsonb end)
        || coalesce((select x->'fotos' from jsonb_array_elements(case when jsonb_typeof(p_partes) = 'array' then p_partes else '[]'::jsonb end) x
                      where x->>'id' = v_p.id::text and jsonb_typeof(x->'fotos') = 'array' limit 1), '[]'::jsonb),
      v_p.serie,
      protocolo_es_lavadora(v_p.descripcion, v_p.protocolo_datos->'principal', v_p.parte_nombre), v_repuesto);
  end loop;
  return v;
end $function$;


CREATE OR REPLACE FUNCTION public.almacen_probar_kit(p_servicio uuid, p_protocolo_ref text, p_fotos jsonb DEFAULT '[]'::jsonb, p_nota text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
  v_primera uuid;
  v_it record;
  v_listo boolean := false;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if coalesce(v_s.tipo_pedido, '') <> 'repuesto' then raise exception 'El kit completo se marca solo en pedidos de repuestos'; end if;
  select id into v_primera from pedido_equipos
   where servicio_id = p_servicio and parte_de is null and en_este_despacho and prueba_lista_at is null
   order by orden limit 1;
  if v_primera is null then raise exception 'Todas las piezas que van ya están marcadas'; end if;
  if jsonb_typeof(p_fotos) = 'array' and jsonb_array_length(p_fotos) > 0 then
    update pedido_equipos set protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || p_fotos where id = v_primera;
  end if;
  for v_it in select id from pedido_equipos
               where servicio_id = p_servicio and parte_de is null and en_este_despacho and prueba_lista_at is null
               order by orden loop
    v_listo := almacen_probar_equipo(v_it.id, p_protocolo_ref, '[]'::jsonb, p_nota, '[]'::jsonb);
  end loop;
  return v_listo;
end $function$;

grant execute on function public.almacen_probar_kit(uuid, text, jsonb, text) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0517_protocolo_del_kit_de_repuestos.sql')
on conflict do nothing;
