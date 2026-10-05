-- ============================================================
-- CRM EFAMEINSA · Migración 0401 · La gestión registrada también apaga la
-- alerta de WhatsApp sin respuesta
-- ============================================================
-- Katerine, 05-10-2026: «me sigue saliendo que Edgardo Rivera espera mi
-- respuesta en WhatsApp hace dos días, y ya lo atendí y le coticé». Escribió
-- el sábado 03-10; ella lo llamó el lunes, registró la llamada, le mandó la
-- Presu_1039-26 y registró «se le envió cotización». Como no le escribió
-- desde el chat del CRM, la 0394 no veía ningún saliente después del último
-- mensaje del cliente y la campana le volvía a avisar cada hora.
--
-- Ahora un chat deja de esperar si, después del último mensaje del cliente,
-- pasó cualquiera de estas cosas en el mismo cliente (cualquier expediente
-- de su ficha): un mensaje saliente, una gestión registrada o una cotización
-- creada. Si el cliente vuelve a escribir, vuelve a esperar.
--
-- Además, registrar una gestión pasa los chats «sin atender» de ese cliente
-- a «en gestión», igual que cuando se responde desde el chat.
-- ============================================================

-- La ficha (cuenta) a la que pertenece un chat: por su lead o por su contacto.
create or replace function public.wa_conversacion_cuenta(p_conversacion uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(l.cuenta_id, o.cuenta_id, ct.cuenta_id)
    from wa_conversaciones c
    left join leads l on l.id = c.lead_id
    left join oportunidades o on o.id = l.oportunidad_id
    left join contactos ct on ct.id = c.contacto_id
   where c.id = p_conversacion;
$$;

revoke all on function public.wa_conversacion_cuenta(uuid) from public, anon, authenticated;

create or replace function public.whatsapp_sin_respuesta(p_minutos int default 30)
returns table(conversacion_id uuid, asignado_a uuid, cliente text, telefono text, esperando_desde timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  with chats as (
    select c.*, wa_conversacion_cuenta(c.id) as cuenta_id
      from wa_conversaciones c
      join perfiles p on p.id = c.asignado_a and p.activo
     where c.estado <> 'cerrada'
       and c.ultimo_mensaje_cliente_at > now() - interval '72 hours'
       and c.ultimo_mensaje_cliente_at < now() - make_interval(mins => greatest(p_minutos, 5))
  )
  select c.id, c.asignado_a, coalesce(nullif(btrim(c.nombre_wa), ''), c.telefono), c.telefono, c.ultimo_mensaje_cliente_at
    from chats c
   where not exists (
       select 1 from wa_mensajes m
        where m.conversacion_id = c.id
          and m.direccion = 'saliente'
          and m.created_at > c.ultimo_mensaje_cliente_at
     )
     and not exists (
       select 1 from actividades a
         join oportunidades o on o.id = a.oportunidad_id
        where o.cuenta_id = c.cuenta_id
          and a.realizada_at > c.ultimo_mensaje_cliente_at
     )
     and not exists (
       select 1 from cotizaciones q
         join oportunidades o on o.id = q.oportunidad_id
        where o.cuenta_id = c.cuenta_id
          and q.created_at > c.ultimo_mensaje_cliente_at
     )
   order by c.ultimo_mensaje_cliente_at;
$$;

revoke all on function public.whatsapp_sin_respuesta(int) from public, anon, authenticated;
grant execute on function public.whatsapp_sin_respuesta(int) to service_role;

-- Registrar una gestión saca de «sin atender» los chats de ese cliente.
create or replace function public.trg_actividad_chat_en_gestion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cuenta uuid;
begin
  select cuenta_id into v_cuenta from oportunidades where id = new.oportunidad_id;
  if v_cuenta is not null then
    update wa_conversaciones c
       set estado = 'en_gestion'
     where c.estado = 'sin_atender'
       and wa_conversacion_cuenta(c.id) = v_cuenta;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_chat_en_gestion on public.actividades;
create trigger trg_actividad_chat_en_gestion
  after insert on public.actividades
  for each row execute function public.trg_actividad_chat_en_gestion();

-- Los chats que ya tienen una gestión registrada después del último mensaje
-- del cliente (Edgardo Rivera y los que estén igual) pasan a «en gestión».
update wa_conversaciones c
   set estado = 'en_gestion'
 where c.estado = 'sin_atender'
   and exists (
     select 1 from actividades a
       join oportunidades o on o.id = a.oportunidad_id
      where o.cuenta_id = wa_conversacion_cuenta(c.id)
        and a.realizada_at > coalesce(c.ultimo_mensaje_cliente_at, c.created_at)
   );
