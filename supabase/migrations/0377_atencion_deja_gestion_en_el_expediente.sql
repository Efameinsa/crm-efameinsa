-- 0377 — LO QUE SE HACE EN LA ATENCIÓN QUEDA COMO GESTIÓN EN EL EXPEDIENTE
--
-- Reunión de postventa del 02-10 12:25 (Carlos con Rubí y Gabriela). Rubí
-- atendió a RODRIGUEZ ALVAREZ GILBERTO (Hotel Santa Lucila): tomó la atención,
-- escribió el diagnóstico y la cerró como «resuelto» con su motivo. Nada de eso
-- aparecía en la ficha del cliente: el diagnóstico, el trabajo, el cierre y el
-- seguimiento vivían SOLO en columnas de `atenciones`, y el historial de la
-- ficha y del expediente se arma con `actividades`. «Si hay cinco problemas
-- técnicos del cliente no vas a estar abriendo uno por uno: todo está en la
-- principal».
--
-- Ahora cada paso que una persona deja escrito en la atención entra también
-- como gestión (`nota`) en el expediente de la atención, a nombre de quien lo
-- hizo y a la hora en que lo hizo. `nota` es de los tipos internos: no cuenta
-- como contacto con el cliente en supervisión (0090), igual que antes.
--
-- Sin auth.uid() (scripts, sincronizador) no se anota nada: la gestión es lo
-- que hizo una persona que atiende.

create or replace function public.atencion_deja_gestion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien uuid := auth.uid();
  v_tipo text := replace(new.tipo::text, '_', ' ');
  v_notas text[] := '{}';
  v_nota text;
begin
  if v_quien is null or new.oportunidad_id is null then return new; end if;

  if coalesce(new.diagnostico, '') <> '' and new.diagnostico is distinct from old.diagnostico then
    v_notas := v_notas || format('[Atención %s] Diagnóstico: %s', v_tipo, new.diagnostico);
  end if;
  if coalesce(new.trabajo_realizado, '') <> '' and new.trabajo_realizado is distinct from old.trabajo_realizado then
    v_notas := v_notas || format('[Atención %s] Trabajo realizado: %s', v_tipo, new.trabajo_realizado);
  end if;
  if coalesce(new.pruebas_detalle, '') <> '' and new.pruebas_detalle is distinct from old.pruebas_detalle then
    v_notas := v_notas || format('[Atención %s] Pruebas: %s', v_tipo, new.pruebas_detalle);
  end if;
  if new.cerrado_at is not null and old.cerrado_at is null then
    v_notas := v_notas || format('[Atención %s] Cerrada (%s): %s', v_tipo,
      case new.resultado::text when 'resuelto' then 'resuelto' when 'no_procede' then 'no procede'
        when 'derivado' then 'derivado' else 'sin resultado' end,
      coalesce(nullif(new.motivo_cierre, ''), 'sin motivo escrito'));
  end if;
  if new.etapa::text = 'seguimiento' and old.etapa::text <> 'seguimiento' then
    v_notas := v_notas || format('[Atención %s] Pasa a seguimiento. Queda pendiente: %s', v_tipo,
      coalesce(nullif(new.seguimiento_nota, ''), 'no se anotó'));
  elsif old.etapa::text = 'seguimiento' and new.etapa::text <> 'seguimiento' then
    v_notas := v_notas || format('[Atención %s] Seguimiento terminado: %s', v_tipo,
      coalesce(nullif(new.seguimiento_nota, ''), 'sin nota'));
  end if;

  foreach v_nota in array v_notas loop
    insert into actividades (oportunidad_id, tipo, nota, realizada_por)
    values (new.oportunidad_id, 'nota', v_nota, v_quien);
  end loop;
  return new;
end $$;

drop trigger if exists zx_atencion_deja_gestion on public.atenciones;
create trigger zx_atencion_deja_gestion
  after update on public.atenciones
  for each row execute function public.atencion_deja_gestion();

-- Lo ya cerrado desde el 25-09 (una semana) entra con su fecha real y a nombre
-- de quien la tomó, para que el caso de Gilberto y los de estos días se vean
-- en la ficha. Más atrás no: notas viejas con fecha vieja no aportan y
-- moverían expedientes del área.
insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
select a.oportunidad_id, 'nota',
       format('[Atención %s] Cerrada (%s): %s', replace(a.tipo::text, '_', ' '),
         case a.resultado::text when 'no_procede' then 'no procede' else coalesce(a.resultado::text, 'sin resultado') end,
         coalesce(nullif(a.motivo_cierre, ''), 'sin motivo escrito')),
       coalesce(a.tomada_por, a.asignado_a), a.cerrado_at
  from atenciones a
 where a.cerrado_at >= '2026-09-25'
   and a.oportunidad_id is not null
   and coalesce(a.tomada_por, a.asignado_a) is not null
   and not exists (select 1 from actividades x
                    where x.oportunidad_id = a.oportunidad_id
                      and x.nota like '[Atención %] Cerrada%');

-- Y el diagnóstico de esos mismos días: ahí queda lo que se habló con el
-- cliente (en el caso de Gilberto, la llamada entera).
insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
select a.oportunidad_id, 'nota',
       format('[Atención %s] Diagnóstico: %s', replace(a.tipo::text, '_', ' '), a.diagnostico),
       coalesce(a.tomada_por, a.asignado_a), a.diagnosticado_at
  from atenciones a
 where a.diagnosticado_at >= '2026-09-25'
   and coalesce(a.diagnostico, '') <> ''
   and a.oportunidad_id is not null
   and coalesce(a.tomada_por, a.asignado_a) is not null
   and not exists (select 1 from actividades x
                    where x.oportunidad_id = a.oportunidad_id
                      and x.nota like '[Atención %] Diagnóstico%');

insert into _migraciones_aplicadas (archivo) values ('0377_atencion_deja_gestion_en_el_expediente.sql')
on conflict do nothing;
