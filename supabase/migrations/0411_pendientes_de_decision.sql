-- 0411 · «ESPERAN TU DECISIÓN» (Santos, 06-10-2026).
--
-- El buzón se atiende solo: lo que se puede resolver se resuelve y se le
-- responde a quien lo dejó. Lo que necesita que gerencia/admin decida
-- (rompe una regla de negocio, toca precios o datos de clientes sin prueba
-- suficiente…) queda anotado aquí y sale arriba en /observaciones.
-- Lo escribe el atendedor automático (service role); admin lo da por decidido.

create table if not exists public.pendientes_decision (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text,
  sugerencia_id uuid references public.sugerencias(id) on delete set null,
  created_at timestamptz not null default now(),
  resuelto_at timestamptz,
  resuelto_por uuid references public.perfiles(id),
  resolucion text
);

create index if not exists pendientes_decision_abiertos on public.pendientes_decision (created_at) where resuelto_at is null;

alter table public.pendientes_decision enable row level security;

drop policy if exists pendientes_decision_select on public.pendientes_decision;
create policy pendientes_decision_select on public.pendientes_decision for select to authenticated
  using (rol_actual() in ('admin', 'gerencia'));

drop policy if exists pendientes_decision_update on public.pendientes_decision;
create policy pendientes_decision_update on public.pendientes_decision for update to authenticated
  using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

grant select, update on public.pendientes_decision to authenticated;
grant all on public.pendientes_decision to service_role;
