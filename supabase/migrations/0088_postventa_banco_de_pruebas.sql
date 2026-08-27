-- ============================================================
-- CRM EFAMEINSA · Migración 0088 · Un banco de pruebas de verdad para postventa
-- ============================================================
-- Darwin, 27-08: «estos datos de esta cuenta no deben ser iguales a la otra
-- cuenta, deben tener puros casos de prueba no reales… en todos ellos debe
-- haber sintéticos para ver la funcionalidad completa».
--
-- EL PROBLEMA QUE ARREGLA. La 0072 marcó el PERFIL con `es_prueba` y con eso
-- alcanzaba para el trabajo comercial, porque una oportunidad y un cliente
-- tienen dueño: la RLS por `comercial_id` ya los separa. Las tablas de
-- postventa no funcionan así — `servicios_postventa`, `equipos_instalados`,
-- `soporte_tecnico` e `informes_servicio` son del ÁREA, no de una persona, y
-- las ve completas cualquiera con el perfil marcado. O sea que hasta hoy la
-- cuenta de práctica veía los 106 despachos reales y, peor, sus botones
-- escribían sobre ellos.
--
-- LA REGLA, EN UNA LÍNEA: `es_prueba = es_cuenta_prueba()`. Una cuenta de
-- práctica ve exactamente lo sintético y nada más; todos los demás ven
-- exactamente lo real y nada más. No es un filtro de pantalla que alguien
-- pueda olvidar de poner en la próxima consulta: está en la política, así que
-- vale para toda consulta que se escriba de acá en adelante.
--
-- Y ES SIMÉTRICO A PROPÓSITO. Podría haberse dejado que la cuenta de práctica
-- viera «lo real y además lo suyo», que suena más cómodo, pero entonces seguiría
-- pudiendo marcar como despachado el pedido de un cliente de verdad. La
-- separación completa es lo único que hace que practicar sea inofensivo.

-- ------------------------------------------------------------
-- 1. La marca, en las cinco tablas que comparte el área
-- ------------------------------------------------------------
alter table servicios_postventa add column if not exists es_prueba boolean not null default false;
alter table soporte_tecnico     add column if not exists es_prueba boolean not null default false;
alter table equipos_instalados  add column if not exists es_prueba boolean not null default false;
alter table informes_servicio   add column if not exists es_prueba boolean not null default false;
alter table informes_cierre     add column if not exists es_prueba boolean not null default false;

comment on column servicios_postventa.es_prueba is
  'Fila sintética del banco de pruebas. Solo la ven las cuentas marcadas es_prueba; nunca aparece en la agenda real (migración 0088).';

create index if not exists ix_servicios_pv_reales on servicios_postventa (completado) where not es_prueba;
create index if not exists ix_equipos_reales on equipos_instalados (garantia_hasta) where not es_prueba;

-- ------------------------------------------------------------
-- 2. Quién está practicando
-- ------------------------------------------------------------
create or replace function es_cuenta_prueba()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_prueba from perfiles where id = auth.uid()), false)
$$;

comment on function es_cuenta_prueba is
  'true si quien consulta entró con una cuenta de práctica. Divide en dos mundos lo que el área comparte (migración 0088).';

-- ------------------------------------------------------------
-- 3. Las políticas, reescritas con la regla
-- ------------------------------------------------------------
-- Postventa y backoffice trabajan su mundo; Central lee el suyo. La condición
-- `es_prueba = es_cuenta_prueba()` se repite en todas porque es la que separa,
-- y dejarla afuera de una sola bastaría para que se filtre.

drop policy if exists servicios_pv_trabajo on servicios_postventa;
create policy servicios_pv_trabajo on servicios_postventa for all to authenticated
  using ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba())
  with check ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba());

drop policy if exists servicios_pv_central on servicios_postventa;
create policy servicios_pv_central on servicios_postventa for select to authenticated
  using (rol_actual() = 'central' and es_prueba = es_cuenta_prueba());

drop policy if exists servicios_pv_central_escribe on servicios_postventa;
create policy servicios_pv_central_escribe on servicios_postventa for update to authenticated
  using (rol_actual() = 'central' and es_prueba = es_cuenta_prueba())
  with check (rol_actual() = 'central' and es_prueba = es_cuenta_prueba());

drop policy if exists servicios_pv_central_crea on servicios_postventa;
create policy servicios_pv_central_crea on servicios_postventa for insert to authenticated
  with check (rol_actual() = 'central' and es_prueba = es_cuenta_prueba());

drop policy if exists servicios_pv_comercial on servicios_postventa;
create policy servicios_pv_comercial on servicios_postventa for select to authenticated
  using (
    es_prueba = es_cuenta_prueba()
    and exists (select 1 from cuentas c
                where c.id = servicios_postventa.cuenta_id and c.comercial_id = (select auth.uid()))
  );

drop policy if exists soporte_trabajo on soporte_tecnico;
create policy soporte_trabajo on soporte_tecnico for all to authenticated
  using ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba())
  with check ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba());

drop policy if exists soporte_central on soporte_tecnico;
create policy soporte_central on soporte_tecnico for select to authenticated
  using (rol_actual() = 'central' and es_prueba = es_cuenta_prueba());

drop policy if exists equipos_trabajo on equipos_instalados;
create policy equipos_trabajo on equipos_instalados for all to authenticated
  using ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba())
  with check ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba());

drop policy if exists equipos_lectura on equipos_instalados;
create policy equipos_lectura on equipos_instalados for select to authenticated
  using (
    es_prueba = es_cuenta_prueba()
    and (rol_actual() = 'central'
         or exists (select 1 from cuentas c
                    where c.id = equipos_instalados.cuenta_id and c.comercial_id = (select auth.uid())))
  );

drop policy if exists informes_serv_trabajo on informes_servicio;
create policy informes_serv_trabajo on informes_servicio for all to authenticated
  using ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba())
  with check ((es_postventa() or es_backoffice()) and es_prueba = es_cuenta_prueba());

drop policy if exists informes_serv_lectura on informes_servicio;
create policy informes_serv_lectura on informes_servicio for select to authenticated
  using (
    es_prueba = es_cuenta_prueba()
    and (rol_actual() = 'central'
         or exists (select 1 from cuentas c
                    where c.id = informes_servicio.cuenta_id and c.comercial_id = (select auth.uid())))
  );

-- El informe de cierre: un cierre sintético no puede caer en la cola de Central.
drop policy if exists informes_lectura on informes_cierre;
create policy informes_lectura on informes_cierre for select to authenticated
  using (
    es_prueba = es_cuenta_prueba()
    and ((select es_backoffice())
         or (select rol_actual()) = 'central'
         or exists (select 1 from cuentas c
                    where c.id = informes_cierre.cuenta_id and c.comercial_id = (select auth.uid())))
  );

-- ------------------------------------------------------------
-- 4. Que la marca no se pueda poner sola por accidente
-- ------------------------------------------------------------
-- Un usuario real no puede crear filas de prueba ni «esconder» una fila real
-- marcándola: el `with check` de arriba ya lo impide, porque su
-- `es_cuenta_prueba()` es false. Este trigger cubre el otro lado — que una fila
-- sintética no pueda volverse real y aparecer en la agenda del área.
create or replace function fijar_marca_de_prueba()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'UPDATE' and old.es_prueba is distinct from new.es_prueba then
    raise exception 'La marca de prueba de una fila no se cambia: se borra la fila y se crea la otra';
  end if;
  return new;
end;
$fn$;

do $$
declare t text;
begin
  foreach t in array array['servicios_postventa','soporte_tecnico','equipos_instalados','informes_servicio','informes_cierre']
  loop
    execute format('drop trigger if exists trg_marca_prueba on %I', t);
    execute format('create trigger trg_marca_prueba before update on %I for each row execute function fijar_marca_de_prueba()', t);
  end loop;
end $$;
