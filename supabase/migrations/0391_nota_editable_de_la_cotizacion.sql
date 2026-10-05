-- ============================================================
-- CRM EFAMEINSA · Migración 0391 · La nota de la cotización de postventa,
-- editable
-- ============================================================
-- Gabriela (PV2), 05-10-2026: «esta nota que me permita editar, porque no en
-- todos incluye el examen médico ocupacional (dale una funcionalidad para que
-- pueda editar todos los campos de la nota)».
--
-- `notas_pdf`: las viñetas de la «Nota» tal como salen en ESTA cotización.
-- NULL = la nota de siempre del formato (mantenimiento o repuestos). Se
-- escribe con el mismo UPDATE que el lugar de entrega y las condiciones: no
-- toca crear_cotizacion ni editar_cotizacion.
-- ============================================================

alter table cotizaciones add column if not exists notas_pdf text[];
comment on column cotizaciones.notas_pdf is
  'Viñetas de la «Nota» del PDF de postventa en esta cotización (0391). NULL = la nota de siempre del formato.';
