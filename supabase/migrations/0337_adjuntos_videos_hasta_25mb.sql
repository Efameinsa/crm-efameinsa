-- 0337 · Central adjunta los videos que manda el prospecto
--
-- 29-09-2026, Central: «en Registrar contactos CRM no se puede adjuntar
-- videos». El bucket ya aceptaba video/mp4 y video/3gpp (0234, para el chat de
-- WhatsApp), pero el formulario solo dejaba fotos, PDF, Word y Excel, y un
-- video de WhatsApp pasa con facilidad los 10 MB del bucket. Se sube el tope a
-- 25 MB (el formulario sigue limitando documentos y fotos a 10 MB) y se suman
-- los videos del iPhone (.mov) y webm.

update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = (
         select array_agg(distinct m)
           from unnest(allowed_mime_types || array['video/mp4', 'video/3gpp', 'video/quicktime', 'video/webm']) m
       )
 where id = 'adjuntos';
