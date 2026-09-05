-- ============================================================
-- CRM EFAMEINSA · Migración 0180 · Una sola proyectar_cierre
-- ============================================================
-- La 0179 le agregó un tercer parámetro con valor por defecto
-- —`proyectar_cierre(uuid, date, uuid)`— pero la versión de dos parámetros de
-- la 0084 siguió existiendo. Con las dos vivas, llamarla con dos argumentos es
-- AMBIGUO: Postgres no sabe si es la vieja o la nueva usando su valor por
-- defecto, y falla.
--
-- Se detectó en el ensayo, antes de desplegar: «proyectar sin cotización» →
-- «function proyectar_cierre(unknown, unknown) does not exist». La aplicación
-- llama exactamente así, con dos parámetros, cuando el comercial solo pone la
-- fecha — que es el caso más común.
--
-- Se va la vieja. La nueva la cubre entera: con la cotización en null hace
-- exactamente lo mismo.
-- ============================================================

drop function if exists public.proyectar_cierre(uuid, date);
