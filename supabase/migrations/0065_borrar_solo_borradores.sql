-- ============================================================
-- CRM EFAMEINSA · Migración 0065 · Solo se borra lo que nunca salió al cliente
-- ============================================================
-- Katerine (C5), 24-08: estuvo probando el cotizador y le quedaron varios
-- borradores del mismo cliente sin saber cuál es el bueno. Pide un botón para
-- borrar. Es razonable: un borrador no lo vio nadie.
--
-- Pero al ir a ponerlo apareció un agujero. La política `cotizaciones_delete`
-- comprueba SOLO de quién es la oportunidad, no en qué estado está el
-- documento. O sea que el comercial podía borrar también una cotización YA
-- ENVIADA. Nunca pasó porque no existía el botón, pero era cuestión de que
-- alguien lo pusiera — que es exactamente lo que estoy haciendo.
--
-- Eso no puede quedar solo en la pantalla. Una cotización enviada es un
-- documento que el cliente tiene en la mano y su número está comprometido con
-- contabilidad: si desaparece, el correlativo queda con un hueco que nadie
-- puede explicar. Es la misma regla de inmutabilidad de las migraciones 0012 y
-- 0062, que hasta ahora cubría el UPDATE y se había olvidado del DELETE.
--
-- Gerencia y administración conservan el borrado sin límite (política
-- `cotizaciones_backoffice`, FOR ALL): tiene que quedar una forma de arreglar
-- un desastre. La diferencia es que ahí hay una decisión de por medio.

drop policy if exists cotizaciones_delete on cotizaciones;

create policy cotizaciones_delete on cotizaciones
  for delete
  using (
    estado = 'borrador'
    and enviada_at is null
    and exists (
      select 1 from oportunidades o
      where o.id = cotizaciones.oportunidad_id
        and o.comercial_id = (select auth.uid())
    )
  );

comment on policy cotizaciones_delete on cotizaciones is
  'El comercial borra sus cotizaciones mientras sean borrador y no se hayan enviado. Una vez que el documento salió al cliente, su número está comprometido y no desaparece (migración 0065).';
