-- ============================================================
-- CRM EFAMEINSA · Migración 0112 · El rechazo se anota desde la aplicación
-- ============================================================
-- Corrección de la 0111. Ahí intenté anotar el motivo del rechazo dentro de la
-- propia función, en el `exception when others`, para saber por qué Central ve
-- que «el código no funciona». No sirve: la llamada entera es UNA transacción,
-- así que al volver a lanzar la excepción se deshace también esa anotación.
-- Postgres no tiene transacciones autónomas; en la base no hay forma de dejar
-- rastro de algo que termina abortado.
--
-- Donde sí se puede es en la aplicación, que ve el error DESPUÉS de que la
-- transacción murió y escribe en una transacción nueva: lo hace ahora
-- `redirigirLead()` (src/lib/acciones/leads.ts). La función vuelve a quedar
-- limpia, sin el bloque que no servía.

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

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se está corrigiendo la derivación (mínimo una frase). Es lo que va a leer gerencia.';
  end if;
  v_motivo := btrim(p_motivo);

  if v_libre then
    -- Permiso de gerencia por el día (0111): no se pide código, pero la
    -- corrección queda registrada igual y marcada como tal.
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

  return redirigir_lead(p_lead_id, p_comercial_id);
end $$;

revoke all on function redirigir_lead_con_pin(uuid, uuid, text, text) from public;
grant execute on function redirigir_lead_con_pin(uuid, uuid, text, text) to authenticated;

-- La aplicación escribe acá cuando la corrección se rechaza, sea por el código
-- o por cualquier otro motivo. Es lo único que va a decir mañana si el problema
-- era de verdad el PIN.
grant insert on intentos_pin_supervisor to authenticated;
drop policy if exists intentos_pin_anota_su_rechazo on intentos_pin_supervisor;
create policy intentos_pin_anota_su_rechazo on intentos_pin_supervisor
  for insert to authenticated
  with check (solicitante_id = (select auth.uid()));
