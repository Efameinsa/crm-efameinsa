-- Agenda del comercial (validada con gerencia sobre el mockup
-- docs/mockups/agenda-comercial.html, 19-08-2026): la próxima acción gana
-- una HORA opcional. Se agrega columna aparte en vez de volver
-- proxima_accion_at un timestamptz porque toda la app ya trata ese campo
-- como día de calendario (ver src/lib/fechas.ts: convertir zona en un date
-- lo corre un día). Sin hora = gestión de "todo el día", como hasta ahora.
alter table oportunidades add column if not exists proxima_accion_hora time;
