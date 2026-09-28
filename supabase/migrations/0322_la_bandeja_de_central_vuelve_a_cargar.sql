-- LA BANDEJA DE CENTRAL SE QUEDÓ VACÍA (28-09, 15:31). Central registró dos
-- llamadas y «no aparece en el CRM en la bandeja»: se guardaban, pero la
-- política `leads_ve_quien_trabaja_su_expediente` (0317) llamaba a una función
-- con consulta por CADA fila de `leads`, y como las políticas se suman con OR
-- la base la evaluaba también para Central: la consulta de la bandeja pasó de
-- medio segundo a más de 20 y se cortaba. La política se quitó a las 15:40.
--
-- Se vuelve a abrir lo que pidió la reunión —que toda el área de postventa vea
-- la solicitud del cliente en sus expedientes— de forma que no pese:
--   · solo para postventa y operaciones, y esa pregunta se hace UNA vez por
--     consulta (`(select …)`), así para Central y los comerciales no cuesta nada;
--   · la lista de contactos de expedientes de postventa sale de una función que
--     se ejecuta una vez y se compara por hash, no fila por fila.
-- (La parte «el dueño actual del expediente ve su contacto» de la 0317 no se
-- repone: era la que más pesaba y no la pidió la reunión.)

drop policy if exists leads_ve_quien_trabaja_su_expediente on leads;
drop function if exists lead_visible_por_su_expediente(uuid, uuid);

create or replace function leads_de_expedientes_postventa()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.lead_id from oportunidades o where o.tipo_postventa is not null and o.lead_id is not null
  union
  select l.id from leads l join oportunidades o on o.id = l.oportunidad_id where o.tipo_postventa is not null
$$;

create policy leads_postventa_ve_la_solicitud on leads
  for select
  using (
    (select coalesce(puede_postventa(), false) or coalesce(es_operaciones(), false))
    and id in (select leads_de_expedientes_postventa())
  );
