-- 0475 · LAS CASILLAS DE LA HOJA DE CHEQUEO NO SON TODAS OBLIGATORIAS
-- (Ariana, almacén 14-10, con la lavadora de la Beneficencia de Huancayo)
--
-- «El sistema le obliga a llenar todos los ítems, y solo debe marcarse lo que
-- uno considere; no deben ser obligatorios todos los checks y las X.»
-- Hasta hoy (0461 → 0471) «Probada y embalada» exigía las 37 casillas de la
-- hoja «PROTOCOLO DE LAVADORA» con ✓, ✗ o N/A. Ahora basta con que la hoja no
-- esté vacía: al menos una casilla marcada (como la lavadora no pide Word/PDF,
-- 0466, la hoja sigue siendo el protocolo). Todo lo demás igual que la 0471.

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
      v := v || (p_nombre || ': hoja «PROTOCOLO DE LAVADORA», ninguna casilla marcada');
    end if;
  end if;
  return v;
end $function$;

