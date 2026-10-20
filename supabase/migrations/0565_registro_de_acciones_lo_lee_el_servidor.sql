-- 0565 · El historial del caso lo lee el servidor (20-10, LINO ESPIRITU).
-- HistorialDelCaso lee registro_acciones con la llave de servicio, pero la 0513
-- solo le dio SELECT a authenticated: el historial salía vacío en todos los casos.
grant select on public.registro_acciones to service_role;
