-- 17-09-2026: Brenda pidió autorización, Santos le dio el código de Lesly y
-- «nada corrige». Revisando las puertas con código: todas las nuevas pasan por
-- validar_codigo_autorizacion (0107+), que acepta a gerencia y a operaciones;
-- pero validar_pin_supervisor (0093) —la que usan asignar_lead_con_pin y el
-- borrado de cotizaciones de postventa— solo aceptaba gerencia y admin. Un
-- mismo código valía en una pantalla y no en la de al lado. Desde acá la
-- vieja delega en la nueva con el ámbito «derivacion», que es lo que decidió
-- Carlos: Lesly autoriza.
create or replace function public.validar_pin_supervisor(p_pin text)
returns uuid
language sql
security definer
set search_path to 'public'
as $$
  select validar_codigo_autorizacion(p_pin, 'derivacion');
$$;
