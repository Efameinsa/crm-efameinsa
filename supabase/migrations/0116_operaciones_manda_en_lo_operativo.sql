-- ============================================================
-- CRM EFAMEINSA · Migración 0116 · Operaciones manda en lo operativo
-- ============================================================
-- Sigue a la 0115, donde nació el rol. Acá se le da a Lesly el puesto y lo que
-- el puesto hace, que salió de las reuniones con gerencia del 28-08:
--
--   · AUTORIZA. «Cualquier autorización, ella tiene que ingresar para dar
--     autorización» y, sobre el código que Central le pide para corregir una
--     derivación: «eso es justamente como administrador, lo tiene que tener
--     también». Así que su código sirve para lo operativo (anular un cierre) y
--     para las derivaciones. NO para traspasar la cartera de un comercial a
--     otro: eso es plata de alguien y se queda en gerencia.
--
--   · REPARTE PERMISOS. «Administrador, por favor, ¿me puedes dar la vista?
--     Voy a cotizar mantenimiento. […] ¿Terminaste? Sí. Chau. Desactivado.»
--     El comercial no navega postventa todo el año para hacer cuatro
--     cotizaciones al mes: se le abre cuando lo pide y se le cierra al terminar.
--
--   · MANTIENE EL CATÁLOGO. Los productos y sus precios salen del maestro que
--     ella misma administra; hasta hoy tenía que pedírselo a un admin.
--
-- LO QUE NO SE LE DIO. Gerencia sigue siendo gerencia: `es_backoffice()` no la
-- incluye, así que los paneles de gerencia, las comisiones y los números de la
-- empresa siguen fuera de su alcance. Es lo que se decidió el 27-08 y no cambió.

update perfiles set rol = 'operaciones' where lower(nombre) like 'lesly%' and activo;

-- El rol manda; la marca de la 0114 se respeta por si alguien más la tuviera.
create or replace function es_operaciones()
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (select rol::text = 'operaciones' or es_operaciones from perfiles where id = auth.uid() and activo),
    false);
$fn$;

revoke all on function es_operaciones() from public;
grant execute on function es_operaciones() to authenticated;

-- ------------------------------------------------------------
-- 1. El catálogo. Mismo permiso de escritura que tiene gerencia, sobre las dos
--    tablas del maestro y nada más.
drop policy if exists productos_write on productos;
create policy productos_write on productos for all to authenticated
using ((select es_backoffice()) or (select es_operaciones()))
with check ((select es_backoffice()) or (select es_operaciones()));

drop policy if exists precios_write on precios_producto;
create policy precios_write on precios_producto for all to authenticated
using ((select es_backoffice()) or (select es_operaciones()))
with check ((select es_backoffice()) or (select es_operaciones()));

-- ------------------------------------------------------------
-- 2. Repartir el permiso de cotizar mantenimiento.
--
-- `hace_postventa` ya existía (0093) y se prendía a mano en la base. Ahora lo
-- prende y lo apaga operaciones desde su pantalla, y queda escrito desde cuándo
-- está abierto y quién lo abrió — que es lo que permite cerrarlo: un permiso
-- que nadie recuerda haber dado no se revoca nunca.
alter table perfiles
  add column if not exists mantenimiento_desde timestamptz,
  add column if not exists mantenimiento_por uuid references perfiles(id);

comment on column perfiles.mantenimiento_desde is
  'Desde cuándo este comercial tiene abierta la vista para cotizar mantenimiento (reunión 28-08). Sirve para saber a quién cerrarle.';

create or replace function permitir_cotizar_mantenimiento(p_comercial uuid, p_activar boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien uuid := auth.uid();
  v_p record;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'Este permiso lo reparte operaciones o gerencia';
  end if;

  select * into v_p from perfiles where id = p_comercial and activo;
  if not found then raise exception 'Ese usuario no existe o está inactivo'; end if;
  if v_p.rol::text <> 'comercial' then
    raise exception 'La vista de mantenimiento es para un comercial';
  end if;

  update perfiles
     set hace_postventa = p_activar,
         mantenimiento_desde = case when p_activar then now() else null end,
         mantenimiento_por = case when p_activar then v_quien else null end
   where id = p_comercial;

  return jsonb_build_object('nombre', v_p.nombre, 'activo', p_activar);
end;
$fn$;

comment on function permitir_cotizar_mantenimiento is
  'Abre o cierra al comercial la vista para cotizar mantenimiento. La reparte operaciones, como pidió Carlos el 28-08: se abre cuando lo pide y se cierra al terminar.';

revoke all on function permitir_cotizar_mantenimiento(uuid, boolean) from public;
grant execute on function permitir_cotizar_mantenimiento(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 3. El código de operaciones también vale para corregir una derivación.
--
-- Se toca UNA SOLA LÍNEA de `redirigir_lead_con_pin`: la lista de quién puede
-- haber dictado el código. Todo lo demás queda exactamente como lo dejaron las
-- migraciones 0111 y 0112 —el permiso sin código que vence hoy, el motivo
-- obligatorio, el registro en `autorizaciones_supervisor`, el código que se
-- quema al usarse— porque son de esta misma tarde y no hay razón para pisarlas.
create or replace function redirigir_lead_con_pin(p_lead_id uuid, p_comercial_id uuid, p_pin text, p_motivo text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_solicitante uuid := auth.uid();
  v_ventana     bigint := ventana_pin_actual();
  v_supervisor  uuid;
  v_ventana_ok  bigint;
  v_fallidos    integer;
  v_anterior    uuid;
  v_pin         text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  v_sup         record;
  v_libre       boolean := pin_libre_hasta() is not null;
  v_motivo      text;
begin
  if v_solicitante is null then
    raise exception 'Sesión no válida';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se está corrigiendo la derivación (mínimo una frase). Es lo que va a leer gerencia.';
  end if;
  v_motivo := btrim(p_motivo);

  if v_libre then
    select p.id into v_supervisor from perfiles p
     where p.rol::text in ('gerencia', 'admin') and p.activo
     order by p.created_at limit 1;
    v_ventana_ok := -floor(extract(epoch from now()))::bigint;
    v_motivo := '[sin código — permiso de gerencia del ' ||
                to_char((now() at time zone 'America/Lima'), 'DD-MM') || '] ' || v_motivo;
  else
    select count(*) into v_fallidos
      from intentos_pin_supervisor
     where solicitante_id = v_solicitante
       and creado_at > now() - interval '10 minutes';
    if v_fallidos >= 5 then
      raise exception 'Demasiados códigos incorrectos. Espere unos minutos y pida uno nuevo al supervisor.';
    end if;

    if length(v_pin) <> 4 then
      raise exception 'El código de autorización son cuatro dígitos.';
    end if;

    -- ACÁ ESTÁ EL CAMBIO DE LA 0116: operaciones también dicta este código.
    for v_sup in
      select p.id from perfiles p
       where p.activo
         and (p.rol::text in ('gerencia', 'admin', 'operaciones') or p.es_operaciones)
    loop
      if codigo_pin_supervisor(v_sup.id, v_ventana) = v_pin then
        v_supervisor := v_sup.id; v_ventana_ok := v_ventana; exit;
      elsif codigo_pin_supervisor(v_sup.id, v_ventana - 1) = v_pin then
        v_supervisor := v_sup.id; v_ventana_ok := v_ventana - 1; exit;
      end if;
    end loop;

    if v_supervisor is null then
      raise exception 'Código incorrecto o vencido. Pídale al supervisor el que tiene en pantalla ahora.';
    end if;
  end if;

  select asignado_a into v_anterior from leads where id = p_lead_id;

  begin
    insert into autorizaciones_supervisor (
      supervisor_id, solicitante_id, ventana, accion, lead_id,
      comercial_anterior, comercial_nuevo, motivo
    ) values (
      v_supervisor, v_solicitante, v_ventana_ok, 'redirigir_lead', p_lead_id,
      v_anterior, p_comercial_id, v_motivo
    );
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola corrección: pida uno nuevo.';
  end;

  return redirigir_lead(p_lead_id, p_comercial_id, true);
end $function$;

-- El mismo alcance, para la validación con ámbito de la 0114: «derivacion»
-- ahora también acepta a operaciones. «cartera» sigue sin nombrarla.
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
            or (p_ambito in ('operaciones', 'derivacion')
                and (p.rol::text = 'operaciones' or p.es_operaciones)))
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

revoke all on function validar_codigo_autorizacion(text, text) from public;
grant execute on function validar_codigo_autorizacion(text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Anular sigue siendo cosa de Central o gerencia; ahora también de
--    operaciones, que es quien va a estar cuando no esté gerencia.
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
  if v_rol is null or v_rol not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'Anular un cierre lo hace Central, operaciones o gerencia, no quien lo emitió';
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
-- 5. Su cuenta ya no es de postventa: es de operaciones, y ve postventa porque
--    lo administra. La marca se conserva —de ella cuelgan las políticas del
--    área, que es lo que le da acceso a los pedidos, los casos y los equipos—
--    pero deja de ser «soporte», que era el nombre viejo del puesto.
update perfiles set es_operaciones = true where rol::text = 'operaciones' and activo;
