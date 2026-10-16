-- 16-10-2026, Rubí (buzón, «Caso»): «cuando son más de un equipo debe tener
-- más opciones de "repuestos usados", "ciclos" y "qué se hizo en el cliente"
-- para registrar cada equipo».
--
-- Un caso ya podía llevar varias máquinas (0253): la principal en
-- atenciones.equipo_id y las demás en atencion_equipos. Pero el paso «Qué se
-- hizo en el cliente» (0182) tenía un solo trabajo, un solo repuesto y una
-- sola lectura de ciclos, y esa lectura subía solo a la principal: las otras
-- máquinas del caso se quedaban sin lo que se les hizo ni su contador.
--
-- Lo de cada máquina adicional se guarda en su fila de atencion_equipos y sus
-- ciclos suben a su ficha igual que los de la principal (mismo criterio que el
-- trigger de la 0182: primera lectura = lectura inicial).

alter table public.atencion_equipos
  add column if not exists trabajo_realizado text,
  add column if not exists repuestos_usados  text,
  add column if not exists ciclos            integer;

comment on column public.atencion_equipos.trabajo_realizado is
  'Qué se hizo en el cliente a ESTA máquina del caso (0509). La principal lo lleva en atenciones.trabajo_realizado.';
comment on column public.atencion_equipos.repuestos_usados is
  'Repuestos usados en ESTA máquina del caso (0509).';
comment on column public.atencion_equipos.ciclos is
  'Lectura del contador de ESTA máquina en la visita (0509); sube sola a equipos_instalados.';

create or replace function public.subir_ciclos_adicional_al_parque()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.ciclos is not null
     and (tg_op = 'INSERT' or new.ciclos is distinct from old.ciclos) then
    update equipos_instalados
       set ciclos_ultimo = new.ciclos,
           ciclos_ultimo_at = now(),
           ciclos_inicial = coalesce(ciclos_inicial, new.ciclos)
     where id = new.equipo_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_atencion_equipo_ciclos on public.atencion_equipos;
create trigger trg_atencion_equipo_ciclos
  after insert or update of ciclos on public.atencion_equipos
  for each row execute function public.subir_ciclos_adicional_al_parque();

comment on function public.subir_ciclos_adicional_al_parque is
  'Copia a la ficha de la máquina la lectura de ciclos que tomó el técnico para una máquina adicional del caso (0509).';
