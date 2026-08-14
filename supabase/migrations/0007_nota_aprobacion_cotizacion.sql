-- ============================================================
-- CRM EFAMEINSA · Migración 0007 · Nota de gerencia al aprobar/rechazar
-- ============================================================
-- Gerencia necesita poder decir POR QUÉ rechazó (o con qué condición aprobó)
-- una cotización bajo lista — sin esto el comercial se queda sin saber qué
-- ofrecer en su lugar. Detectado al preparar la demo del piloto.

alter table cotizaciones add column nota_gerencia text;
