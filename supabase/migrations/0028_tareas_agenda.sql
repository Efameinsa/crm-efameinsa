-- Reunión 19-08: Carlos aprobó habilitar TAREAS PERSONALES en la agenda del
-- comercial ("en la práctica sí manejan una agenda personal"). Diseño
-- acordado con Darwin: tabla SOLO para tareas sin cliente — todo lo que
-- toque a un cliente sigue siendo la próxima acción de su oportunidad (la
-- disciplina del embudo no se puede esquivar digitando tareas sueltas).
create table tareas_agenda (
  id           uuid primary key default gen_random_uuid(),
  comercial_id uuid not null references perfiles (id),
  titulo       text not null,
  fecha        date not null,
  hora         time,
  completada   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index ix_tareas_agenda on tareas_agenda (comercial_id, fecha);

alter table tareas_agenda enable row level security;
create policy tareas_propias on tareas_agenda for all to authenticated
  using (comercial_id = auth.uid()) with check (comercial_id = auth.uid());
create policy tareas_backoffice on tareas_agenda for select to authenticated
  using (es_backoffice());
