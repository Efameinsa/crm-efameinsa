-- 0485 — LO QUE SE LE ADJUNTA AL ASISTENTE (14-10-2026, Santos).
--
-- «Que permita adjuntar documentos, fotos, pdf, word». Cada pregunta guarda la
-- lista de lo que se adjuntó: nombre, tipo, peso y dónde quedó la copia en el
-- almacenamiento (bucket «adjuntos», carpeta asistente/), para que la
-- auditoría de admin vea exactamente qué se le mostró al asistente.
alter table public.asistente_mensajes add column if not exists adjuntos jsonb not null default '[]'::jsonb;
