-- EL N.º DE PROTOCOLO YA NO SE EXIGE (Santos, 14-10, con la Beneficencia de
-- Huancayo: Ariana tenía fotos, ficha, técnico y casillas de las dos
-- lavadoras y no podía marcarlas «Probada y embalada» porque faltaba el N.º;
-- «en ese documento no va el número de protocolo, así que quítalo»).
--
-- Se quita de las tres puertas: la máquina del pedido (0461), el pedido sin
-- lista de máquinas (almacen_marcar_probado) y el protocolo de stock (0474).
-- Si alguien lo escribe, se sigue guardando y saliendo en el informe.
-- Las funciones se toman tal como estaban vigentes (0475) y solo pierden esa
-- comprobación.

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
begin
  select pe.*, s.tipo_pedido into v_it from pedido_equipos pe join servicios_postventa s on s.id = pe.servicio_id where pe.id = p_item;
  if v_it.id is null then return array['Ese equipo no está en el pedido']; end if;
  v_repuesto := coalesce(v_it.tipo_pedido, '') = 'repuesto';
  v_nombre := 'Máquina ' || v_it.orden;
  v_desc := upper(coalesce(v_it.descripcion, ''));
  v_todos := (case when jsonb_typeof(v_it.protocolo_fotos) = 'array' then v_it.protocolo_fotos else '[]'::jsonb end)
          || (case when jsonb_typeof(p_fotos) = 'array' then p_fotos else '[]'::jsonb end);
  v := v || protocolo_falta_en_maquina(
    v_nombre, coalesce(v_it.protocolo_datos->'principal', '{}'), coalesce(v_it.protocolo_chequeo->'principal', '{}'),
    (select coalesce(jsonb_agg(a), '[]') from jsonb_array_elements(v_todos) a where coalesce(a->>'path', '') !~ '-secadora-'),
    coalesce(nullif(btrim(split_part(coalesce(v_it.serie, ''), '/', 1)), ''), case when v_desc ~ 'SERIE' then 'en la descripción' end),
    protocolo_es_lavadora(v_it.descripcion, v_it.protocolo_datos->'principal', v_it.parte_nombre), v_repuesto);
  -- La secadora de una torre sin renglón propio (sus archivos suben con «-secadora-»).
  if not v_repuesto and not exists (select 1 from pedido_equipos where parte_de = p_item)
     and (v_desc ~ '\mTORRE\M' or (v_desc like '%LAVADORA%' and v_desc like '%SECADORA%')) then
    v := v || protocolo_falta_en_maquina(
      'Secadora de la torre', coalesce(v_it.protocolo_datos->'secadora', '{}'), '{}'::jsonb,
      (select coalesce(jsonb_agg(a), '[]') from jsonb_array_elements(v_todos) a where coalesce(a->>'path', '') ~ '-secadora-'),
      coalesce(nullif(btrim(split_part(coalesce(v_it.serie, ''), '/', 2)), ''), case when v_desc ~ 'SERIE.*SERIE' then 'en la descripción' end),
      false, false);
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

CREATE OR REPLACE FUNCTION public.almacen_marcar_probado(p_servicio uuid, p_protocolo_ref text, p_fotos jsonb DEFAULT '[]'::jsonb, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
  v_repuesto boolean;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  v_repuesto := coalesce(v_s.tipo_pedido, '') in ('repuesto', 'accesorio', 'embalaje');
  if jsonb_array_length(coalesce(v_s.protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb)) = 0 then
    raise exception 'Todavía no se puede marcar % y embalado. Falta: %.',
      case when v_repuesto then 'preparado' else 'probado' end,
      case when v_repuesto then 'la foto' else 'el protocolo o las fotos de la prueba' end;
  end if;
  update servicios_postventa
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         prueba_embalaje = 'SI',
         protocolo_prueba_ref = coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), protocolo_prueba_ref),
         protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         observaciones = case when nullif(btrim(coalesce(p_nota, '')), '') is null then observaciones
                              else concat_ws(E'\n', observaciones, format('Almacén, %s: %s', to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI'), btrim(p_nota))) end,
         updated_at = now()
   where id = p_servicio;
end $function$;

CREATE OR REPLACE FUNCTION public.protocolo_stock_falta(p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v protocolos_stock;
  f text[] := '{}';
begin
  select * into v from protocolos_stock where id = p_id;
  if v.id is null then return array['Ese protocolo de stock no existe']; end if;
  return f || protocolo_falta_en_maquina(
    'Equipo', coalesce(v.protocolo_datos->'principal', '{}'), coalesce(v.protocolo_chequeo->'principal', '{}'),
    v.protocolo_fotos, v.serie,
    protocolo_es_lavadora(v.descripcion, v.protocolo_datos->'principal', null), false);
end $function$;
