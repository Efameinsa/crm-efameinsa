-- EL TÉCNICO DE LA LLAMADA (Lesly, 03-10): «cuando almacén quiere poner en el
-- informe de llamada a otro técnico ya no se puede, y postventa no debería
-- permitir enviar si no llena el técnico».
--  · El almacén también pone o cambia el técnico, mientras no suba el informe.
--  · La llamada no se envía sin técnico.

create or replace function public.postventa_tecnico_de_apertura(p_id uuid, p_tecnico text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_postventa boolean := coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false);
begin
  if not (v_postventa or coalesce(es_almacen(), false)) then
    raise exception 'El técnico lo asignan postventa o el almacén';
  end if;
  if nullif(btrim(coalesce(p_tecnico, '')), '') is null then raise exception 'Escriba el nombre del técnico'; end if;
  update aperturas_llamada set tecnico = btrim(p_tecnico)
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false)
     and (v_postventa or informe_at is null);
  if not found then raise exception 'Esa apertura no existe, está anulada o ya tiene informe'; end if;
end $$;

create or replace function public.enviar_apertura_llamada(p_cuenta uuid, p_tipo text, p_programada timestamp with time zone, p_equipos text, p_indicaciones text default null::text, p_contacto text default null::text, p_servicio uuid default null::uuid, p_atencion uuid default null::uuid, p_pin_urgente text default null::text, p_tecnico text default null::text, p_formato jsonb default null::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_autorizo uuid;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La apertura de llamada la envía postventa';
  end if;
  if p_programada is null then raise exception 'Falta el día y la hora'; end if;
  if nullif(btrim(coalesce(p_equipos, '')), '') is null then raise exception 'Diga qué equipos se revisan'; end if;
  if nullif(btrim(coalesce(p_tecnico, '')), '') is null then raise exception 'Escriba el técnico a cargo'; end if;
  if p_servicio is not null and not exists (select 1 from servicios_postventa where id = p_servicio and cuenta_id = p_cuenta) then
    raise exception 'Ese pedido no es de este cliente';
  end if;
  if p_pin_urgente is not null then
    if p_servicio is not null then raise exception 'La apertura urgente es para lo que todavía no tiene pedido'; end if;
    v_autorizo := validar_codigo_autorizacion(p_pin_urgente, 'gerencia');
  end if;
  insert into aperturas_llamada (cuenta_id, servicio_id, atencion_id, tipo, programada_para, equipos, indicaciones, contacto,
                                 solicitada_por, es_prueba, urgente, urgente_autorizo, tecnico, formato)
  values (p_cuenta, p_servicio, p_atencion, p_tipo, p_programada, btrim(p_equipos),
          nullif(btrim(coalesce(p_indicaciones, '')), ''), nullif(btrim(coalesce(p_contacto, '')), ''),
          auth.uid(), coalesce(es_cuenta_prueba(), false), v_autorizo is not null, v_autorizo,
          btrim(p_tecnico), coalesce(p_formato, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.postventa_tecnico_de_apertura(uuid, text) from public, anon;
grant execute on function public.postventa_tecnico_de_apertura(uuid, text) to authenticated;
