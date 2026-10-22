-- 0580 · El PDF/Word del protocolo ya no se exige a ninguna máquina
-- (Lesly, 21-10, en Almacén: «se sube la foto, se llena la ficha pero también
-- pedía que se suba el Word»).
--
-- La 0466 lo había quitado solo a las máquinas con hoja de chequeo; las que no
-- tienen plantilla (centrífuga, ablandador…) seguían frenando «Probada y
-- embalada» sin un PDF/Word. Todo el protocolo se hace en el CRM: fotos, ficha
-- del informe (modelo, serie, técnico) y la hoja si existe. Subir un Word
-- sigue pudiéndose, nunca frena. Vale para pedidos y protocolos de stock, y
-- para todas las cuentas (almacén, operaciones, backoffice): todas pasan por
-- esta función.
--
-- Igual que la 0534 sin el renglón del documento. En la base local se corre
-- como supabase_admin.

CREATE OR REPLACE FUNCTION public.protocolo_falta_en_maquina(p_nombre text, p_datos jsonb, p_chequeo jsonb, p_archivos jsonb, p_serie text, p_lavadora boolean, p_repuesto boolean)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v text[] := '{}';
  v_img int;
  v_marcas int;
begin
  select count(*) filter (where coalesce(a->>'tipo', '') like 'image/%' or coalesce(a->>'path', '') ~* '\.(jpe?g|png|webp|gif|heic)$')
    into v_img
    from jsonb_array_elements(case when jsonb_typeof(p_archivos) = 'array' then p_archivos else '[]'::jsonb end) a
   where jsonb_typeof(a) = 'object' and coalesce(a->>'path', '') <> '';
  if v_img = 0 then v := v || (p_nombre || ': fotos'); end if;
  if not p_repuesto and btrim(coalesce(p_datos->>'modelo', '')) = '' then v := v || (p_nombre || ': modelo de la placa (en la ficha del informe)'); end if;
  if not p_repuesto and btrim(coalesce(nullif(btrim(coalesce(p_datos->>'serie', '')), ''), p_serie, '')) = '' then v := v || (p_nombre || ': serie'); end if;
  if btrim(coalesce(p_datos->>'tecnico', '')) = '' then v := v || (p_nombre || ': técnico que hizo la prueba'); end if;
  if p_lavadora and not p_repuesto then
    select (select count(*)
              from jsonb_each_text(case when jsonb_typeof(p_chequeo->'marcas') = 'object' then p_chequeo->'marcas' else '{}'::jsonb end)
             where value in ('ok', 'falla', 'na'))
         + (select count(*)
              from jsonb_each_text(case when jsonb_typeof(p_chequeo->'prog') = 'object' then p_chequeo->'prog' else '{}'::jsonb end)
             where value = '✓')
      into v_marcas;
    if v_marcas = 0 then
      v := v || (p_nombre || ': hoja del protocolo, ninguna casilla marcada');
    end if;
  end if;
  return v;
end $function$;
