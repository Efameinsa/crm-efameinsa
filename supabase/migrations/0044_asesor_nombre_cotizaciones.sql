-- ============================================================
-- CRM EFAMEINSA · Migración 0044 · Nombre del asesor en el archivo
-- ============================================================
-- Los documentos vienen firmados con el NOMBRE de la persona; el código
-- (C1..C10) se deduce del correo de la firma cuando está. Guardar también el
-- nombre deja lista la asignación que el ing. Carlos va a devolver: él dice
-- "Mercedes Guillén es C3" y se resuelven de golpe todas las suyas, sin
-- volver a leer 5.870 documentos.
--
-- No sustituye a comercial_id: es el dato crudo del papel. Cuando nombre y
-- código no coinciden (pasa: copian la plantilla de un compañero y queda el
-- nombre de uno con el correo del otro), tener los dos permite ver el choque
-- en vez de elegir a ciegas.

alter table cotizaciones_historicas add column if not exists asesor_nombre text;
create index if not exists ix_cot_hist_asesor_nombre on cotizaciones_historicas (asesor_nombre);

comment on column cotizaciones_historicas.asesor_nombre is
  'Nombre tal como aparece en la firma del documento. El código vigente es comercial_id/asesor_codigo; este campo sirve para asignar los que no traían correo en la firma.';
