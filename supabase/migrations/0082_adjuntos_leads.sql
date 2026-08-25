-- Central 25-08 (Brenda): «cuando hago el registro los prospectos me envían
-- fotos desde el WhatsApp, se podría poner en la descripción también la foto
-- o un PDF que el prospecto incluya en su solicitud». Hasta hoy esa foto se
-- quedaba en el teléfono y el comercial recibía solo el texto.
--
-- Mismo esquema que los adjuntos de gestión (0029): los archivos van al
-- bucket privado 'adjuntos' (que ya existe, con sus políticas) bajo el
-- prefijo leads/, y en el lead queda el arreglo de metadatos
-- {path, nombre, tipo, tamano}.
alter table leads add column if not exists adjuntos jsonb not null default '[]'::jsonb;
