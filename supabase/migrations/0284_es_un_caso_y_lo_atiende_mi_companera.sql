-- 0284 · «ES UN CASO» Y «LO ATIENDE MI COMPAÑERA» (reunión 23-09, aprobado por Santos el mismo día).
--
-- Carlos, con Total Clean y Dúo Lavanderías en pantalla:
--   · «Acá lo que yo veo es que tú has registrado… se lo vuelven a derivar,
--     pero veo que no abre un caso. Si más bien esto es un caso… ¿Solamente
--     había un seguimiento? Ahí más bien debería catalogarlo como un caso.»
--   · «Te está llegando porque hemos definido que tú ves servicio técnico…
--     para que no te metas se tiene que redireccionar… se registra que lo
--     está atendiendo mi compañera Rubí por tal motivo… porque el CRM no sabe
--     lo que hemos hecho.»
-- Reparto del área desde el 22-09: Gabriela = cotizaciones y soporte técnico;
-- Rubí = pedidos y despachos.
--
-- Las dos acciones son del área de postventa (y gerencia/operaciones) sobre
-- expedientes de postventa (tipo_postventa no nulo), y las dos dejan escrito
-- en el expediente quién, cuándo y por qué: es la gestión que el CRM no sabía.

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
  if o.tipo_postventa = p_tipo then
    raise exception 'Ya está catalogado así';
  end if;
  v_etiqueta := case p_tipo
    when 'garantia' then 'Soporte técnico'
    when 'repuesto' then 'Repuestos'
    when 'mantenimiento' then 'Mantenimiento preventivo'
    else 'Seguimiento' end;
  update oportunidades set tipo_postventa = p_tipo, updated_at = now() where id = p_oportunidad;
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, adjuntos)
  values (p_oportunidad, 'nota', format('Se catalogó como %s: %s', v_etiqueta, btrim(p_motivo)), auth.uid(), '[]'::jsonb);
  return v_etiqueta;
end $$;

create or replace function public.pasar_expediente_a_companera(p_oportunidad uuid, p_a uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o oportunidades%rowtype;
  v_destino perfiles%rowtype;
  v_antes text;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Esto lo hace el área de postventa';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escriba por qué lo atiende ella (una frase basta)';
  end if;
  select * into o from oportunidades where id = p_oportunidad for update;
  if o.id is null or o.tipo_postventa is null then
    raise exception 'Ese expediente no es de postventa';
  end if;
  select * into v_destino from perfiles where id = p_a;
  if v_destino.id is null or not coalesce(v_destino.activo, false) or not coalesce(v_destino.es_postventa, false) then
    raise exception 'Solo se pasa a alguien del área de postventa';
  end if;
  if coalesce(v_destino.es_prueba, false) <> coalesce(es_cuenta_prueba(), false) then
    raise exception 'Solo se pasa a alguien del área de postventa';
  end if;
  if o.comercial_id = p_a then
    raise exception 'Ya lo tiene ella';
  end if;
  select coalesce(codigo_comercial || ' · ', '') || nombre into v_antes from perfiles where id = o.comercial_id;
  update oportunidades set comercial_id = p_a, updated_at = now() where id = p_oportunidad;
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, adjuntos)
  values (p_oportunidad, 'nota',
          format('Lo atiende %s (antes %s): %s', coalesce(v_destino.codigo_comercial || ' · ', '') || v_destino.nombre, coalesce(v_antes, 'sin dueño'), btrim(p_motivo)),
          auth.uid(), '[]'::jsonb);
  return coalesce(v_destino.codigo_comercial || ' · ', '') || v_destino.nombre;
end $$;

revoke all on function public.catalogar_expediente_postventa(uuid, text, text) from public;
revoke all on function public.pasar_expediente_a_companera(uuid, uuid, text) from public;
grant execute on function public.catalogar_expediente_postventa(uuid, text, text) to authenticated;
grant execute on function public.pasar_expediente_a_companera(uuid, uuid, text) to authenticated;
