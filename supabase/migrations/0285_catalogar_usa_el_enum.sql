-- 0285 · catalogar_expediente_postventa compara y guarda el tipo como el enum
-- tipo_postventa (0284 lo trataba como texto: «operator does not exist»).

create or replace function public.catalogar_expediente_postventa(p_oportunidad uuid, p_tipo text, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o oportunidades%rowtype;
  v_etiqueta text;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Esto lo hace el área de postventa';
  end if;
  if p_tipo not in ('garantia', 'repuesto', 'mantenimiento', 'seguimiento') then
    raise exception 'Tipo de caso desconocido';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escriba por qué (una frase basta)';
  end if;
  select * into o from oportunidades where id = p_oportunidad for update;
  if o.id is null or o.tipo_postventa is null then
    raise exception 'Ese expediente no es de postventa';
  end if;
  if o.tipo_postventa::text = p_tipo then
    raise exception 'Ya está catalogado así';
  end if;
  v_etiqueta := case p_tipo
    when 'garantia' then 'Soporte técnico'
    when 'repuesto' then 'Repuestos'
    when 'mantenimiento' then 'Mantenimiento preventivo'
    else 'Seguimiento' end;
  update oportunidades set tipo_postventa = p_tipo::tipo_postventa, updated_at = now() where id = p_oportunidad;
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, adjuntos)
  values (p_oportunidad, 'nota', format('Se catalogó como %s: %s', v_etiqueta, btrim(p_motivo)), auth.uid(), '[]'::jsonb);
  return v_etiqueta;
end $$;

