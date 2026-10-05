-- ============================================================
-- CRM EFAMEINSA · Migración 0394 · Los chats de WhatsApp que esperan la
-- respuesta del comercial
-- ============================================================
-- Central, 05-10-2026, «en coordinación con el ingeniero»: «que se acople
-- una alerta de atención para los comerciales, ya que hasta el momento el
-- prospecto no es atendido». El caso: Miguel Quispe Peñaloza (M3-PERU,
-- Moisés) escribió el 02-10 a las 16:19 y nadie le contestó. Ese día había
-- 101 chats asignados en la misma situación.
--
-- Un chat espera cuando lo último que pasó fue un mensaje del cliente: no hay
-- ningún mensaje saliente después. Se mira la ventana de 72 h (después ya no
-- se le puede escribir libremente; esos se llaman por teléfono).
-- ============================================================

create or replace function public.whatsapp_sin_respuesta(p_minutos int default 30)
returns table(conversacion_id uuid, asignado_a uuid, cliente text, telefono text, esperando_desde timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.asignado_a, coalesce(nullif(btrim(c.nombre_wa), ''), c.telefono), c.telefono, c.ultimo_mensaje_cliente_at
    from wa_conversaciones c
    join perfiles p on p.id = c.asignado_a and p.activo
   where c.estado <> 'cerrada'
     and c.ultimo_mensaje_cliente_at > now() - interval '72 hours'
     and c.ultimo_mensaje_cliente_at < now() - make_interval(mins => greatest(p_minutos, 5))
     and not exists (
       select 1 from wa_mensajes m
        where m.conversacion_id = c.id
          and m.direccion = 'saliente'
          and m.created_at > c.ultimo_mensaje_cliente_at
     )
   order by c.ultimo_mensaje_cliente_at;
$$;

revoke all on function public.whatsapp_sin_respuesta(int) from public, anon, authenticated;
grant execute on function public.whatsapp_sin_respuesta(int) to service_role;
