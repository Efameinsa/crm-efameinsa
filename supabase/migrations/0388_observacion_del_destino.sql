-- OBSERVACIÓN DEL DESTINO (Rubí, 03-10): «en la parte de destino debería ir
-- una opción para observación, para poder detallar la sede o dirección de la
-- agencia en destino de donde tiene que llegar el pedido». Sale en la fila
-- DESTINO FINAL de la apertura de despacho, en observaciones.
alter table public.servicios_postventa
  add column if not exists destino_observacion text;

comment on column public.servicios_postventa.destino_observacion is
  'Sede o dirección de la agencia en destino adonde llega el pedido; observaciones de la fila DESTINO FINAL de la apertura (0388).';
