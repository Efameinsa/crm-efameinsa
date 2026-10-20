-- ============================================================
-- CRM EFAMEINSA · Migración 0554 · Postventa borra un contacto mal puesto
-- ============================================================
-- Reunión de gerencia 20-10-2026 (Beneficencia de Huancayo): en «Datos y
-- contactos» había un «Cristian» que sumó Ariana (postventa) y que no era de
-- ese cliente. Brenda (PV2) no lo pudo borrar: «no está en su cartera».
-- Gerencia: «que el usuario de Brenda le permita gestionar todo». Postventa ya
-- podía agregar y corregir contactos de los clientes con caso o pedido
-- (0109, 0380); ahora también borrarlos. Queda en el registro de acciones
-- (0513), así que se puede deshacer, y el dueño de la cartera recibe el aviso
-- (lo manda la pantalla).
-- ============================================================

drop policy if exists contactos_postventa_borra on contactos;
create policy contactos_postventa_borra on contactos for delete to authenticated
  using ((select puede_postventa()) and postventa_tiene_caso(cuenta_id));
