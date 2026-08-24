-- ============================================================
-- CRM EFAMEINSA · Migración 0058 · Cargo del comercial para la firma
-- ============================================================
-- Observación de Brenda (C1) el 24-08, primer día de uso real: «no jala mi
-- firma completa con número, correo, etc.».
--
-- El PDF sí sabía pintar teléfono, celular y correo — pero los pintaba solo si
-- existían, y en `perfiles` estaban todos en null. O sea que TODAS las
-- cotizaciones que salieron hoy a clientes reales fueron firmadas solo con el
-- nombre: sin un número al que devolver la llamada.
--
-- Falta además el cargo. El documento decía "Área Comercial" quemado en el
-- código, pero las firmas reales que enviaron dicen "Ejecutivo Comercial" y
-- "Ejecutivo Comercial Senior" — y el Senior no es adorno, es jerarquía frente
-- al cliente.

alter table perfiles
  add column if not exists cargo text;

comment on column perfiles.cargo is
  'Cargo tal como va impreso en la firma de cotizaciones e informes (ej. "Ejecutivo Comercial Senior"). Migración 0058.';
