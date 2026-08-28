-- ============================================================
-- CRM EFAMEINSA · Migración 0114 · Lesly autoriza operaciones
-- ============================================================
-- Reunión con gerencia del 28-08. El ing. Carlos pidió un «administrador de
-- autorizaciones en la parte operativa», y dijo para qué:
--
--   «Mañana no estás, estás en otro proyecto, nadie toca, Lesly se encarga, le
--    cedemos la posta a Lesly. Cualquier autorización, ella tiene que ingresar
--    para dar autorización.»
--
-- El circuito que él describió ya existe casi entero: «Central le dirá, oye
-- Lesly, necesito anular esto. Código, anula. Y ya está». Central ejecuta —eso
-- se hizo en la 0113— y el supervisor dicta el código. Lo único que faltaba es
-- que Lesly PUEDA DICTARLO: hoy el código lo genera solo `gerencia` y `admin`,
-- así que sin gerencia conectada no se autoriza nada, que es exactamente el
-- problema que Carlos quiere evitar.
--
-- POR QUÉ UNA MARCA Y NO UN ROL NUEVO. Un rol nuevo obligaría a repasar las
-- políticas de las treinta y pico de tablas, y cada política que se olvide es
-- una pantalla que se rompe o —peor— que muestra de más. La marca es aditiva:
-- Lesly sigue siendo lo que era y se le suma una facultad.
--
-- Y ES UN CÓDIGO CON ALCANCE. El de gerencia sirve para todo, incluido mover la
-- cartera de un comercial a otro (0107), que es plata de alguien. El de Lesly
-- sirve para el ÁMBITO OPERATIVO: anular un cierre equivocado. Si mañana se
-- decide que también traspase cartera, se agrega el ámbito acá y se ve escrito
-- quién puede qué; hoy nadie reparte ese permiso sin querer.

alter table perfiles add column if not exists es_operaciones boolean not null default false;

comment on column perfiles.es_operaciones is
  'Administrador de operaciones: puede DICTAR el código que autoriza correcciones operativas (anular un cierre). No ejecuta: ejecuta Central. Reunión 28-08.';

create or replace function es_operaciones()
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((select es_operaciones from perfiles where id = auth.uid() and activo), false);
$fn$;

revoke all on function es_operaciones() from public;
grant execute on function es_operaciones() to authenticated;

-- ------------------------------------------------------------
-- El código en la pantalla de quien lo dicta. Misma cuenta regresiva y mismo
-- secreto que el de gerencia (0093 y 0110): lo que cambia es quién puede pedirlo.
create or replace function mi_pin_supervisor()
returns table (codigo text, expira_en integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_rol text;
begin
  select p.rol::text into v_rol from perfiles p where p.id = auth.uid() and p.activo;
  if (v_rol is null or v_rol not in ('gerencia', 'admin')) and not es_operaciones() then
    raise exception 'Solo gerencia o el administrador de operaciones puede autorizar';
  end if;

  return query
    select codigo_pin_supervisor(auth.uid(), ventana_pin_actual()),
           (600 - (floor(extract(epoch from now()))::bigint % 600))::integer;
end $$;

revoke all on function mi_pin_supervisor() from public;
grant execute on function mi_pin_supervisor() to authenticated;

-- ------------------------------------------------------------
-- La validación con ámbito. Repite la forma de `validar_pin_supervisor` (0107)
-- —mismo antirrebote de cinco intentos, misma ventana y la anterior— y le suma
-- lo único que cambia: a quién le acepta el código según para qué se pide.
--
-- `validar_pin_supervisor` se queda intacta y sigue siendo la de gerencia: la
-- cartera no cambió de manos con esta migración.
create or replace function validar_codigo_autorizacion(p_pin text, p_ambito text)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_solicitante uuid := auth.uid();
  v_ventana bigint := ventana_pin_actual();
  v_pin text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  v_fallidos integer;
  v_sup record;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  select count(*) into v_fallidos
    from intentos_pin_supervisor
   where solicitante_id = v_solicitante and creado_at > now() - interval '10 minutes';
  if v_fallidos >= 5 then
    raise exception 'Demasiados códigos incorrectos. Espere unos minutos y pida uno nuevo.';
  end if;

  if length(v_pin) <> 4 then
    insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
    raise exception 'El código de autorización son cuatro dígitos.';
  end if;

  for v_sup in
    select p.id from perfiles p
     where p.activo
       and (p.rol::text in ('gerencia', 'admin')
            or (p_ambito = 'operaciones' and p.es_operaciones))
  loop
    if v_pin = codigo_pin_supervisor(v_sup.id, v_ventana)
       or v_pin = codigo_pin_supervisor(v_sup.id, v_ventana - 1) then
      return v_sup.id;
    end if;
  end loop;

  insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
  raise exception 'El código no es válido o ya venció. Pídale uno nuevo a gerencia o a operaciones.';
end;
$fn$;

comment on function validar_codigo_autorizacion is
  'Valida el código de autorización para un ámbito. Gerencia vale para todo; el administrador de operaciones, solo para lo operativo (migración 0114).';

revoke all on function validar_codigo_autorizacion(text, text) from public;
grant execute on function validar_codigo_autorizacion(text, text) to authenticated;

-- ------------------------------------------------------------
-- Anular pasa a pedir el código del ámbito operativo, que es el que Lesly
-- también puede dictar. Todo lo demás de la 0113 queda igual.
create or replace function anular_cierre(p_informe uuid, p_motivo text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien uuid := auth.uid();
  v_rol text;
  v_autorizo uuid;
  v_inf record;
  v_cuenta uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select rol::text into v_rol from perfiles where id = v_quien and activo;
  if v_rol is null or v_rol not in ('central', 'gerencia', 'admin') then
    raise exception 'Anular un cierre lo hace Central o gerencia, no quien lo emitió';
  end if;

  if length(coalesce(btrim(p_motivo), '')) < 10 then
    raise exception 'Escriba por qué se anula: queda en el registro del informe';
  end if;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre todavía es un borrador del comercial: no hay nada que anular';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'El cierre % ya estaba anulado', v_inf.codigo;
  end if;

  if v_inf.es_prueba is distinct from es_cuenta_prueba() then
    raise exception 'Ese cierre no es de esta cuenta';
  end if;

  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  perform set_config('app.anulando_cierre', 'si', true);

  update informes_cierre
     set anulado_at = now(), anulado_por = v_quien,
         anulado_autorizo = v_autorizo, anulado_motivo = btrim(p_motivo)
   where id = p_informe;

  if v_inf.venta_id is not null then
    update ventas
       set anulada_at = now(), anulada_motivo = btrim(p_motivo)
     where id = v_inf.venta_id;

    select o.cuenta_id into v_cuenta
      from ventas v join oportunidades o on o.id = v.oportunidad_id
     where v.id = v_inf.venta_id;
    if v_cuenta is not null then
      update cuentas c
         set ultima_venta_at = (
           select max(v.fecha_venta)
             from ventas v join oportunidades o on o.id = v.oportunidad_id
            where o.cuenta_id = c.id and v.anulada_at is null)
       where c.id = v_cuenta;
    end if;
  end if;

  perform set_config('app.anulando_cierre', '', true);

  return jsonb_build_object(
    'codigo', v_inf.codigo,
    'serie', v_inf.serie,
    'cliente', v_inf.cliente_nombre,
    'venta_anulada', v_inf.venta_id is not null
  );
end;
$fn$;

revoke all on function anular_cierre(uuid, text, text) from public;
grant execute on function anular_cierre(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
update perfiles set es_operaciones = true where lower(nombre) like 'lesly%' and activo;

-- ------------------------------------------------------------
-- La bitácora de quien autoriza. Dictar un código a ciegas y no volver a saber
-- qué se hizo con él no es autorizar, es adivinar: la pantalla de operaciones
-- tiene que poder contestar «¿qué se anuló hoy, quién lo pidió y por qué?».
--
-- Va como función con permiso porque Lesly es `comercial` para las políticas y
-- los cierres de los demás no le pertenecen: acá se le abre exactamente esto y
-- nada más.
create or replace function bitacora_autorizaciones(p_dias integer default 30)
returns table (
  informe_id uuid, codigo text, serie text, cliente text,
  monto numeric, moneda text,
  anulado_at timestamptz, motivo text,
  ejecuto text, autorizo text, comercial text
)
language sql stable security definer set search_path = public as $fn$
  select i.id, i.codigo, i.serie, i.cliente_nombre, i.monto_total, i.moneda,
         i.anulado_at, i.anulado_motivo,
         quien.nombre, autoriza.nombre, duenio.nombre
    from informes_cierre i
    left join perfiles quien    on quien.id    = i.anulado_por
    left join perfiles autoriza on autoriza.id = i.anulado_autorizo
    left join perfiles duenio   on duenio.id   = i.creado_por
   where i.anulado_at is not null
     and i.anulado_at > now() - make_interval(days => greatest(p_dias, 1))
     and i.es_prueba = es_cuenta_prueba()
     and (es_operaciones()
          or (select rol::text from perfiles where id = auth.uid()) in ('gerencia', 'admin', 'central'))
   order by i.anulado_at desc
   limit 200;
$fn$;

revoke all on function bitacora_autorizaciones(integer) from public;
grant execute on function bitacora_autorizaciones(integer) to authenticated;
