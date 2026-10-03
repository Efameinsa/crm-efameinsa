-- 0380 · Postventa agrega y corrige contactos en la ficha que atiende.
--
-- Ariana (PV3), 02-10: abrió un seguimiento sobre RIPCONCIV (ficha de Desiré,
-- C9), quiso sumar a «María Angélica, jefe de mantenimiento» y el Guardar no
-- la dejaba: `contactos_por_cuenta` (0001) solo permite escribir al dueño de la
-- cartera, a Central y a gerencia. Postventa no tiene cartera propia (28-09)
-- y por eso nunca es «el dueño»: lo que dependa de serlo, para postventa
-- depende del área y de tener un caso con ese cliente.
--
-- Mismo criterio que la lectura (`contactos_postventa_select`): puede
-- postventa y tiene un caso con la cuenta (expediente suyo, servicio o
-- soporte). Agregar y corregir sí; borrar no — eso sigue siendo del dueño.

drop policy if exists contactos_postventa_inserta on contactos;
create policy contactos_postventa_inserta on contactos for insert to authenticated
  with check ((select puede_postventa()) and postventa_tiene_caso(cuenta_id));

drop policy if exists contactos_postventa_corrige on contactos;
create policy contactos_postventa_corrige on contactos for update to authenticated
  using ((select puede_postventa()) and postventa_tiene_caso(cuenta_id))
  with check ((select puede_postventa()) and postventa_tiene_caso(cuenta_id));
