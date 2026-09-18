-- 18-09-2026: cableado de campañas (plan de campañas 2026-IV, fase 0).
-- 1. El lead guarda también las galletas del píxel (fbp/fbc) y si la persona
--    tiene cuenta en la web: con eso Meta casa el lead con el anuncio aunque
--    el navegador bloquee, y el panel dice quién se registró.
-- 2. Los eventos que el CRM manda a Meta (Conversions API) quedan escritos:
--    qué se mandó, por qué lead, y qué respondió Meta. Mejor esfuerzo: si
--    falla, queda el error y no frena nada.
alter table leads
  add column if not exists fbp text,
  add column if not exists fbc text,
  add column if not exists registro_web boolean not null default false;
comment on column leads.registro_web is 'La persona tiene cuenta creada en la web (0257).';

create table if not exists eventos_meta (
  id bigint generated always as identity primary key,
  lead_id uuid references leads(id) on delete set null,
  evento text not null,
  event_id text not null,
  valor numeric,
  enviado_at timestamptz not null default now(),
  respuesta jsonb,
  error text
);
create index if not exists eventos_meta_lead_idx on eventos_meta (lead_id);
create unique index if not exists eventos_meta_event_id_ux on eventos_meta (event_id);
alter table eventos_meta enable row level security;
-- Solo el servidor escribe (service role); gerencia lee para el panel.
drop policy if exists eventos_meta_lectura on eventos_meta;
create policy eventos_meta_lectura on eventos_meta for select to authenticated using (coalesce(es_backoffice(), false));
comment on table eventos_meta is 'Eventos mandados a la Conversions API de Meta desde el CRM (0257): Contact, Lead, SubmitApplication, Purchase.';
