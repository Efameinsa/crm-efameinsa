-- 0465 · «N/A» EN LA HOJA DE CHEQUEO DEL PROTOCOLO (Lesly, COFACO, 13-10)
--
-- La hoja «PROTOCOLO DE LAVADORA» (0452) pide las 37 casillas con ✓ o ✗ para
-- marcar la máquina probada y embalada (0461). En la lavadora teñidora de
-- muestra de COFACO no hay quemador ni combustible, y la prueba fue solo con
-- agua (sin carga): 22 renglones no aplican y no había cómo responderlos, así
-- que no se podía marcar probada. Ahora cada renglón también puede quedar
-- «N/A» (no aplica): cuenta como respondido. Los vacíos siguen frenando.

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
         count(*) filter (where not (coalesce(a->>'tipo', '') like 'image/%' or coalesce(a->>'path', '') ~* '\.(jpe?g|png|webp|gif|heic)$'))
    into v_img, v_doc
    from jsonb_array_elements(case when jsonb_typeof(p_archivos) = 'array' then p_archivos else '[]'::jsonb end) a
   where jsonb_typeof(a) = 'object' and coalesce(a->>'path', '') <> '';
  if v_img = 0 then v := v || (p_nombre || ': fotos'); end if;
  if not p_repuesto and v_doc = 0 then v := v || (p_nombre || ': protocolo o informe (PDF o Word)'); end if;
  if not p_repuesto and btrim(coalesce(p_datos->>'modelo', '')) = '' then v := v || (p_nombre || ': modelo de la placa (en la ficha del informe)'); end if;
  if not p_repuesto and btrim(coalesce(nullif(btrim(coalesce(p_datos->>'serie', '')), ''), p_serie, '')) = '' then v := v || (p_nombre || ': serie'); end if;
  if btrim(coalesce(p_datos->>'tecnico', '')) = '' then v := v || (p_nombre || ': técnico que hizo la prueba'); end if;
  if p_lavadora and not p_repuesto then
    select count(*) into v_marcas
      from jsonb_each_text(case when jsonb_typeof(p_chequeo->'marcas') = 'object' then p_chequeo->'marcas' else '{}'::jsonb end)
     where value in ('ok', 'falla', 'na');
    if v_marcas < 37 then
      v := v || format('%s: hoja «PROTOCOLO DE LAVADORA», %s casilla%s sin marcar', p_nombre, 37 - v_marcas, case when 37 - v_marcas = 1 then '' else 's' end);
    end if;
  end if;
  return v;
end $function$;

