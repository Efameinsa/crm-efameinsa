-- ============================================================
-- CRM EFAMEINSA · Migración 0009 · Datos de firma del comercial
-- ============================================================
-- Las cotizaciones reales (modelos en Descargas/PROYECTO CRM EFAMEINSA/
-- modelos de cotizacion) cierran con la firma del comercial: nombre,
-- "Área Comercial", teléfono fijo, celular y correo corporativo
-- (comercialN@efameinsa.com). El CRM solo tenía el nombre.
-- Nullable a propósito: si faltan, el PDF muestra solo nombre + área.

alter table perfiles add column telefono text;
alter table perfiles add column celular text;
alter table perfiles add column email_contacto text;
