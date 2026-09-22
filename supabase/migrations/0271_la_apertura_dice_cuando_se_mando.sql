-- LA APERTURA DICE CUÁNDO SE MANDÓ EL CORREO (ítem 8 de la reunión del 22-09).
--
-- Carlos, mirando la pantalla con Rubí: «ya no trabajes como en Word, porque
-- lo tenemos aquí. Te da ya todo el formato listo, lo tomas y lo envías». El
-- CRM ya deja el correo escrito (asuntoApertura/cuerpoApertura) para copiar y
-- pegar, pero no quedaba registro de que la persona en efecto lo copió y lo
-- mandó — al almacén (que despacha con la apertura) y al cliente (que
-- coordina la recepción). Dos marcas de tiempo, cada una con «marcar
-- enviado», igual que el resto de pasos del pedido.

alter table servicios_postventa
  add column if not exists apertura_enviada_almacen_at timestamptz,
  add column if not exists apertura_enviada_cliente_at timestamptz;

comment on column servicios_postventa.apertura_enviada_almacen_at is
  'Cuándo se marcó como enviado el correo de la apertura al almacén (0271).';
comment on column servicios_postventa.apertura_enviada_cliente_at is
  'Cuándo se marcó como enviado el correo de la apertura al cliente (0271).';
