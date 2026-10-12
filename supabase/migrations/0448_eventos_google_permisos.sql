-- 0448 · eventos_google sin permisos para service_role
--
-- 12-10-2026: la primera subida a Google (148 conversiones) no quedó anotada:
-- 0435 creó la tabla por psql y PostgREST respondía «permission denied for
-- table eventos_google». Sin la anotación, cada hora se volverían a enviar.

grant select, insert, update, delete on table public.eventos_google to service_role;
