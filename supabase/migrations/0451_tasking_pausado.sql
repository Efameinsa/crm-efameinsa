-- Tasking: estado «pausado» (Santos 13-10). Un compromiso en pausa no entra en
-- recordatorios, avisos de vencido, agenda diaria ni reportes a gerencia, porque
-- todos esos caminos leen solo 'pendiente' y 'en_curso'.
alter table public.tasking_compromisos drop constraint if exists tasking_compromisos_estado_check;
alter table public.tasking_compromisos add constraint tasking_compromisos_estado_check
  check (estado in ('pendiente', 'en_curso', 'hecho', 'anulado', 'pausado'));
