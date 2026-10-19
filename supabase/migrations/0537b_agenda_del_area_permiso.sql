-- 0537b · La función de 0537 nació sin permiso para `authenticated` y la
-- política la llama en toda lectura de tareas_agenda: nadie podía leer sus tareas.
grant execute on function public.ve_agenda_del_area() to authenticated;
