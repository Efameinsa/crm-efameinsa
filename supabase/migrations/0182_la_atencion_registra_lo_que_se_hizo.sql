-- ============================================================
-- CRM EFAMEINSA · Migración 0182 · La atención registra lo que se hizo
-- ============================================================
-- Segunda tanda del arreglo de postventa (viene de la 0181, del 07-09).
--
-- QUÉ FALTABA. De las nueve etapas del circuito, «atención» y «pruebas» eran
-- solo un botón de avance: se marcaban como hechas y no quedaba escrito nada.
-- El técnico iba, arreglaba, probaba… y el sistema solo sabía la fecha. Todo
-- lo que el manual pide registrar en ese momento —qué se hizo, qué repuesto se
-- usó, la lectura de ciclos, el resultado de las pruebas— seguía viviendo en
-- el WhatsApp del técnico y en el Excel personal del área.
--
-- Los CICLOS importan especialmente: son «el kilometraje de la máquina» (un
-- ciclo ≈ una hora de uso), lo que dice si un equipo de dos años está gastado
-- como uno de cinco. El parque instalado ya tenía dónde guardarlos
-- (ciclos_ultimo) y nada los escribía: 314 máquinas, ninguna con lectura.
--
-- POR QUÉ EN LA ATENCIÓN Y NO EN UN FORMULARIO APARTE. Porque es el momento en
-- que se sabe. Pedirlo después es pedirlo de memoria, y de memoria no se
-- escribe el número de ciclos: se escribe «estaba bien».
-- ============================================================

alter table public.atenciones
  add column if not exists trabajo_realizado text,
  add column if not exists repuestos_usados  text,
  add column if not exists ciclos            integer,
  add column if not exists pruebas_detalle   text,
  add column if not exists pruebas_conforme  boolean;

comment on column public.atenciones.trabajo_realizado is
  'Qué hizo el técnico en el cliente. Se escribe en la etapa «atención», que hasta la 0182 era un botón sin formulario.';
comment on column public.atenciones.ciclos is
  'Lectura del contador de la máquina al atenderla — «el kilometraje» (Carlos, 27-08). Al guardarla se copia al parque instalado, que es donde se compara contra la lectura anterior.';
comment on column public.atenciones.pruebas_conforme is
  'Si la máquina pasó las pruebas después de la intervención. En false la atención NO avanza a conformidad: no se le pide firmar al cliente algo que no quedó bien.';

-- ------------------------------------------------------------
-- Los ciclos suben al parque instalado
-- ------------------------------------------------------------
-- La lectura se toma en la atención pero se compara en la máquina: es ahí
-- donde sirve para decir «este equipo se usa el doble que el promedio». Se
-- copia con trigger y no desde el servidor de la aplicación para que valga
-- también cuando la lectura entre por cualquier otro camino.
create or replace function public.subir_ciclos_al_parque()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.ciclos is not null
     and new.equipo_id is not null
     and new.ciclos is distinct from old.ciclos then
    update equipos_instalados
       set ciclos_ultimo = new.ciclos,
           ciclos_ultimo_at = now(),
           -- La primera lectura de una máquina es también su lectura inicial:
           -- sin eso, el primer «cuánto se usó» no tiene contra qué restarse.
           ciclos_inicial = coalesce(ciclos_inicial, new.ciclos)
     where id = new.equipo_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_atencion_ciclos on public.atenciones;
create trigger trg_atencion_ciclos
  after update of ciclos on public.atenciones
  for each row execute function public.subir_ciclos_al_parque();

comment on function public.subir_ciclos_al_parque is
  'Copia al parque instalado la lectura de ciclos que tomó el técnico en la atención (0182).';
