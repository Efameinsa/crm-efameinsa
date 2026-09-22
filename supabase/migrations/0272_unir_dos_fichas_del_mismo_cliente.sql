-- «¿ES EL MISMO CLIENTE?» — unir dos fichas a mano, con código de operaciones
-- (ítem 9 de la reunión del 22-09).
--
-- Carlos, 11:00: «A mí cuando han derivado un cliente relacionado a otro me
-- aparece por defecto: dos relacionados, y yo puedo abrir. Acá Ruiz Pangalima
-- solamente aparece él.» El panel de relacionados de hoy se arma por RUC o
-- teléfono; con nombres escritos distinto y sin RUC (el caso real: tres
-- fichas de INVERSIONES HUAMAN RUIZ) no hay nada que cruzar.
--
-- `fusionar_cuentas` mueve TODO lo que cuelga de la ficha de origen —
-- oportunidades, contactos, atenciones, servicios de postventa— a la ficha de
-- destino, y deja la de origen marcada como fusionada (no se borra: sigue
-- existiendo para quien la busque, apuntando a la buena). Nunca automático:
-- lo dispara una persona, mirando las dos fichas, con el mismo código de
-- operaciones que ya protege el resto de correcciones sensibles.

alter table cuentas add column if not exists fusionada_en uuid references cuentas(id);
comment on column cuentas.fusionada_en is
  'Si no es null, esta ficha se unió a otra (0272): la de verdad es fusionada_en.';

create or replace function fusionar_cuentas(p_origen uuid, p_destino uuid, p_pin text, p_motivo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_solicitante uuid := auth.uid();
  v_origen      cuentas%rowtype;
  v_destino     cuentas%rowtype;
  v_motivo      text;
  v_oportunidades integer := 0;
  v_contactos     integer := 0;
  v_atenciones    integer := 0;
  v_servicios     integer := 0;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  if p_origen = p_destino then
    raise exception 'No se puede unir una ficha consigo misma';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué es el mismo cliente (mínimo una frase)';
  end if;
  v_motivo := btrim(p_motivo);

  select * into v_origen from cuentas where id = p_origen for update;
  if v_origen.id is null then raise exception 'La ficha de origen no existe'; end if;
  if v_origen.fusionada_en is not null then
    raise exception 'Esa ficha ya está fusionada';
  end if;
  -- Con RUC, el documento manda: no se une a ciegas una ficha que ya tiene su
  -- propia identidad fiscal. Si de verdad es un duplicado con RUC, se revisa
  -- a mano — es el caso raro, no el que este botón viene a resolver.
  if coalesce(nullif(btrim(v_origen.num_doc), ''), '') <> '' and v_origen.tipo_doc <> 'SIN_DOC' then
    raise exception 'Esa ficha ya tiene % %: no se une a ciegas, revísela a mano', v_origen.tipo_doc, v_origen.num_doc;
  end if;

  select * into v_destino from cuentas where id = p_destino for update;
  if v_destino.id is null then raise exception 'La ficha de destino no existe'; end if;
  if v_destino.fusionada_en is not null then
    raise exception 'Esa ficha de destino ya está fusionada en otra: elija la definitiva';
  end if;

  -- El código de operaciones: unir mueve carteras enteras, así que siempre lo
  -- pide, no solo cuando cambia de dueño (a diferencia de unir_lead_a_cuenta).
  perform validar_codigo_autorizacion(p_pin, 'operaciones');

  update oportunidades set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_oportunidades = row_count;

  update contactos set cuenta_id = p_destino where cuenta_id = p_origen;
  get diagnostics v_contactos = row_count;

  update atenciones set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_atenciones = row_count;

  update servicios_postventa set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_servicios = row_count;

  update cuentas set fusionada_en = p_destino, updated_at = now() where id = p_origen;

  return format(
    'Unida a %s: %s expediente(s), %s contacto(s), %s atención(es) y %s pedido(s) movidos. %s',
    v_destino.razon_social, v_oportunidades, v_contactos, v_atenciones, v_servicios, v_motivo
  );
end;
$function$;

revoke all on function fusionar_cuentas(uuid, uuid, text, text) from public;
grant execute on function fusionar_cuentas(uuid, uuid, text, text) to authenticated;
