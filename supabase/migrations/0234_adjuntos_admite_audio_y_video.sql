-- ============================================================
-- CRM EFAMEINSA · Migración 0234 · El bucket de adjuntos admite audio y video
-- ============================================================
-- Pedido de Santos (15-09): la bandeja de chat de WhatsApp (fase 2) necesita
-- mandar audios, documentos e imágenes desde el CRM, igual que WhatsApp Web.
-- Documentos e imágenes ya entraban por el bucket `adjuntos` (0029, captura
-- de leads); lo que faltaba era audio y video, que hasta hoy el bucket
-- rechazaba directamente por su `allowed_mime_types`.
--
-- Se amplía la lista existente en vez de crear un bucket aparte: es el mismo
-- concepto (un archivo privado, firmado por 1 hora para mostrarlo o, en este
-- caso, unos minutos para que Meta lo descargue al enviarlo) y separar por
-- bucket solo complicaría las políticas sin necesidad.
update storage.buckets
set allowed_mime_types = array_cat(
  allowed_mime_types,
  array[
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/amr', 'audio/opus',
    'video/mp4', 'video/3gpp'
  ]
)
where id = 'adjuntos'
  and not (allowed_mime_types @> array['audio/mpeg']);
