-- 17-09-2026: «Mandar equipo» desde la bandeja de WhatsApp (Santos). El
-- comercial manda la ficha del equipo como tarjeta con botones («Me interesa»,
-- «Pedir cotización», «Ver otra opción») o, si el catálogo de Meta está
-- conectado, el producto del catálogo. Lo que el cliente toca vuelve por el
-- webhook como mensaje `interactive`; si arma un pedido desde el catálogo,
-- como `order`. Y queda escrito QUÉ equipo se le mostró (equipo_sku), para que
-- la ficha del cliente sepa de qué máquina se habló.
alter table wa_mensajes drop constraint if exists wa_mensajes_tipo_check;
alter table wa_mensajes add constraint wa_mensajes_tipo_check check (
  tipo in ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contacts', 'button', 'interactive', 'order', 'unknown')
);
alter table wa_mensajes add column if not exists equipo_sku text;
comment on column wa_mensajes.equipo_sku is 'SKU del equipo que se mandó (ficha o catálogo) o sobre el que el cliente respondió (0250).';
create index if not exists wa_mensajes_equipo_sku_idx on wa_mensajes (equipo_sku) where equipo_sku is not null;
