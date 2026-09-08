-- El CRM vive en Lima, la base cuenta en UTC.
--
-- QUÉ PASABA. La base corre con timezone UTC, así que `current_date` cambia de
-- día a las 19:00 de Lima. Entre las 7 de la noche y la medianoche —una hora
-- de trabajo real, sobre todo los lunes que se sale 19:00— el sistema creía
-- que ya era mañana. Comprobado el 07-09-2026 a las 22:03 de Lima:
--   now() en UTC ......... 2026-09-08 03:03
--   en Lima .............. 2026-09-07 22:03
--   current_date ......... 2026-09-08   ← un día adelantado
--
-- LO QUE ROMPÍA. Siete funciones lo usaban, y una es `registrar_venta`: una
-- venta cerrada a las ocho de la noche buscaba el informe de cierre con la
-- fecha de MAÑANA, y del lado del reporte esa venta cae en la semana que no
-- es. Las otras seis deciden si un equipo está en garantía, cuántos meses
-- lleva instalado, desde cuándo un cliente está en una cartera y desde cuándo
-- rige un precio. Todas se equivocaban por un día, todas las noches.
--
-- Lo detectó el informe de UX del 08-09 por el síntoma contrario («el 8 el
-- sistema marcaba el 7 como hoy»): el mismo error de zona horaria, visto a
-- otra hora.
--
-- Se agrega `hoy_lima()` y se parchan las definiciones VIVAS con reemplazo
-- verificado, sin copiar los cuerpos.

create or replace function public.hoy_lima()
returns date language sql stable as $function$
  select (now() at time zone 'America/Lima')::date;
$function$;

comment on function public.hoy_lima() is
  'El día de HOY en Lima. La base corre en UTC: current_date adelanta un día desde las 19:00 (0186).';

create or replace function public._parche_0186(p_funcion text, p_firma text)
returns void language plpgsql as $function$
declare v_def text; v_nueva text; v_veces integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_funcion
     and pg_get_function_identity_arguments(p.oid) = p_firma;

  if v_def is null then
    raise exception 'no existe %(%)', p_funcion, p_firma;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, 'current_date', ''))) / length('current_date');
  if v_veces = 0 then
    raise notice '%(%) ya no usa current_date', p_funcion, p_firma;
    return;
  end if;

  -- `hoy_lima()` no se reemplaza a sí misma ni se toca lo que ya está en Lima.
  v_nueva := replace(v_def, 'current_date', 'hoy_lima()');
  execute v_nueva;
  raise notice '%(%): % usos corregidos', p_funcion, p_firma, v_veces;
end $function$;

do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname <> 'hoy_lima' and p.proname <> '_parche_0186'
       and pg_get_functiondef(p.oid) like '%current_date%'
  loop
    perform public._parche_0186(r.proname, r.firma);
  end loop;
end $$;

drop function public._parche_0186(text, text);
