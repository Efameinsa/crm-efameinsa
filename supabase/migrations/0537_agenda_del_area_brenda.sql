-- 0537 · LA AGENDA DE LAS TRES POSTVENTAS (Santos, 19-10: «Brenda debe tener
-- acceso a todo… que ella pueda ver la agenda de las tres postventa para que
-- vea todo»). El calendario del área ya le mostraba lo mismo que a Rubí y a
-- Ariana (pedidos, casos, atenciones, visitas, llamadas); lo único que no veía
-- eran los pendientes anotados y las tareas de cada una (`tareas_agenda`, 0028,
-- solo de su dueña). Con la marca los ve, rotulados con el código de quien los
-- anotó; solo leer: marcar o borrar sigue siendo de la dueña.
alter table public.perfiles
  add column if not exists ve_agenda_del_area boolean not null default false;

comment on column public.perfiles.ve_agenda_del_area is
  'Ve en /postventa/agenda las tareas y pendientes anotados de todas las postventas, no solo los suyos (solo lectura). 0537.';

create or replace function public.ve_agenda_del_area()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select ve_agenda_del_area from perfiles where id = auth.uid()), false);
$$;

drop policy if exists tareas_agenda_del_area on public.tareas_agenda;
create policy tareas_agenda_del_area on public.tareas_agenda for select to authenticated
  using (
    ve_agenda_del_area()
    and exists (select 1 from perfiles p where p.id = tareas_agenda.comercial_id and p.es_postventa and p.activo)
  );

grant execute on function public.ve_agenda_del_area() to authenticated;

update public.perfiles set ve_agenda_del_area = true where id = 'ed20331c-ab15-4268-be89-0136be34e58e'; -- Brenda (PV2)

