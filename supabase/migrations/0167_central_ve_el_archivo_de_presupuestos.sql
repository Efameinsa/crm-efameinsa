-- ============================================================
-- CRM EFAMEINSA · Migración 0167 · Central ve también el archivo de presupuestos
-- ============================================================
-- Reunión del 04-09 (grabación 09:47). Santos y Carlos buscan el Presu_431-26
-- de Flores Rioja en la pantalla de Central y no aparece:
--
--   «431 de Open, filtro, no aparece. ¿Central no ve todo, los presupuestos?
--    Debería, ¿no? … Entiendo que la restricción es lo nuevo, nada más está
--    mirando. Eso sí, hay que darle acceso a todo, creo.»
--
-- Por qué no aparecía: la pantalla lista `cotizaciones` (lo que emitió el CRM,
-- serie Open desde la 447 del 25-08) y el 431 es del 17-08, hecho en Word y
-- cargado a `cotizaciones_historicas`, tabla que Central no podía leer: sus
-- políticas eran solo backoffice y el comercial dueño de la cuenta.
--
-- Central mira y controla el correlativo; no edita el archivo. Por eso solo
-- lectura.
-- ============================================================

drop policy if exists cot_hist_central on cotizaciones_historicas;
create policy cot_hist_central on cotizaciones_historicas
  for select to authenticated
  using ((select rol_actual()) = 'central'::rol_usuario);

comment on policy cot_hist_central on cotizaciones_historicas is
  'Central lee el archivo de presupuestos anteriores al CRM para controlar el correlativo completo (Carlos, 04-09).';
