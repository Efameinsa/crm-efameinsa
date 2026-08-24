-- ============================================================
-- CRM EFAMEINSA · Migración 0060 · El comercial puede pasarle un contacto a Central
-- ============================================================
-- Pedido de las comerciales en la capacitación del 24-08 y ratificado por
-- gerencia en la reunión de esa mañana: «sería excelente que acá también tenga
-- esa opción para que ella llene el formulario y Central reciba automáticamente
-- ese lead, y ahí Central haga la derivación».
--
-- El caso real: a la comercial le entra un WhatsApp o una llamada directa de
-- alguien que no está en su cartera. Hasta hoy lo mandaba por correo a Central,
-- que lo volvía a tipear. Ahora lo registra una sola vez y entra a la bandeja
-- de triaje como cualquier otro contacto.
--
-- ⚠️ LA REGLA QUE NO SE PUEDE ROMPER: el comercial NO se asigna clientes a sí
-- mismo. El gerente fue explícito en que la derivación la decide Central (con
-- consulta a gerencia mientras se afinan los criterios). Por eso la política
-- exige estado 'pendiente_triaje', asignado_a nulo y recibido_por = él mismo:
-- puede meter el contacto a la cola, y nada más. Si el contacto resulta ser de
-- su propia cartera, Central se lo devolverá — pero pasando por la cola, que es
-- lo que deja rastro de cuánto le derivan a cada uno.

drop policy if exists leads_comercial_registra on leads;

create policy leads_comercial_registra on leads
  for insert
  to authenticated
  with check (
    (select rol_actual()) = 'comercial'::rol_usuario
    and estado = 'pendiente_triaje'::estado_lead
    and asignado_a is null
    and recibido_por = (select auth.uid())
  );

-- Para que después de insertarlo pueda leer el código que se le asignó
-- (el .select() de vuelta del server action); sigue sin poder ver los
-- contactos de los demás.
drop policy if exists leads_comercial_ve_los_suyos on leads;

create policy leads_comercial_ve_los_suyos on leads
  for select
  to authenticated
  using (recibido_por = (select auth.uid()));
