-- ============================================================
-- CRM EFAMEINSA · Migración 0121 · Las fotos del catálogo se suben
-- ============================================================
-- «Donde dice sin foto debe salir agregar foto, para que la suba, y cuando la
-- suba debe hacer un proceso para que optimice la imagen y se acomode a las
-- reglas de maquetación de las cotizaciones, y que no ocupen tanto peso»
-- (28-08).
--
-- HOY LAS FOTOS VIVEN EN EL REPOSITORIO. Son 296 archivos y 44 MB en
-- `public/productos/`, con unas de 650 KB. Eso funciona para las que ya están
-- —se cargaron a mano, con el proyecto— pero no se puede subir una desde la
-- pantalla: en el servidor de producción el disco es de solo lectura y lo que
-- se escriba se pierde en el siguiente despliegue. Por eso las nuevas van al
-- almacenamiento, y el PDF sabe leer de los dos lados: `foto_path` sin prefijo
-- es un archivo del repositorio, y con `storage:` es una foto subida.
--
-- EL PESO SE CORTA ANTES DE SUBIR, en el navegador: la caja de la foto en la
-- ficha impresa es de 54 × 96 mm, así que una imagen de más de 1000 px de lado
-- no aporta un punto de tinta y sí kilobytes. El límite de 2 MB del bucket es
-- la red de seguridad, no la regla.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Las fotos del catálogo las mira todo el mundo —salen en la cotización que
-- recibe el cliente— pero las cambia operaciones.
drop policy if exists fotos_productos_lectura on storage.objects;
create policy fotos_productos_lectura on storage.objects for select
using (bucket_id = 'productos');

drop policy if exists fotos_productos_escribe on storage.objects;
create policy fotos_productos_escribe on storage.objects for insert to authenticated
with check (bucket_id = 'productos' and (es_operaciones() or es_backoffice()));

drop policy if exists fotos_productos_reemplaza on storage.objects;
create policy fotos_productos_reemplaza on storage.objects for update to authenticated
using (bucket_id = 'productos' and (es_operaciones() or es_backoffice()));

drop policy if exists fotos_productos_borra on storage.objects;
create policy fotos_productos_borra on storage.objects for delete to authenticated
using (bucket_id = 'productos' and (es_operaciones() or es_backoffice()));

comment on column productos.foto_path is
  'La foto del equipo. Sin prefijo: archivo de public/productos (las 296 que vinieron con el proyecto). Con «storage:»: subida desde la pantalla, en el bucket productos (migración 0121).';
