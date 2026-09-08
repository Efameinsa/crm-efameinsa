-- «Preventivo al día» decía otra cosa de la que mostraba.
--
-- QUÉ PASABA. La ficha de la atención mostraba «Preventivo al día · 2024-09-06»
-- —un mantenimiento de hace DOS AÑOS declarado al día— porque el dato que
-- usaba, `hizo_preventivo`, significa «alguna vez le hicieron uno», no «está
-- al día». Lo encontró el informe de UX del 08-09.
--
-- POR QUÉ IMPORTA. Es justo al revés de lo que el área necesita: una máquina
-- con el preventivo vencido es una venta que hay que ofrecer, y la ficha la
-- estaba declarando en orden. El error escondía trabajo, no lo inventaba.
--
-- La función ya devolvía `proximo_mantenimiento` y nadie lo miraba. Se agrega
-- el estado ya calculado —en la base y no en cada pantalla, para que todas
-- digan lo mismo— con tres respuestas posibles y ninguna ambigua:
--
--   'nunca'    · no tiene ningún mantenimiento registrado
--   'vencido'  · la fecha del próximo ya pasó
--   'al_dia'   · tiene próximo y todavía no llega
--   'sin_plan' · le hicieron alguno pero nadie fijó el siguiente
--
-- El cuarto existe porque es real y era el que se disfrazaba de «al día»: hay
-- máquinas con un mantenimiento viejo y sin próxima fecha. Decir «no sabemos»
-- es más útil que decir una fecha vieja con cara de orden.

create or replace function public._parche_0187()
returns void language plpgsql as $function$
declare v_def text; v_buscar text; v_poner text; v_veces integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'garantia_del_equipo';

  if v_def is null then raise exception 'no existe garantia_del_equipo'; end if;
  if position('preventivo_estado' in v_def) > 0 then
    raise notice 'garantia_del_equipo ya estaba parchada';
    return;
  end if;

  v_buscar := '''hizo_preventivo'',  e.ultimo_mantenimiento is not null,';
  v_poner  := '''hizo_preventivo'',  e.ultimo_mantenimiento is not null,'
           || ' ''preventivo_estado'', case'
           || '   when e.ultimo_mantenimiento is null then ''nunca'''
           || '   when e.proximo_mantenimiento is null then ''sin_plan'''
           || '   when e.proximo_mantenimiento < hoy_lima() then ''vencido'''
           || '   else ''al_dia'' end,';

  v_veces := (length(v_def) - length(replace(v_def, v_buscar, ''))) / length(v_buscar);
  if v_veces <> 1 then
    raise exception 'el trozo aparece % veces, se esperaba 1', v_veces;
  end if;

  execute replace(v_def, v_buscar, v_poner);
end $function$;

select public._parche_0187();
drop function public._parche_0187();
