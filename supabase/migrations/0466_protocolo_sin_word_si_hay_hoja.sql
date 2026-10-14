-- 0466 · SIN WORD SI EL SISTEMA YA GENERA EL PROTOCOLO (Lesly, 13-10)
--
-- «En protocolo ya no debería solicitar subir Word, porque el sistema ya lo
-- genera». La máquina con hoja de chequeo en el CRM (hoy la lavadora, 0452)
-- tiene su informe de prueba y embalaje generado por el sistema: ficha (modelo
-- de la placa, serie, técnico), fotos y las 37 casillas. Ese informe es el
-- protocolo, así que el PDF/Word subido ya no frena «Probada y embalada». Las
-- máquinas sin hoja en el sistema (calandria, secadora, prensa…) siguen
-- pidiendo su PDF/Word. Todo lo demás (0461, 0465) igual.

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
  if not p_repuesto and not p_lavadora and v_doc = 0 then v := v || (p_nombre || ': protocolo o informe (PDF o Word)'); end if;
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

