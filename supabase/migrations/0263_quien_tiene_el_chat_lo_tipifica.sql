-- ============================================================
-- CRM EFAMEINSA · Migración 0263 · Quien tiene el chat lo tipifica
-- ============================================================
-- Santos, 21-09, desde la cuenta de práctica: al marcar «interesado» en la
-- bandeja de WhatsApp salió «new row violates row-level security policy for
-- table tipificaciones_whatsapp». La política de la 0231 solo dejaba
-- tipificar al comercial que tiene el LEAD asignado; pero una conversación
-- puede estar en manos de un comercial (derivada por Central en la bandeja
-- de WhatsApp, o de práctica) sin que el lead se haya asignado. Desde hoy
-- vale cualquiera de las dos puertas: el lead es mío, o la conversación de
-- WhatsApp de ese lead es mía. Mismo criterio para leer.
-- ============================================================

drop policy if exists tipificaciones_whatsapp_comercial_insert on tipificaciones_whatsapp;
create policy tipificaciones_whatsapp_comercial_insert on tipificaciones_whatsapp
  for insert to authenticated
  with check (
    (select rol_actual()) = 'comercial'
    and registrado_por = (select auth.uid())
    and (
      lead_id in (select id from leads where asignado_a = (select auth.uid()))
      or lead_id in (select lead_id from wa_conversaciones where asignado_a = (select auth.uid()) and lead_id is not null)
    )
  );

drop policy if exists tipificaciones_whatsapp_comercial_select on tipificaciones_whatsapp;
create policy tipificaciones_whatsapp_comercial_select on tipificaciones_whatsapp
  for select to authenticated
  using (
    lead_id in (select id from leads where asignado_a = (select auth.uid()))
    or lead_id in (select lead_id from wa_conversaciones where asignado_a = (select auth.uid()) and lead_id is not null)
  );
