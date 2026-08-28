-- ============================================================
-- CRM EFAMEINSA · Migración 0113 · Con autorización, la corrección procede
-- ============================================================
-- ESTE ES EL BUG QUE CENTRAL REPORTÓ COMO «EL PIN NO FUNCIONA».
--
-- Simulando su sesión sobre los doce contactos que derivó en los últimos tres
-- días, NINGUNO se puede corregir. Y ninguna de las negativas tiene que ver con
-- el código:
--
--   · «este cliente ya tenía 1 oportunidad(es) antes de esta derivación»  (5)
--   · «ese comercial ya registró 1 gestión(es) sobre este contacto»       (3)
--   · «ese comercial ya hizo N cotización(es)»                            (2)
--
-- Ella escribe el motivo, llama al supervisor, teclea el código… y recibe «no
-- se puede». Desde su silla, el código no funciona.
--
-- LA CONTRADICCIÓN. Los candados son de la migración 0079, de cuando corregir
-- era una acción sin control: por eso los mensajes terminan en «pídalo a
-- gerencia». El 27-08 llegó el PIN (0093) justamente para que gerencia pueda
-- decidirlo en el momento —la caja de Plaza Vea: «llamo a su supervisor, viene
-- y ya está»—. Pero los candados quedaron intactos, así que gerencia autoriza y
-- el sistema igual dice que no. El control se volvió un trámite que no lleva a
-- ninguna parte, y con 14.000 cuentas importadas casi cualquier cliente conocido
-- dispara el primero.
--
-- CÓMO QUEDA. Los candados siguen para la corrección SIN autorización. Cuando
-- viene con el código del supervisor —o con el permiso del día, 0111—, la
-- corrección procede: es exactamente lo que esos mensajes piden. Nada se hace
-- en silencio: `autorizaciones_supervisor` guarda quién autorizó, quién pidió,
-- qué contacto, de quién a quién y por qué.
--
-- Lo que NO cambia: sigue siendo Central (o backoffice) quien la ejecuta, el
-- contacto tiene que estar derivado, el destino tiene que ser un comercial
-- activo y no puede ser el mismo que ya lo tiene.

create or replace function redirigir_lead(
  p_lead_id      uuid,
  p_comercial_id uuid,
  p_autorizado   boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead        leads%rowtype;
  v_oportunidad oportunidades%rowtype;
  v_cuenta      cuentas%rowtype;
  v_n           integer;
begin
  if not (rol_actual() = 'central'::rol_usuario or es_backoffice()) then
    raise exception 'Solo Central puede corregir una derivación';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if v_lead is null then
    raise exception 'No existe ese contacto';
  end if;
  if v_lead.estado <> 'asignado' then
    raise exception 'Ese contacto no está derivado a nadie';
  end if;
  if v_lead.asignado_a = p_comercial_id then
    raise exception 'Ese contacto ya está con ese comercial';
  end if;

  if not exists (
    select 1 from perfiles
     where id = p_comercial_id and rol = 'comercial' and activo
  ) then
    raise exception 'El destino no es un comercial activo';
  end if;

  select * into v_oportunidad from oportunidades where lead_id = p_lead_id order by created_at limit 1;

  if v_oportunidad.id is not null then
    -- Los cuatro casos que dejan de ser «un error de asignación» y pasan a ser
    -- un traspaso de cartera. Con autorización de un supervisor se hacen igual
    -- —eso es lo que la autorización significa— y quedan registrados.
    if not p_autorizado then
      select count(*) into v_n from cotizaciones where oportunidad_id = v_oportunidad.id;
      if v_n > 0 then
        raise exception 'No se puede: ese comercial ya hizo % cotización(es). Con el código de un supervisor sí se puede corregir.', v_n;
      end if;

      select count(*) into v_n from actividades where oportunidad_id = v_oportunidad.id;
      if v_n > 0 then
        raise exception 'No se puede: ese comercial ya registró % gestión(es) sobre este contacto. Con el código de un supervisor sí se puede corregir.', v_n;
      end if;

      select count(*) into v_n from oportunidades
       where cuenta_id = v_oportunidad.cuenta_id and id <> v_oportunidad.id;
      if v_n > 0 then
        raise exception 'No se puede: este cliente ya tenía % oportunidad(es) antes de esta derivación. Con el código de un supervisor sí se puede corregir.', v_n;
      end if;

      select * into v_cuenta from cuentas where id = v_oportunidad.cuenta_id;
      if v_cuenta.ultima_venta_at is not null then
        raise exception 'No se puede: a este cliente ya se le vendió. Con el código de un supervisor sí se puede corregir.';
      end if;
    end if;

    update oportunidades set comercial_id = p_comercial_id, updated_at = now()
     where id = v_oportunidad.id;
    update cuentas set comercial_id = p_comercial_id, cartera_desde = current_date
     where id = v_oportunidad.cuenta_id;
  end if;

  update leads
     set asignado_a = p_comercial_id,
         asignado_por = auth.uid(),
         asignado_at = now(),
         updated_at = now()
   where id = p_lead_id;

  return v_oportunidad.id;
end $$;

comment on function redirigir_lead(uuid, uuid, boolean) is
  'Corrige una derivación equivocada: mueve lead, oportunidad y cuenta al comercial correcto. Sin autorización se niega si el anterior ya cotizó, ya gestionó o el cliente ya era suyo; con el código de un supervisor procede y queda registrado (migraciones 0079 y 0113).';

-- La puerta sin autorización sigue cerrada para la aplicación: se entra por
-- `redirigir_lead_con_pin`, que es la que valida y deja el registro.
revoke all on function redirigir_lead(uuid, uuid, boolean) from public;
revoke all on function redirigir_lead(uuid, uuid) from public;

-- Y la que llama con la autorización ya validada.
create or replace function redirigir_lead_con_pin(
  p_lead_id      uuid,
  p_comercial_id uuid,
  p_pin          text,
  p_motivo       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

    for v_sup in
      select p.id from perfiles p
       where p.rol::text in ('gerencia', 'admin') and p.activo
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

  -- Con la autorización ya registrada, la corrección procede.
  return redirigir_lead(p_lead_id, p_comercial_id, true);
end $$;

revoke all on function redirigir_lead_con_pin(uuid, uuid, text, text) from public;
grant execute on function redirigir_lead_con_pin(uuid, uuid, text, text) to authenticated;
