-- ============================================================
-- CRM EFAMEINSA · Migración 0004 · Fix: Central no veía actividades
-- ============================================================
-- docs/02-modelo-datos.md documenta que Central tiene lectura de seguimiento
-- sobre oportunidades/actividades/cotizaciones/ventas, igual que ya estaba
-- implementado para oportunidades y cotizaciones — pero la política de
-- `actividades` (migración 0001) solo contemplaba al comercial dueño y a
-- gerencia/admin, sin el caso de Central. Detectado al verificar el bloque B3
-- end-to-end: Central no veía las gestiones registradas por el comercial.

create policy actividades_central_select on actividades for select to authenticated
  using (rol_actual() = 'central');
