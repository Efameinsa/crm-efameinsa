-- ============================================================
-- CRM EFAMEINSA · Migración 0345 · Primer destino y destino final
-- ============================================================
-- 30-09-2026, Rubí y Lesly: en una entrega por agencia la apertura decía
-- «ENTREGA EN AGENCIA: MARVISUR» y debajo la dirección del CLIENTE en Ica
-- (ANDINAS SERVICE). El almacén no sabía a dónde llevar el equipo: faltaba la
-- dirección de la agencia donde lo deja, la «primera dirección». La del
-- cliente (direccion_entrega) pasa a leerse como la dirección final.
-- ============================================================

alter table public.servicios_postventa
  add column if not exists agencia_direccion text;

comment on column public.servicios_postventa.agencia_direccion is
  'Entrega en agencia (0345): dirección de la agencia donde el almacén deja el equipo (primer destino). direccion_entrega es la del cliente (destino final).';
