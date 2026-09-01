-- ============================================================
-- CRM EFAMEINSA · Migración 0146 · La atención con gestión ya está tomada
-- ============================================================
-- Reclamo de la señorita de postventa el 01-09, con Santos al lado: atendió
-- a NESSUS HOTELES PERU (llamó, mandó la cotización, registró dos gestiones
-- en el caso a las 10:19 y 10:20) y la atención seguía en «Sin atender
-- todavía» con el reloj corriendo. Ocho atenciones abiertas en «registro»,
-- cinco de ellas ya gestionadas, todas mostradas como si nadie las hubiera
-- mirado.
--
-- POR QUÉ. La atención (0131) tiene sus nueve etapas técnicas y su sello
-- `atendido_at` recién en la quinta («atención», cuando el técnico ejecuta).
-- La bandeja de Mi día listaba «etapa = registro» y el reloj corría hasta
-- `atendido_at`. Pero la primera respuesta del área no es una etapa del
-- circuito: es una gestión en el caso ligado (llamada, WhatsApp, cotización).
-- Es la misma lección de la 0131 para los CASOS: «un caso con gestión ya
-- está tomado» — el 31-08 Santos vio 26 casos «sin atender» de los que 20
-- tenían gestiones de toda la semana. A las atenciones les faltaba esa regla.
--
-- LO QUE CAMBIA. `atenciones.tomada_at` / `tomada_por`: la primera vez que
-- alguien del área hace algo con ella. Se fija sola:
--   · al registrar una actividad en el caso ligado (`oportunidad_id`);
--   · al avanzar la etapa más allá de «registro» sin gestión previa.
-- El reloj de respuesta se detiene en `tomada_at` (el tiempo de respuesta
-- del área es hasta la primera gestión, no hasta que el técnico ejecuta), la
-- bandeja «Sin atender todavía» la suelta, y Mi día muestra aparte las
-- atendidas del día para que se vea el registro. El circuito de nueve etapas
-- NO se mueve solo: qué le pasa al equipo lo decide la persona, no una
-- llamada.
--
-- Se rellena hacia atrás con la primera gestión posterior a la solicitud.
-- ============================================================

alter table atenciones
  add column if not exists tomada_at  timestamptz,
  add column if not exists tomada_por uuid references perfiles(id);

comment on column atenciones.tomada_at is
  'Primera vez que alguien del área hizo algo con la atención: una gestión en el caso ligado o un avance de etapa. Detiene el reloj de respuesta (migración 0146).';

-- ------------------------------------------------------------
-- 1. Una gestión en el caso ligado toma la atención
-- ------------------------------------------------------------
create or replace function marcar_atencion_tomada_por_gestion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.oportunidad_id is null then
    return new;
  end if;
  update atenciones a
     set tomada_at  = coalesce(new.realizada_at, now()),
         tomada_por = new.realizada_por
   where a.oportunidad_id = new.oportunidad_id
     and a.tomada_at is null
     and a.cerrado_at is null;
  return new;
end $$;

drop trigger if exists trg_actividad_toma_atencion on actividades;
create trigger trg_actividad_toma_atencion
  after insert on actividades
  for each row execute function marcar_atencion_tomada_por_gestion();

-- ------------------------------------------------------------
-- 2. Avanzar la etapa también la toma (si nadie había gestionado antes)
-- ------------------------------------------------------------
create or replace function marcar_atencion_tomada_por_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tomada_at is null
     and new.etapa is distinct from old.etapa
     and new.etapa not in ('solicitud', 'registro') then
    new.tomada_at  := now();
    new.tomada_por := coalesce(auth.uid(), new.asignado_a);
  end if;
  return new;
end $$;

drop trigger if exists trg_atencion_toma_por_etapa on atenciones;
create trigger trg_atencion_toma_por_etapa
  before update of etapa on atenciones
  for each row execute function marcar_atencion_tomada_por_etapa();

-- ------------------------------------------------------------
-- 3. Hacia atrás: la primera gestión posterior a la solicitud
-- ------------------------------------------------------------
update atenciones a
   set tomada_at  = g.primera,
       tomada_por = g.quien
  from (
    select a2.id as atencion_id, x.realizada_at as primera, x.realizada_por as quien
      from atenciones a2
      join lateral (
        select realizada_at, realizada_por
          from actividades
         where oportunidad_id = a2.oportunidad_id
           and realizada_at >= a2.solicitado_at - interval '1 hour'
         order by realizada_at
         limit 1
      ) x on true
     where a2.tomada_at is null and a2.oportunidad_id is not null
  ) g
 where g.atencion_id = a.id;

-- Las que ya avanzaron de etapa sin gestión registrada: el sello más viejo.
update atenciones
   set tomada_at = coalesce(diagnosticado_at, programada_at, atendido_at, pruebas_at, conformidad_at, cerrado_at),
       tomada_por = coalesce(tomada_por, asignado_a)
 where tomada_at is null
   and etapa not in ('solicitud', 'registro')
   and coalesce(diagnosticado_at, programada_at, atendido_at, pruebas_at, conformidad_at, cerrado_at) is not null;
