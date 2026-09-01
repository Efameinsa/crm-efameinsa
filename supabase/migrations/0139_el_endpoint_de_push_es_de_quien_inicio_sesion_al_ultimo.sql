-- ============================================================
-- CRM EFAMEINSA · Migración 0139 · El endpoint de push es de quien inició sesión al último
-- ============================================================
-- Santos, 31-08, activando las notificaciones en la máquina de Post Venta:
-- «new row violates row-level security policy for table push_suscripciones».
--
-- EL CASO. Un endpoint de push identifica a UN navegador en UNA máquina. En
-- esta oficina las máquinas se comparten (está hasta mapeado en el contrato
-- quién se conecta dónde): la de Post Venta la usó antes otra cuenta, que
-- dejó su suscripción registrada. Al activar con la cuenta nueva, el upsert
-- por endpoint intenta pisar la fila de la otra persona — y la política
-- `user_id = auth.uid()` lo corta, con razón.
--
-- LA REGLA CORRECTA: el endpoint es de quien inició sesión al último en ese
-- navegador. Mandarle la push del usuario anterior a esa máquina sería
-- mandársela a la persona equivocada. Esta función hace el traspaso completo
-- —borra la fila vieja del endpoint, sea de quien sea, y registra la nueva a
-- nombre de quien está en sesión— como security definer, porque es
-- exactamente el único caso en que tocar la fila de otro es lo correcto.

create or replace function guardar_suscripcion_push(p_endpoint text, p_claves jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión expirada';
  end if;
  if p_endpoint is null or length(p_endpoint) < 20 or p_claves is null then
    raise exception 'Suscripción incompleta';
  end if;
  delete from push_suscripciones where endpoint = p_endpoint;
  insert into push_suscripciones (user_id, endpoint, claves, user_agent)
    values (auth.uid(), p_endpoint, p_claves, null);
end $$;

comment on function guardar_suscripcion_push(text, jsonb) is
  'Registra la suscripción de push del navegador a nombre de quien está en sesión, traspasando el endpoint si otra cuenta lo tenía (máquinas compartidas, 0139).';
