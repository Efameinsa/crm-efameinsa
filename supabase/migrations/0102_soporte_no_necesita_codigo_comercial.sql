-- ============================================================
-- CRM EFAMEINSA · Migración 0102 · Soporte no necesita código comercial
-- ============================================================
-- La 0101 abrió la cuenta de soporte y al crear la primera —la de Lesly— saltó
-- el guardián que lleva ahí desde el día uno:
--
--   comercial_activo_con_codigo: un comercial activo tiene que tener código
--
-- Y tiene razón para todo el que vende: el código (C1, C4, C5…) es como se le
-- reconoce en el maestro, en los reportes y en las cotizaciones. Pero la cuenta
-- de soporte NO vende: darle un código la metería en las listas donde Central
-- elige a quién derivar un contacto, y un día alguien le derivaría un cliente a
-- quien está para enseñar a usar el sistema.
--
-- Se afloja el guardián solo para ese caso, que es exactamente el que la 0101
-- describe.

alter table perfiles drop constraint if exists comercial_activo_con_codigo;
alter table perfiles add constraint comercial_activo_con_codigo
  check (rol <> 'comercial' or not activo or codigo_comercial is not null or es_soporte);

comment on constraint comercial_activo_con_codigo on perfiles is
  'Todo comercial activo tiene su código, salvo la cuenta de soporte, que no vende y por eso no debe aparecer entre los asignables (migraciones 0101 y 0102).';
