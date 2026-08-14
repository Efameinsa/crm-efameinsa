-- ============================================================
-- CRM EFAMEINSA · Migración 0011 · Meta mensual del comercial
-- ============================================================
-- Feedback de gerencia (demo 14-08-2026, docs/06): las metas de venta SÍ
-- entran al CRM (antes se manejaban solo en RRHH). Nullable porque no todos
-- los comerciales tienen meta asignada aún; moneda implícita USD, igual que
-- el resto de montos del CRM.

alter table perfiles add column meta_mensual numeric(12, 2);
