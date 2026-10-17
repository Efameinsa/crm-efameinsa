-- 0529 · Fila de SERVICIO en el pedido: el protocolo no pide el Word
--
-- Lesly (operaciones, buzón 1d10dfa8, 17-10): en ABACHI PED-0033-2026 la única
-- fila es «SERVICIO DE EMBALAJE EN MADERA PARA RODILLO PLANCHADOR ELECTRICO» y
-- «Probada y embalada» le pedía «protocolo o informe (PDF o Word)», aunque el
-- CRM ya genera el informe de prueba y embalaje con las fotos.
--
-- protocolo_falta_para_probar (tomada viva, igual a la 0517; local = nube): si
-- la fila es una línea de servicio (es_linea_de_servicio, 0404: empieza con
-- «SERVICIO ») y no tiene otras máquinas colgadas, se mide como un repuesto:
-- fotos y técnico. Tampoco se toma por torre aunque nombre lavadora y secadora.

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
  v_servicio boolean;
begin
  select pe.*, s.tipo_pedido into v_it from pedido_equipos pe join servicios_postventa s on s.id = pe.servicio_id where pe.id = p_item;
  if v_it.id is null then return array['Ese equipo no está en el pedido']; end if;
  v_repuesto := coalesce(v_it.tipo_pedido, '') = 'repuesto';
  v_nombre := 'Máquina ' || v_it.orden;
  v_desc := upper(coalesce(v_it.descripcion, ''));
  v_todos := (case when jsonb_typeof(v_it.protocolo_fotos) = 'array' then v_it.protocolo_fotos else '[]'::jsonb end)
          || (case when jsonb_typeof(p_fotos) = 'array' then p_fotos else '[]'::jsonb end);
  v_datos := coalesce(v_it.protocolo_datos->'principal', '{}');
  -- 0529: una fila que es un SERVICIO (embalaje, transporte, instalación…) no es
  -- una máquina: el informe de prueba y embalaje lo genera el CRM con sus fotos,
  -- así que no pide el Word/PDF, ni modelo de placa, ni serie, ni hoja; solo
  -- fotos y técnico, como un repuesto (Lesly, 17-10, ABACHI PED-0033-2026).
  v_servicio := not v_repuesto
                and es_linea_de_servicio(jsonb_build_object('descripcion', v_it.descripcion))
                and not exists (select 1 from pedido_equipos where parte_de = p_item);
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
    not v_servicio and protocolo_es_lavadora(v_it.descripcion, v_it.protocolo_datos->'principal', v_it.parte_nombre), v_repuesto or v_servicio);
  -- La secadora de una torre sin renglón propio (sus archivos suben con «-secadora-»).
  if not v_repuesto and not v_servicio and not exists (select 1 from pedido_equipos where parte_de = p_item)
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
