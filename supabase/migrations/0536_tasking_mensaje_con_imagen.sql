-- 0536 · El WhatsApp por QR también manda una imagen (Santos 19-10, prueba del recorrido): mkt
-- deja en la cola los avisos al cliente de la lista piloto con la ilustración del mensaje, y el
-- bot la manda con el texto como leyenda. Sin imagen, sigue saliendo solo el texto.
alter table tasking_mensajes add column if not exists imagen text;
comment on column tasking_mensajes.imagen is 'URL pública de una imagen que el bot manda con el cuerpo como leyenda (avisos al cliente de la prueba del recorrido).';
