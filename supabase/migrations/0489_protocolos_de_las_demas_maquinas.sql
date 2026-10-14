-- 0489 — LOS PROTOCOLOS DE LAS DEMÁS MÁQUINAS: SECADORA, DESMANCHADORA, PRENSA,
--        RODILLO (CALANDRIA) Y CALDERÍN
--
-- Santos, 14-10: llegaron los papeles del almacén «para que los tengas para
-- cada caso». Hasta hoy solo la lavadora tenía su hoja de chequeo en el
-- sistema (0452); las demás máquinas subían el Word o el PDF. Ahora cada una
-- tiene su papel en src/lib/protocolo-checklist.ts, y la base aplica la misma
-- regla que a la lavadora: con hoja en el sistema basta una casilla marcada
-- (0475) y ya no se pide el Word/PDF.
--
-- La máquina se reconoce igual que en la pantalla (protocolo-hoja.ts →
-- plantillaPara): el tipo que guardó la hoja, el nombre de la parte o, si no,
-- el primer tipo conocido de la descripción; si no hay ninguno, el texto
-- hasta «MARCA»/«MODELO» («RODILLO DE PLANCHADO…», «PRENSA DE PLANCHADO…»).
-- La secadora de una torre también tiene ahora su hoja.

create or replace function public.protocolo_tipo_maquina(p_descripcion text, p_datos jsonb, p_parte_nombre text)
returns text
language sql
immutable
as $$
  select upper(case
    when btrim(coalesce(p_datos->>'equipo', '')) <> '' then p_datos->>'equipo'
    when p_parte_nombre is not null then p_parte_nombre
    else coalesce(
      (select t from unnest(array['LAVADORA','SECADORA','CENTRIFUGA','CENTRÍFUGA','PLANCHADORA','PLANCHADOR','CALANDRA','CALDERA','ABLANDADOR','COCHE']) t
        where strpos(upper(coalesce(p_descripcion, '')), t) > 0
        order by strpos(upper(coalesce(p_descripcion, '')), t) limit 1),
      btrim((regexp_split_to_array(upper(coalesce(p_descripcion, '')), '[[:space:]]+(MARCA|MODELO)\M|[–,]'))[1]))
  end)
$$;

-- El papel que le toca, por cómo empieza el tipo. Misma lista que PLANTILLAS.
create or replace function public.protocolo_hoja_de(p_tipo text)
returns text
language sql
immutable
as $$
  select case
    when upper(coalesce(p_tipo, '')) like 'LAVADORA%' then 'PROTOCOLO DE LAVADORA'
    when upper(coalesce(p_tipo, '')) like 'SECADORA%' then 'PROTOCOLO DE SECADORA'
    when upper(coalesce(p_tipo, '')) ~ '^(DESMANCHADORA|MESA DESMANCHADORA|MESA DE DESMANCHE|MESA DESMANCHE)' then 'PROTOCOLO DE DESMANCHADORA'
    when upper(coalesce(p_tipo, '')) like 'PRENSA%' then 'PROTOCOLO DE PRENSA DE PLANCHADO'
    when upper(coalesce(p_tipo, '')) ~ '^(RODILLO|CALANDRIA|CALANDRA)' then 'PROTOCOLO DE RODILLO'
    when upper(coalesce(p_tipo, '')) ~ '^(CALDERIN|CALDERÍN)' then 'PROTOCOLO DE CALDERIN'
  end
$$;

-- Conserva el nombre (la usan dos funciones), pero ahora responde «¿esta
-- máquina tiene hoja de chequeo en el sistema?», no solo «¿es lavadora?».
create or replace function public.protocolo_es_lavadora(p_descripcion text, p_datos jsonb, p_parte_nombre text)
returns boolean
language sql
immutable
as $$
  select protocolo_hoja_de(protocolo_tipo_maquina(p_descripcion, p_datos, p_parte_nombre)) is not null
$$;


CREATE OR REPLACE FUNCTION public.protocolo_falta_en_maquina(p_nombre text, p_datos jsonb, p_chequeo jsonb, p_archivos jsonb, p_serie text, p_lavadora boolean, p_repuesto boolean)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v text[] := '{}';
  v_img int;
  v_doc int;
  v_marcas int;
begin
  select count(*) filter (where coalesce(a->>'tipo', '') like 'image/%' or coalesce(a->>'path', '') ~* '\.(jpe?g|png|webp|gif|heic)$'),
         count(*) filter (where not (coalesce(a->>'tipo', '') like 'image/%' or coalesce(a->>'path', '') ~* '\.(jpe?g|png|webp|gif|heic)$')
                            and not (coalesce(a->>'tipo', '') like 'video/%' or coalesce(a->>'etiqueta', '') = 'video' or coalesce(a->>'path', '') ~* '\.(mp4|mov|webm|3gp)$'))
    into v_img, v_doc
    from jsonb_array_elements(case when jsonb_typeof(p_archivos) = 'array' then p_archivos else '[]'::jsonb end) a
   where jsonb_typeof(a) = 'object' and coalesce(a->>'path', '') <> '';
  if v_img = 0 then v := v || (p_nombre || ': fotos'); end if;
  if not p_repuesto and not p_lavadora and v_doc = 0 then v := v || (p_nombre || ': protocolo o informe (PDF o Word)'); end if;
  if not p_repuesto and btrim(coalesce(p_datos->>'modelo', '')) = '' then v := v || (p_nombre || ': modelo de la placa (en la ficha del informe)'); end if;
  if not p_repuesto and btrim(coalesce(nullif(btrim(coalesce(p_datos->>'serie', '')), ''), p_serie, '')) = '' then v := v || (p_nombre || ': serie'); end if;
  if btrim(coalesce(p_datos->>'tecnico', '')) = '' then v := v || (p_nombre || ': técnico que hizo la prueba'); end if;
  if p_lavadora and not p_repuesto then
    select count(*) into v_marcas
      from jsonb_each_text(case when jsonb_typeof(p_chequeo->'marcas') = 'object' then p_chequeo->'marcas' else '{}'::jsonb end)
     where value in ('ok', 'falla', 'na');
    if v_marcas = 0 then
      v := v || (p_nombre || ': hoja del protocolo, ninguna casilla marcada');
    end if;
  end if;
  return v;
end $function$;

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

insert into _migraciones_aplicadas (archivo) values ('0489_protocolos_de_las_demas_maquinas.sql')
on conflict do nothing;
