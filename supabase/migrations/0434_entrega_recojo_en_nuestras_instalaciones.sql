-- 0434 · RECOJO EN NUESTRAS INSTALACIONES (Ariana, postventa, buzón 10-10).
--
-- «En el despacho hay equipos industriales que se recogen directamente en
-- nuestra planta. Debería habilitarse la opción “Recojo en nuestras
-- instalaciones”». La entrega de un pedido era a domicilio o por agencia
-- (0259); ahora también puede ser que el cliente lo recoja con su transporte.
-- El circuito no cambia (apertura, guía, salida); cambia lo que dice la
-- apertura en el primer destino y cómo el almacén registra la entrega.

alter table public.servicios_postventa drop constraint if exists servicios_postventa_entrega_modo_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_entrega_modo_check check (entrega_modo in ('domicilio', 'agencia', 'planta'));

comment on column public.servicios_postventa.entrega_modo is
  'A domicilio o en agencia (0259), o el cliente lo recoge en nuestras instalaciones (planta, 0434). En agencia, agencia_destino dice cuál y a qué ciudad.';
