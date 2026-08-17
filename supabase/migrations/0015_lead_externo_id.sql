-- ============================================================
-- CRM EFAMEINSA · Migración 0015 · ID externo de lead (B10.4)
-- ============================================================
-- Google Ads entrega los leads de sus formularios por webhook directo (sin
-- intermediarios tipo Make/Pabbly) y su documentación es explícita:
-- "A single lead is not guaranteed to be delivered exactly once... use
-- lead_id to dedupe leads". O sea, el MISMO lead puede llegar dos o más
-- veces y es responsabilidad nuestra no duplicarlo.
--
-- Se guarda el id que asigna la plataforma de origen y se le pone un índice
-- único: así la deduplicación la garantiza la base de datos, no la lógica de
-- la aplicación (que podría fallar con dos entregas simultáneas).
-- Nullable porque los leads que captura Central a mano no tienen id externo.

alter table leads add column lead_externo_id text;

create unique index uq_leads_externo on leads (lead_externo_id)
  where lead_externo_id is not null;
