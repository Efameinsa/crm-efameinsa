-- ============================================================
-- CRM EFAMEINSA · Migración 0177 · El cierre semanal pide plan y necesidades
-- ============================================================
-- Carlos, 05-09: «verifiquemos el tema del cierre semanal que coordinamos
-- durante la semana, respecto a que debe considerarse detallar su
-- planificación y necesidades».
--
-- Lo coordinado es de la reunión del 02-09 (11:47), y son dos campos, los dos
-- OBLIGATORIOS, con sus palabras:
--
--   EL COMPROMISO. «Que tenga un campo obligatorio para que redactes cuál es
--   tu plan para la siguiente semana. No me hables de que vas a llamar a 10
--   clientes el lunes, 10 el martes, porque ya está mapeado, está el
--   calendario semanal. No me hables de cuánto vas a vender el lunes, el
--   martes, porque también ya sale automático. Háblame de QUÉ ES LO QUE VAS A
--   HACER TÚ PARA PODER MEJORAR EN TUS VENTAS.»
--
--   LA NECESIDAD. «Es decir, la pregunta del millón: ¿qué necesitas para
--   mejorar tus ventas? ¿Una computadora? ¿Está lenta? Ok, tu computadora.
--   ¿Qué necesitas? No, quiero un teclado. Ok, toma un teclado. ¿Qué
--   necesitas? Necesito capacitación. ¿En qué? Necesito que me capaciten en
--   tal máquina. Perfecto, te vamos a capacitar.»
--
-- Y dónde va: «me sale mi reporte de mi semanal (…) y abajo, o si quieres
-- arriba, donde sea visual: en qué te estás comprometiendo, qué necesitas y
-- qué te compromete para la siguiente semana».
--
-- POR QUÉ UNA TABLA Y NO UN CAMPO SUELTO. «También debería haber un histórico
-- de todos sus cierres.» Una declaración por comercial y por semana, guardada,
-- es lo que permite el lunes preguntar «¿esto que dijiste la semana pasada,
-- lo hiciste?» — que es todo el sentido del ejercicio.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, y queda de la misma reunión: el gráfico de
-- los rechazados de la semana por motivo, el velocímetro de ventas del mes en
-- «Mi gestión», y que el botón aparezca el sábado 11:55. Se anotan para no
-- perderlos.
-- ============================================================

create table if not exists public.declaraciones_semana (
  id             uuid primary key default gen_random_uuid(),
  comercial_id   uuid not null references perfiles (id) on delete cascade,
  -- El lunes de la semana que se está cerrando. Una declaración por semana.
  lunes          date not null,
  -- «Qué es lo que vas a hacer TÚ para mejorar en tus ventas.»
  compromiso     text not null,
  -- «La pregunta del millón: ¿qué necesitas?» Puede no necesitar nada, y eso
  -- también es una respuesta: por eso admite nulo y hay una casilla aparte.
  necesidades    text,
  sin_necesidades boolean not null default false,
  declarado_at   timestamptz not null default now(),
  actualizado_at timestamptz,
  es_prueba      boolean not null default es_cuenta_prueba(),
  constraint declaraciones_semana_unica unique (comercial_id, lunes),
  -- Un compromiso de tres palabras no es un compromiso.
  constraint compromiso_con_contenido check (length(btrim(compromiso)) >= 15),
  -- O dice qué necesita, o declara que no necesita nada. Las dos cosas no.
  constraint necesidad_o_nada check (
    (sin_necesidades and necesidades is null)
    or (not sin_necesidades and length(btrim(coalesce(necesidades, ''))) >= 5)
  )
);

comment on table public.declaraciones_semana is
  'Lo que cada comercial se compromete a hacer la semana siguiente y lo que necesita para lograrlo. Obligatorio al cerrar la semana (Carlos, 02-09 y 05-09).';
comment on column public.declaraciones_semana.compromiso is
  'Qué va a hacer para mejorar sus ventas. NO el calendario ni el monto: eso ya sale solo.';
comment on column public.declaraciones_semana.necesidades is
  'Qué necesita de la empresa: equipo, capacitación, material. Es lo que gerencia resuelve el lunes.';

create index if not exists declaraciones_semana_idx
  on public.declaraciones_semana (lunes desc, comercial_id);

alter table public.declaraciones_semana enable row level security;

-- Cada quien escribe la suya y ve su historial; gerencia las ve todas, que es
-- para lo que existen.
drop policy if exists declaraciones_lectura on public.declaraciones_semana;
create policy declaraciones_lectura on public.declaraciones_semana
  for select to authenticated
  using (
    (es_backoffice() or es_operaciones() or comercial_id = (select auth.uid()))
    and es_prueba = es_cuenta_prueba()
  );

drop policy if exists declaraciones_escritura on public.declaraciones_semana;
create policy declaraciones_escritura on public.declaraciones_semana
  for insert to authenticated
  with check (comercial_id = (select auth.uid()));

-- Se puede corregir la propia declaración de la semana en curso: el sábado a
-- las 12 nadie escribe bien a la primera. La de semanas pasadas queda como
-- quedó — es el registro contra el que se pregunta el lunes.
drop policy if exists declaraciones_correccion on public.declaraciones_semana;
create policy declaraciones_correccion on public.declaraciones_semana
  for update to authenticated
  using (comercial_id = (select auth.uid()) and lunes >= (now() at time zone 'America/Lima')::date - 7)
  with check (comercial_id = (select auth.uid()));
