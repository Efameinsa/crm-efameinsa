-- ============================================================
-- CRM EFAMEINSA · Migración 0235 · Audio grabado en el chat + stickers de la empresa
-- ============================================================
-- Dos pedidos de Santos sobre la bandeja de WhatsApp (fase 2, 15-09):
--   1. Grabar un audio desde el micrófono del navegador, como WhatsApp Web
--      (hasta hoy solo se podía adjuntar un archivo de audio ya grabado).
--   2. Poder mandar los stickers de la empresa desde el chat.
--
-- PENDIENTE DE APROBACIÓN DE GERENCIA PARA USAR EN PRODUCCIÓN, igual que el
-- resto de la fase 2.

-- ------------------------------------------------------------
-- 1. El navegador graba en WebM/Opus (Chrome no arma el contenedor Ogg que
-- prefiere Meta) — el bucket todavía no lo dejaba pasar.
update storage.buckets
set allowed_mime_types = array_cat(allowed_mime_types, array['audio/webm'])
where id = 'adjuntos'
  and not (allowed_mime_types @> array['audio/webm']);

-- ------------------------------------------------------------
-- 2. Catálogo de stickers de la empresa — mismo patrón que
-- `campanias_whatsapp` (0231) y `wa_plantillas_rapidas` (0233): alguien de
-- marketing los carga una vez (ya convertidos a WebP cuadrado, que es lo
-- único que WhatsApp acepta como sticker), y desde ahí Central y los
-- comerciales solo ELIGEN uno para mandarlo — no suben un archivo cada vez.
create table if not exists wa_stickers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- Ruta dentro del bucket privado `adjuntos` (mismo bucket que el resto de
  -- adjuntos del chat), ya convertida a WebP ≤512×512 y ≤100 KB al subirla.
  path text not null,
  activo boolean not null default true,
  creado_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

comment on table wa_stickers is 'Catálogo de stickers de la empresa para el chat de WhatsApp (fase 2, 15-09-2026). Se cargan una vez, ya convertidos a WebP, y se eligen de una lista al mandar uno.';

alter table wa_stickers enable row level security;

drop policy if exists wa_stickers_select on wa_stickers;
create policy wa_stickers_select on wa_stickers
  for select to authenticated
  using ((select activo from perfiles where id = auth.uid()) is true);

drop policy if exists wa_stickers_write on wa_stickers;
create policy wa_stickers_write on wa_stickers
  for all to authenticated
  using (es_backoffice())
  with check (es_backoffice());
