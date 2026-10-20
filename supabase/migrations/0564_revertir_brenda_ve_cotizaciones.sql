-- ============================================================
-- CRM EFAMEINSA · Migración 0564 · Se revierte la 0563
-- ============================================================
-- Santos, 20-10-2026: «vamos a revertir el privilegio de Brenda de ver las
-- cotizaciones de comercial: comercial solo puede ver su comercial y
-- postventa puede ver postventa. Ella tiene su laptop con su cuenta de
-- comercial y desde ahí busca lo que necesite».
--
-- Quita la lectura global de oportunidades, cotizaciones, renglones,
-- históricas, ventas e informes de cierre. Se QUEDA lo de la 0561/0562:
-- ver la ficha y corregir nombre, RUC, dirección y contactos de cualquier
-- cliente.
-- ============================================================

drop policy if exists oportunidades_global_select on oportunidades;
drop policy if exists cotizaciones_global_select on cotizaciones;
drop policy if exists items_cotizacion_global_select on cotizacion_items;
drop policy if exists cot_hist_global_select on cotizaciones_historicas;
drop policy if exists ventas_global_select on ventas;
drop policy if exists informes_global_select on informes_cierre;
