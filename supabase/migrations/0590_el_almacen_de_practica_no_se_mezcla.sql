-- ============================================================
-- CRM EFAMEINSA · Migración 0590 · El almacén de práctica no se mezcla con el real
-- ============================================================
-- 22-10-2026: Lesly veía «448 máquinas en el almacén» cuando el real tenía 246:
-- las otras 202 eran de la cuenta de práctica. La política de escritura de 0117
-- era «for all» (también cubre SELECT) y las políticas se suman, así que
-- operaciones y gerencia leían los dos mundos. Se separa: leer, siempre dentro
-- del mundo propio; escribir, operaciones o gerencia, también dentro del suyo.

drop policy if exists inventario_escribe on inventario_equipos;
create policy inventario_inserta on inventario_equipos for insert to authenticated
  with check (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
create policy inventario_actualiza on inventario_equipos for update to authenticated
  using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()))
  with check (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
create policy inventario_borra on inventario_equipos for delete to authenticated
  using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));

-- Lo mismo para lo que está por llegar (0586 nació con el mismo «for all»).
drop policy if exists stock_proyectado_escribe on stock_proyectado;
create policy stock_proyectado_inserta on stock_proyectado for insert to authenticated
  with check (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
create policy stock_proyectado_actualiza on stock_proyectado for update to authenticated
  using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()))
  with check (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
create policy stock_proyectado_borra on stock_proyectado for delete to authenticated
  using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
