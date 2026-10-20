-- ============================================================
-- CRM EFAMEINSA · Migración 0563 · Brenda VE las cotizaciones y ventas de todos
-- ============================================================
-- Santos, 20-10-2026: «Brenda dice que no encuentra las cotizaciones para ir
-- haciendo otros cierres de sus otros clientes… ella debe poder ver todo».
--
-- Causa: desde postventa2@ (PV2) solo veía las cotizaciones de expedientes de
-- POSTVENTA (cotizaciones_servicios_select: tipo_postventa not null). Las
-- comerciales —también las que ella misma hizo con comercial1@ (C1), que es
-- otro usuario— no le salían en el cierre, ni sus renglones, ni las ventas,
-- ni las cotizaciones del archivo histórico de los comerciales.
--
-- Con la marca de poder global (0561, solo sus dos cuentas) lee todo lo que el
-- cierre y la ficha necesitan, de cualquier cartera. Solo LECTURA: crear,
-- editar y emitir el cierre siguen con sus reglas (postventa ya emite los
-- cierres que ella crea).
-- ============================================================

drop policy if exists oportunidades_global_select on oportunidades;
create policy oportunidades_global_select on oportunidades for select to authenticated
  using ((select edita_clientes_global()));

drop policy if exists cotizaciones_global_select on cotizaciones;
create policy cotizaciones_global_select on cotizaciones for select to authenticated
  using ((select edita_clientes_global()));

drop policy if exists items_cotizacion_global_select on cotizacion_items;
create policy items_cotizacion_global_select on cotizacion_items for select to authenticated
  using ((select edita_clientes_global()));

drop policy if exists cot_hist_global_select on cotizaciones_historicas;
create policy cot_hist_global_select on cotizaciones_historicas for select to authenticated
  using ((select edita_clientes_global()));

drop policy if exists ventas_global_select on ventas;
create policy ventas_global_select on ventas for select to authenticated
  using ((select edita_clientes_global()));

drop policy if exists informes_global_select on informes_cierre;
create policy informes_global_select on informes_cierre for select to authenticated
  using ((select edita_clientes_global()) and es_prueba = false);
