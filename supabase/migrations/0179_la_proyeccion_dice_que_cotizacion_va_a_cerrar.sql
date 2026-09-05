-- ============================================================
-- CRM EFAMEINSA · Migración 0179 · La proyección dice QUÉ cotización va a cerrar
-- ============================================================
-- Reunión del 05-09 (11:29). El problema que Carlos venía persiguiendo toda la
-- reunión: la proyección de la semana está casi vacía. Su diagnóstico fue
-- exacto:
--
--   «¿Qué es lo que están haciendo mal para corregir? La cotización que están
--    enviando no le ponen fecha. O sea, ¿para cuándo sería aproximadamente la
--    respuesta de esto?»
--
-- Y cuando apareció el caso difícil —un cliente con varias cotizaciones—, la
-- solución la dio él mismo:
--
--   «Mira, el cliente tiene 3 cotizaciones. Tu proyección de venta para mañana,
--    o para el lunes, tendrías que relacionar la cotización: o sea, una de las
--    3, eliges qué número de cotización estás proyectando cerrar la venta para
--    el día lunes.»
--
-- QUÉ CAMBIA. Hasta hoy proyectar era poner una fecha en la oportunidad, y el
-- monto proyectado salía de la ÚLTIMA cotización enviada — una elección del
-- sistema, no del comercial. Ahora se puede decir cuál: la proyección apunta a
-- una cotización concreta y el monto sale de esa.
--
-- SIGUE SIENDO OPCIONAL, a propósito. Una oportunidad sin cotización todavía
-- —un negocio en conversación— se proyecta igual con su monto estimado. Exigir
-- la cotización dejaría fuera justo lo que está empezando.
--
-- LO QUE ESTO NO ARREGLA SOLO. Que el comercial ponga la fecha sigue siendo una
-- disciplina, no una función. Lo que sí hace el sistema desde hoy es decirlo en
-- el cierre semanal cuando la proyección está vacía, en vez de felicitar a
-- alguien por superar una meta de mil setecientos dólares.
-- ============================================================

alter table public.oportunidades
  add column if not exists cotizacion_proyectada uuid references cotizaciones (id) on delete set null;

comment on column public.oportunidades.cotizacion_proyectada is
  'Cuál de las cotizaciones del cliente se proyecta cerrar en la fecha de cierre_proyectado. Opcional: sin ella la proyección toma la última cotización enviada, como antes (Carlos, 05-09).';

create index if not exists oportunidades_cotizacion_proyectada_idx
  on public.oportunidades (cotizacion_proyectada) where cotizacion_proyectada is not null;


-- ------------------------------------------------------------
-- Proyectar, ahora diciendo cuál
-- ------------------------------------------------------------
create or replace function public.proyectar_cierre(
  p_oportunidad uuid,
  p_fecha date,
  p_cotizacion uuid default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_op  oportunidades%rowtype;
  v_cot cotizaciones%rowtype;
begin
  select * into v_op from oportunidades where id = p_oportunidad;
  if v_op.id is null then
    raise exception 'La oportunidad no existe';
  end if;
  if not (v_op.comercial_id = auth.uid() or es_backoffice()) then
    raise exception 'Solo el comercial dueño o gerencia pueden proyectar el cierre';
  end if;
  if v_op.etapa in ('venta', 'rechazada', 'derivada') then
    raise exception 'Esta oportunidad ya está cerrada: no se le proyecta cierre';
  end if;

  -- La cotización elegida tiene que ser de ESTA oportunidad y estar enviada:
  -- proyectar el cierre de un borrador que el cliente nunca vio no es una
  -- proyección, es un deseo.
  if p_cotizacion is not null then
    select * into v_cot from cotizaciones where id = p_cotizacion;
    if v_cot.id is null then
      raise exception 'Esa cotización no existe';
    end if;
    if v_cot.oportunidad_id is distinct from p_oportunidad then
      raise exception 'Esa cotización es de otro cliente';
    end if;
    if v_cot.enviada_at is null then
      raise exception 'Esa cotización todavía no se le envió al cliente';
    end if;
  end if;

  -- p_fecha null = quitar la proyección, y con ella la cotización elegida.
  update oportunidades
     set cierre_proyectado = p_fecha,
         cotizacion_proyectada = case when p_fecha is null then null else p_cotizacion end,
         updated_at = now()
   where id = p_oportunidad;
end $function$;

revoke all on function public.proyectar_cierre(uuid, date, uuid) from public;
grant execute on function public.proyectar_cierre(uuid, date, uuid) to authenticated;

comment on function public.proyectar_cierre(uuid, date, uuid) is
  'Fija la fecha proyectada de cierre y, opcionalmente, CUÁL cotización se espera cerrar ese día (Carlos, 05-09: «eliges qué número de cotización estás proyectando cerrar»).';
