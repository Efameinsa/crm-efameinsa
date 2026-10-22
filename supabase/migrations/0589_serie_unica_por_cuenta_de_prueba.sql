-- ============================================================
-- CRM EFAMEINSA · Migración 0589 · La serie es única dentro de cada mundo (real / prueba)
-- ============================================================
-- 22-10-2026: la cuenta de práctica de operaciones cargó el mismo Excel de
-- stock que Lesly (para ver las pantallas con datos) y, al entrar la carga
-- real, la serie chocaba con la de prueba: el índice único de 0117 no miraba
-- es_prueba. Las máquinas de práctica viven en su propio mundo (RLS las
-- separa); la serie tiene que ser única dentro de cada uno, no entre los dos.
drop index if exists uq_inventario_serie;
create unique index if not exists uq_inventario_serie
  on inventario_equipos (upper(serie), es_prueba) where estado <> 'baja';
