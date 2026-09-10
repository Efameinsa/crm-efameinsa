-- ============================================================
-- CRM EFAMEINSA · Migración 0219 · Central ve las ventas del cliente
-- ============================================================
-- Santos, 10-09, con el «triangulito» de la bandeja recién desplegado:
-- «la señorita de Central está contenta porque ya puede ver el historial de
-- las gestiones, pero cuando le da a abrir la ficha completa el link la
-- regresa a la misma bandeja […] Central debería poder ver toda la cartera
-- como lo tiene gerencia».
--
-- El portazo era del layout de /comercial (no admite el rol central) y se
-- arregla en la app con /central/clientes. Pero al abrir esa ficha con la
-- sesión de Central faltaba un pedazo que no era de la app sino de la base:
-- `ventas` solo la leen gerencia/admin y el comercial dueño. Sin esta
-- política, a Central la ficha le sale sin «Compras anteriores» y el
-- historial sin las ventas — justo lo que necesita para saber si una cuenta
-- se está trabajando de verdad antes de derivar.
--
-- No es un dato nuevo para ella: Central ya lee los informes de cierre con su
-- monto (0049) y tiene la pantalla «Cierres de venta» desde el 27-08. Esto
-- solo deja que la ficha le muestre lo mismo ordenado como venta.
--
-- Solo lectura. Quien registra o anula una venta sigue siendo quien era.
-- ============================================================

drop policy if exists ventas_central_select on ventas;
create policy ventas_central_select on ventas
  for select to authenticated
  using ((select rol_actual()) = 'central'::rol_usuario);

comment on policy ventas_central_select on ventas is
  'Central lee las ventas para la ficha del cliente (/central/clientes, 0219). Ya veía el monto en los informes de cierre; esto es la misma información en la ficha.';
