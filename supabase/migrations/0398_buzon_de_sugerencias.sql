-- 0398 · Buzón de sugerencias (Santos, 05-10). Todo el personal deja comentarios
-- sobre el CRM —qué falta, qué falla, qué se puede mejorar— con texto y varias
-- capturas de pantalla, y Santos (admin) los lee, les cambia el estado y les
-- responde desde la misma pantalla. Las capturas van al bucket privado
-- 'adjuntos' bajo sugerencias/<autor>/…; acá solo se guardan sus metadatos.

create table if not exists public.sugerencias (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  tipo text not null default 'mejora' check (tipo in ('mejora', 'error', 'idea', 'duda')),
  pantalla text,
  titulo text not null check (length(btrim(titulo)) between 3 and 140),
  detalle text not null default '' check (length(detalle) <= 5000),
  adjuntos jsonb not null default '[]'::jsonb check (jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 10),
  estado text not null default 'nueva' check (estado in ('nueva', 'revisando', 'hecha', 'descartada')),
  respuesta text,
  respondida_por uuid references public.perfiles(id),
  respondida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sugerencias is 'Buzón de sugerencias del personal sobre el CRM, con capturas; lo atiende admin (0398).';

create index if not exists sugerencias_autor_idx on public.sugerencias (autor_id, created_at desc);
create index if not exists sugerencias_estado_idx on public.sugerencias (estado, created_at desc);

alter table public.sugerencias enable row level security;

-- Cada persona ve las suyas; admin y gerencia ven todas.
drop policy if exists sugerencias_select on public.sugerencias;
create policy sugerencias_select on public.sugerencias for select to authenticated
  using (autor_id = auth.uid() or rol_actual() in ('admin', 'gerencia'));

-- Cualquiera con perfil activo deja la suya, siempre a su nombre y como «nueva».
drop policy if exists sugerencias_insert on public.sugerencias;
create policy sugerencias_insert on public.sugerencias for insert to authenticated
  with check (autor_id = auth.uid() and estado = 'nueva' and respuesta is null and tiene_perfil_activo());

-- Solo admin cambia el estado y responde.
drop policy if exists sugerencias_update on public.sugerencias;
create policy sugerencias_update on public.sugerencias for update to authenticated
  using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

grant select, insert, update on public.sugerencias to authenticated;
grant all on public.sugerencias to service_role;
