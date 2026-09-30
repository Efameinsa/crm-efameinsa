-- El PIN del supervisor cambia EN CUANTO SE USA (Santos, 30-09-2026).
--
-- POR QUÉ: el código dependía solo del tramo de 10 minutos, y la base impedía
-- usarlo dos veces en el mismo tramo (índice `pin_de_un_solo_uso`). Gabriela
-- usó el PIN de Lesly para una corrección, necesitó otra, y Lesly no podía
-- darle uno nuevo: su pantalla seguía mostrando el mismo número, ya gastado,
-- hasta que venciera el tramo. «Su reloj debería recargarse cada vez que se usa».
--
-- AHORA: el código depende del tramo Y de cuántas autorizaciones lleva ese
-- supervisor. Usarlo lo cambia al instante —el viejo deja de valer— y la
-- pantalla de Lesly muestra el nuevo. Sin usos nuevos, el código es idéntico
-- al de antes (el sufijo solo aparece desde el primer uso registrado).
--
-- EL USO ÚNICO SE SIGUE CUIDANDO: cada autorización lleva su número de uso
-- (`uso`) y el par (supervisor, uso) es único. Si dos personas teclean el
-- mismo código en el mismo segundo, las dos transacciones calculan el mismo
-- `uso` y la segunda choca con `unique_violation`, que las siete funciones que
-- gastan el PIN ya traducen a «Ese código ya se usó».

-- 1. El número de uso de cada autorización.
alter table autorizaciones_supervisor add column if not exists uso integer;

update autorizaciones_supervisor a
   set uso = n.rn - 1
  from (select id, row_number() over (partition by supervisor_id order by creado_at, id) as rn
          from autorizaciones_supervisor) n
 where n.id = a.id and a.uso is null;

create or replace function pin_usos_supervisor(p_supervisor uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from autorizaciones_supervisor where supervisor_id = p_supervisor;
$$;
revoke all on function pin_usos_supervisor(uuid) from public;

create or replace function autorizacion_numera_uso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supervisor_id is not null then
    new.uso := pin_usos_supervisor(new.supervisor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_autorizacion_numera_uso on autorizaciones_supervisor;
create trigger trg_autorizacion_numera_uso
  before insert on autorizaciones_supervisor
  for each row execute function autorizacion_numera_uso();

-- 2. El uso único pasa de «uno por tramo» a «uno por número de uso».
alter table autorizaciones_supervisor drop constraint if exists pin_de_un_solo_uso;
drop index if exists pin_de_un_solo_uso;
create unique index if not exists pin_un_uso_por_numero on autorizaciones_supervisor (supervisor_id, uso);

-- 3. El código: mismo cálculo de siempre, más el número de usos.
create or replace function codigo_pin_supervisor_uso(p_supervisor uuid, p_ventana bigint, p_uso integer)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select substr(
           regexp_replace(
             md5(c.valor || p_supervisor::text || '|' || p_ventana::text
                 || case when p_uso > 0 then '#' || p_uso::text else '' end),
             '[^0-9]', '', 'g') || '0000',
           1, 4)
    from config_seguridad c
   where c.clave = 'semilla_pin_supervisor';
$$;
revoke all on function codigo_pin_supervisor_uso(uuid, bigint, integer) from public;

-- Las siete funciones que validan llaman a esta: al cambiarla, todas pasan a
-- aceptar solo el código vigente (el del último uso).
create or replace function codigo_pin_supervisor(p_supervisor uuid, p_ventana bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select codigo_pin_supervisor_uso(p_supervisor, p_ventana, pin_usos_supervisor(p_supervisor));
$$;

-- 4. Si alguien teclea el código recién gastado, se le dice eso —y no «no es
--    válido»—, para que sepa que tiene que pedir el nuevo.
do $$
declare
  v text;
  viejo constant text := $x$  insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
  raise exception 'El código no es válido o ya venció. Pídale uno nuevo a gerencia o a operaciones.';$x$;
  nuevo constant text := $x$  -- 0343: ¿es el código que se acaba de gastar?
  for v_sup in
    select p.id, p.nombre from perfiles p
     where p.activo
       and (p.rol::text in ('gerencia', 'admin')
            or (p_ambito in ('operaciones', 'derivacion')
                and (p.rol::text = 'operaciones' or p.es_operaciones)))
       and pin_usos_supervisor(p.id) > 0
  loop
    if v_pin = codigo_pin_supervisor_uso(v_sup.id, v_ventana, pin_usos_supervisor(v_sup.id) - 1)
       or v_pin = codigo_pin_supervisor_uso(v_sup.id, v_ventana - 1, pin_usos_supervisor(v_sup.id) - 1) then
      raise exception 'Ese código ya se usó. El PIN de % ya cambió: pídale el nuevo.', v_sup.nombre;
    end if;
  end loop;

  insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
  raise exception 'El código no es válido o ya venció. Pídale uno nuevo a gerencia o a operaciones.';$x$;
begin
  select pg_get_functiondef('public.validar_codigo_autorizacion(text,text)'::regprocedure) into v;
  if position('0343:' in v) = 0 then
    if position(viejo in v) = 0 then
      raise exception 'validar_codigo_autorizacion: no se encontró el final donde avisar del código gastado';
    end if;
    execute replace(v, viejo, nuevo);
  end if;
end $$;

-- 5. Mismo dueño que las funciones que las llaman. En la base local (VM) la
--    migración corre como supabase_admin: las nuevas quedaban suyas y
--    `mi_pin_supervisor` (de postgres) respondía «permission denied for
--    function codigo_pin_supervisor_uso» a Lesly (30-09).
alter function codigo_pin_supervisor_uso(uuid, bigint, integer) owner to postgres;
alter function pin_usos_supervisor(uuid) owner to postgres;
alter function autorizacion_numera_uso() owner to postgres;
