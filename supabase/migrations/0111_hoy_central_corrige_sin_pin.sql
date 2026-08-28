-- ============================================================
-- CRM EFAMEINSA · Migración 0111 · Hoy Central corrige sin PIN
-- ============================================================
-- Orden de Darwin, 28-08 por la tarde: «solo por hoy, hasta lo que dure el día,
-- dejale a Central derivar todo sin pedir PIN porque parece que hay bug: los
-- códigos que se le dan no funcionan».
--
-- SE APAGA SOLO. El permiso vive en `config_seguridad` con una FECHA DE
-- VENCIMIENTO —el final del día de hoy en Lima— y la propia función lo compara
-- contra el reloj. Nadie tiene que acordarse de sacarlo mañana: mañana, sin que
-- nadie toque nada, el PIN vuelve a pedirse.
--
-- LO QUE NO SE SUSPENDE, porque es lo que hace medible el error:
--   · El MOTIVO sigue siendo obligatorio. Es lo que gerencia lee después.
--   · La corrección se sigue REGISTRANDO en `autorizaciones_supervisor`, con el
--     motivo marcado «[sin código — permiso de gerencia del 28-08]» para que
--     mañana se distinga de una autorización normal.
--   · Los límites de la migración 0079 siguen en pie: si el comercial anterior
--     ya cotizó o ya gestionó, esto no es un error de asignación y no se
--     corrige acá.
--
-- SOBRE EL «BUG». En la base no hay ni un intento fallido ni una autorización
-- registrada, y un código equivocado SÍ deja rastro (`intentos_pin_supervisor`).
-- Es decir: la validación del PIN ni siquiera se está alcanzando. Lo más
-- probable es que la pantalla esté devolviendo el rechazo de la 0079 —«ese
-- contacto ya no es un error de asignación»— y que se lea como «el código no
-- funciona». Por eso, además del permiso de hoy, esta migración deja anotado el
-- motivo del rechazo de cada intento (`intentos_pin_supervisor.detalle`), para
-- saber mañana qué está pasando de verdad en vez de seguir adivinando.

alter table intentos_pin_supervisor add column if not exists detalle text;
comment on column intentos_pin_supervisor.detalle is
  'Por qué se rechazó el intento. Sin esto, un rechazo que no es del código —motivo corto, contacto ya gestionado— parece un PIN que no funciona (migración 0111).';

insert into config_seguridad (clave, valor)
values ('pin_supervisor_libre_hasta',
        -- El final del día de hoy en Lima, en UTC.
        (((now() at time zone 'America/Lima')::date + 1)::timestamp at time zone 'America/Lima')::text)
on conflict (clave) do update set valor = excluded.valor, creado_at = now();

-- Hasta cuándo se puede corregir sin código. Null = se pide siempre.
create or replace function pin_libre_hasta()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select nullif(c.valor, '')::timestamptz
    from config_seguridad c
   where c.clave = 'pin_supervisor_libre_hasta'
     and nullif(c.valor, '')::timestamptz > now();
$$;
revoke all on function pin_libre_hasta() from public;
grant execute on function pin_libre_hasta() to authenticated;

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
  v_resultado   uuid;
  v_pin         text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  v_sup         record;
  v_libre       boolean := pin_libre_hasta() is not null;
  v_motivo      text;
begin
  if v_solicitante is null then
    raise exception 'Sesión no válida';
  end if;

  -- El motivo es el material del análisis: sin él esto sería solo una tranca.
  -- Se pide también en el día sin PIN — es lo único que queda para entender qué
  -- pasó, así que ahí importa más todavía.
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    insert into intentos_pin_supervisor (solicitante_id, detalle) values (v_solicitante, 'motivo demasiado corto');
    raise exception 'Escriba por qué se está corrigiendo la derivación (mínimo una frase). Es lo que va a leer gerencia.';
  end if;
  v_motivo := btrim(p_motivo);

  if v_libre then
    -- Permiso de gerencia por el día: no se pide código, pero la corrección
    -- queda registrada igual y marcada como tal.
    select p.id into v_supervisor from perfiles p
     where p.rol::text in ('gerencia', 'admin') and p.activo
     order by p.created_at limit 1;
    -- Ventana negativa e irrepetible: no consume ninguna de las reales y no
    -- choca con la restricción única, porque hoy se corrige más de una vez.
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
      insert into intentos_pin_supervisor (solicitante_id, detalle) values (v_solicitante, 'el código no tiene cuatro dígitos');
      raise exception 'El código de autorización son cuatro dígitos.';
    end if;

    -- La ventana anterior también vale: el código se dicta por teléfono y no
    -- puede vencerse en la mitad de la frase.
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
      insert into intentos_pin_supervisor (solicitante_id, detalle) values (v_solicitante, 'código incorrecto o vencido');
      raise exception 'Código incorrecto o vencido. Pídale al supervisor el que tiene en pantalla ahora.';
    end if;
  end if;

  select asignado_a into v_anterior from leads where id = p_lead_id;

  -- Se anota ANTES de mover nada: si el código ya se había usado, la
  -- restricción única lo detiene acá y la derivación no se toca.
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

  -- Si la 0079 rechaza la corrección, la excepción deshace también el registro
  -- de arriba: por eso el motivo del rechazo se anota antes de propagarla.
  begin
    v_resultado := redirigir_lead(p_lead_id, p_comercial_id);
  exception when others then
    insert into intentos_pin_supervisor (solicitante_id, detalle)
    values (v_solicitante, 'rechazo al redirigir: ' || left(sqlerrm, 180));
    raise;
  end;
  return v_resultado;
end $$;

revoke all on function redirigir_lead_con_pin(uuid, uuid, text, text) from public;
grant execute on function redirigir_lead_con_pin(uuid, uuid, text, text) to authenticated;

comment on function redirigir_lead_con_pin(uuid, uuid, text, text) is
  'Corrige una derivación con autorización de supervisor. Mientras `pin_libre_hasta()` devuelva una fecha, no pide código pero registra igual (migración 0111).';
