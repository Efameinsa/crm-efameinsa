-- ============================================================
-- CRM EFAMEINSA · Migración 0165 · Postventa lee el informe de cierre de su pedido
-- ============================================================
-- Santos, 04-09, con la señorita de postventa en Control de pedidos:
--
--   «Ecolab dice sin informe de cierre… V y P Ice también dice sin informe
--    de cierre, pero tú ya lo hiciste… casi de todos.»
--
-- Los siete pedidos en curso SÍ tienen su cierre (006, 012, 010, 004, 005,
-- 002 y 011). Lo que pasaba: el expediente del pedido busca el informe con
-- la cuenta de Post Venta, y la política de lectura de informes_cierre
-- (0049) solo dejaba pasar a gerencia, Central y al comercial dueño de la
-- cartera. Para postventa la consulta venía vacía y la pantalla decía
-- «Sin informe de cierre»; la apertura de despacho tampoco encontraba la
-- dirección ni el contacto del cierre.
--
-- Qué se hace: el área de postventa (es_postventa) lee los informes de
-- cierre, como ya lee los pedidos y las máquinas (servicios_pv_trabajo,
-- equipos_trabajo). Las cifras siguen tapadas en la aplicación
-- (puedeVerPrecios, decisión de Carlos del 27-08): el PDF y la vista del
-- cierre se cierran para postventa en el mismo despliegue.
-- ============================================================

drop policy if exists informes_lectura_postventa on informes_cierre;
create policy informes_lectura_postventa on informes_cierre
  for select to authenticated
  using (es_postventa() and es_prueba = es_cuenta_prueba());

comment on policy informes_lectura_postventa on informes_cierre is
  'El área de postventa ve los informes de cierre (para el expediente del pedido y la apertura de despacho); los montos los tapa la aplicación.';
