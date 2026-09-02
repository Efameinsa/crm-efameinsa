-- ============================================================
-- CRM EFAMEINSA · Migración 0157 · La confirmación de Finanzas acepta una captura
-- ============================================================
-- Carlos, 02-09, probando el pedido de Sierra Travel en postventa: «¿no sería
-- más conveniente tomar una captura y subirla? Yo le mandaba un correo y me
-- respondió el correo, y lo subo. Foto, screenshot, que suba lo que tenga.
-- Este dato no lo va a contabilizar, sino más bien confirmar».
--
-- Hasta ahora postventa tenía que ESCRIBIR quién de Finanzas confirmó y por
-- dónde (0150). Ahora puede subir el pantallazo del correo o del WhatsApp y
-- eso vale como confirmación; el texto queda opcional. La captura vive en el
-- bucket privado `adjuntos`, bajo finanzas/<pedido>/, y acá solo se guarda
-- la ruta. Quién y cuándo la subió ya lo dicen pago_confirmado_por/_at.
-- ============================================================

alter table servicios_postventa
  add column if not exists pago_confirmado_captura text;

comment on column servicios_postventa.pago_confirmado_captura is
  'Ruta en Storage (bucket adjuntos) del pantallazo con que Finanzas confirmó el pago: correo, WhatsApp o voucher acreditado. Vale como confirmación aunque no se escriba quién ni por dónde (0157).';
