-- ============================================================
-- CRM EFAMEINSA · Migración 0553 · Fotos del despacho pedidas y guía enviada
-- ============================================================
-- Reunión de gerencia 20-10-2026 (Beneficencia de Huancayo, Brenda PV2 y
-- Lesly):
--   · «Que le dé un clic para apurarlo» → postventa le pide al almacén las
--     fotos del despacho que faltan (fotos_pedidas_*), con nombre y hora.
--   · «Tú le vas a enviar el WhatsApp pero nadie sabe que tú has enviado…
--     con 30 clientes no hay forma de controlarlo» → la guía y las fotos
--     enviadas al cliente quedan registradas (guia_enviada_cliente_*): quién,
--     cuándo, por dónde y el texto.
-- ============================================================

alter table servicios_postventa
  add column if not exists fotos_pedidas_at timestamptz,
  add column if not exists fotos_pedidas_por uuid references perfiles(id),
  add column if not exists fotos_pedidas_n integer not null default 0,
  add column if not exists guia_enviada_cliente_at timestamptz,
  add column if not exists guia_enviada_cliente_por uuid references perfiles(id),
  add column if not exists guia_enviada_cliente_via text,
  add column if not exists guia_enviada_cliente_texto text;

create or replace function public.postventa_pedir_fotos_al_almacen(p_servicio uuid)
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Esto lo pide postventa';
  end if;
  if exists (select 1 from servicios_postventa where id = p_servicio and fotos_pedidas_at > now() - interval '4 hours') then
    raise exception 'Ya se le pidió al almacén hace menos de 4 horas. Si es urgente, llámelo.';
  end if;
  update servicios_postventa
     set fotos_pedidas_at = now(), fotos_pedidas_por = auth.uid(), fotos_pedidas_n = fotos_pedidas_n + 1
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
  returning fotos_pedidas_n into v_n;
  if v_n is null then raise exception 'Ese pedido no existe'; end if;
  return v_n;
end $function$;
revoke all on function public.postventa_pedir_fotos_al_almacen(uuid) from public;
grant execute on function public.postventa_pedir_fotos_al_almacen(uuid) to authenticated;

create or replace function public.postventa_guia_enviada_al_cliente(p_servicio uuid, p_via text, p_texto text default null)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Esto lo registra postventa';
  end if;
  if coalesce(p_via, '') not in ('whatsapp', 'correo', 'otro') then raise exception 'Diga por dónde se envió'; end if;
  update servicios_postventa
     set guia_enviada_cliente_at = now(), guia_enviada_cliente_por = auth.uid(),
         guia_enviada_cliente_via = p_via, guia_enviada_cliente_texto = nullif(btrim(coalesce(p_texto, '')), '')
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $function$;
revoke all on function public.postventa_guia_enviada_al_cliente(uuid, text, text) from public;
grant execute on function public.postventa_guia_enviada_al_cliente(uuid, text, text) to authenticated;
