-- 0300 · La política de lectura de clientes de postventa, lo barato primero.
--
-- Santos, 24-09: «estoy en la cuenta de postventa y me fui a clientes y se
-- demora». La política evaluaba primero postventa_tiene_caso(id) —tres
-- búsquedas y es_cuenta_prueba() por ficha— y recién después la condición que
-- a postventa real ya le da acceso a todo. Postgres evalúa un OR de izquierda a
-- derecha y corta en el primer verdadero: con la condición barata adelante,
-- postventa real no paga nada por fila (leer clientes: ~500 → ~120 ms en la base) y la
-- cuenta de práctica sigue viendo solo sus casos. Misma regla, otro orden.

drop policy if exists cuentas_postventa_select on public.cuentas;
create policy cuentas_postventa_select on public.cuentas
  as permissive
  for select
  to authenticated
  using (
    ((select es_postventa()) and not (select es_cuenta_prueba()))
    or ((select puede_postventa()) and postventa_tiene_caso(id))
  );
