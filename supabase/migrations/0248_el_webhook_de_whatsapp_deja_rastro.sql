-- 17-09-2026: la primera prueba real del WhatsApp (Santos escribió «hola» al
-- +51 932 766 654) no apareció en el CRM y no había forma de saber si Meta
-- llamó al webhook y falló la firma, o si nunca llamó. Cada llamada queda
-- escrita cruda ANTES de procesarla: qué llegó, si la firma era válida y qué
-- falló. Solo la escribe el servidor (service role); nadie la lee desde la
-- aplicación, así que no lleva políticas.
create table if not exists wa_webhook_eventos (
  id bigint generated always as identity primary key,
  recibido_at timestamptz not null default now(),
  firma_valida boolean not null,
  cuerpo jsonb,
  cuerpo_texto text,
  error text
);
alter table wa_webhook_eventos enable row level security;
create index if not exists wa_webhook_eventos_recibido_idx on wa_webhook_eventos (recibido_at desc);
comment on table wa_webhook_eventos is 'Rastro crudo de cada llamada de Meta al webhook de WhatsApp (0248). Diagnóstico; se puede podar.';
