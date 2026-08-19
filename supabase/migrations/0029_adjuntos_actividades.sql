-- Reunión 19-08 (Carlos): poder adjuntar a una gestión "un reporte de PDF,
-- Word, documento, fotos... para que se visualice" en la ficha del cliente.
-- Los archivos van a Storage (bucket privado 'adjuntos', se sirven con URL
-- firmada); en la actividad queda el arreglo de metadatos.
alter table actividades add column if not exists adjuntos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos', 'adjuntos', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Herramienta interna: cualquier usuario autenticado del CRM puede subir y
-- leer adjuntos (la visibilidad fina la da RLS de `actividades`, que es
-- donde vive el enlace; las rutas usan uuid, no son adivinables). Borrar no
-- se permite desde la app (historial append-only, mismo criterio que
-- actividades).
create policy adjuntos_lectura on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos');
create policy adjuntos_subida on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos');
