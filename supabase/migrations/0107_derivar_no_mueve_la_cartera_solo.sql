-- ============================================================
-- CRM EFAMEINSA · Migración 0107 · Derivar no mueve la cartera sola
-- ============================================================
-- Lo destapó el ensayo del circuito del 28-08: una derivación de prueba movió
-- un cliente REAL de la cartera de Katerine a otra cuenta, sin que nadie lo
-- decidiera y sin que nadie se enterara. El mecanismo estaba a la vista en
-- `asignar_lead`: si el contacto que entra coincide con un cliente que ya
-- existe —por documento, o por teléfono cuando no hay documento— y se lo deriva
-- a un comercial distinto del dueño, la función hace
--
--     update cuentas set comercial_id = p_comercial_id
--
-- y lo registra con motivo «decisión de gerencia». Pero gerencia no decidió
-- nada: decidió quien contestó el teléfono, con un clic, sin saberlo.
--
-- Y eso choca de frente con la regla 1 del proyecto: «un cliente pertenece al
-- comercial que lo atendió; si pasan 6 meses sin venta queda liberable y
-- gerencia puede derivarlo — DECISIÓN MANUAL DE GERENCIA, NO AUTOMÁTICA».
--
-- LO QUE CAMBIA. Derivar un contacto sigue siendo un clic mientras no toque la
-- cartera de nadie. Cuando SÍ la toca, hace falta el código del supervisor —el
-- mismo de dos minutos que ya se usa para corregir una derivación (0092)— y
-- queda escrito quién autorizó. La pantalla lo avisa antes, con nombre y
-- apellido de quién es hoy ese cliente.
--
-- CÓMO SE HACE CUMPLIR. No se le pide a la pantalla que sea prudente: se cierra
-- la otra puerta. `asignar_lead` deja de estar al alcance de la aplicación y el
-- único camino pasa a ser `asignar_lead_con_pin`. Es la misma decisión que tomó
-- la 0092 con las correcciones.

-- ------------------------------------------------------------
-- 1. ¿Esta derivación le quita el cliente a alguien?
-- ------------------------------------------------------------
-- Repite la búsqueda de `asignar_lead` —documento primero, teléfono después—
-- para poder AVISAR antes de hacer nada. Es de solo lectura.
create or replace function cartera_en_juego(p_lead_id uuid, p_comercial_id uuid)
returns table (cuenta_id uuid, razon_social text, dueno_id uuid, dueno_nombre text, dueno_codigo text)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_lead record;
  v_cuenta uuid;
  v_dueno uuid;
begin
  select l.*, normalizar_telefono(l.telefono) as tel into v_lead from leads l where l.id = p_lead_id;
  if v_lead is null then return; end if;

  select c.id, c.comercial_id into v_cuenta, v_dueno
    from cuentas c
   where (v_lead.num_doc is not null and v_lead.num_doc <> '' and c.num_doc = v_lead.num_doc and c.tipo_doc <> 'SIN_DOC')
   limit 1;

  if v_cuenta is null and v_lead.tel is not null then
    select c.id, c.comercial_id into v_cuenta, v_dueno
      from cuentas c
     where exists (select 1 from contactos ct where ct.cuenta_id = c.id and ct.telefono_normalizado = v_lead.tel)
     limit 1;
  end if;

  -- Solo hay algo que avisar si el cliente ya tiene dueño y es otro.
  if v_cuenta is null or v_dueno is null or v_dueno = p_comercial_id then return; end if;

  return query
    select v_cuenta, c.razon_social, p.id, p.nombre, p.codigo_comercial
      from cuentas c join perfiles p on p.id = v_dueno
     where c.id = v_cuenta;
end;
$fn$;

comment on function cartera_en_juego is
  'Dice si derivar este contacto a este comercial le quitaría el cliente a otro, y a quién. Solo lectura: sirve para avisar antes (migración 0107).';

revoke all on function cartera_en_juego(uuid, uuid) from public;
grant execute on function cartera_en_juego(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. El código del supervisor, validable desde cualquier lado
-- ------------------------------------------------------------
-- La misma regla que aplica `redirigir_lead_con_pin` (0092): cuatro dígitos,
-- la ventana actual o la anterior —el código se dicta por teléfono y no puede
-- vencerse en la mitad de la frase— y cinco intentos fallidos en diez minutos
-- cierran la puerta. Se extrae acá para que el segundo caso que la necesita no
-- la copie; `redirigir_lead_con_pin` sigue con la suya hasta que haya un motivo
-- para tocarla, porque es el camino por el que Central corrige todos los días.
create or replace function validar_pin_supervisor(p_pin text)
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
    raise exception 'Demasiados códigos incorrectos. Espere unos minutos y pida uno nuevo al supervisor.';
  end if;

  if length(v_pin) <> 4 then
    insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
    raise exception 'El código de autorización son cuatro dígitos.';
  end if;

  for v_sup in select p.id from perfiles p where p.rol::text in ('gerencia', 'admin') and p.activo loop
    if v_pin = codigo_pin_supervisor(v_sup.id, v_ventana)
       or v_pin = codigo_pin_supervisor(v_sup.id, v_ventana - 1) then
      return v_sup.id;
    end if;
  end loop;

  insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
  raise exception 'El código no es válido o ya venció. Pídale uno nuevo al supervisor.';
end;
$fn$;

comment on function validar_pin_supervisor is
  'Valida el código de dos minutos del supervisor y devuelve quién autorizó. Misma regla que la 0092, extraída para el segundo caso que la necesita (migración 0107).';

revoke all on function validar_pin_supervisor(text) from public;
grant execute on function validar_pin_supervisor(text) to authenticated;

-- ------------------------------------------------------------
-- 3. La única puerta para derivar
-- ------------------------------------------------------------
create or replace function asignar_lead_con_pin(
  p_lead_id uuid,
  p_comercial_id uuid,
  p_motivo motivo_asignacion default null,
  p_tipo_postventa tipo_postventa default null,
  p_pin text default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_juego record;
  v_supervisor uuid;
  v_oportunidad uuid;
begin
  select * into v_juego from cartera_en_juego(p_lead_id, p_comercial_id);

  if v_juego.cuenta_id is not null then
    -- Un caso de postventa no toma cartera nunca (0080), así que no se le pide
    -- nada: `asignar_lead` ya deja la cuenta donde está.
    if p_tipo_postventa is null then
      if coalesce(btrim(p_pin), '') = '' then
        raise exception 'DERIVACION_MUEVE_CARTERA: % es cliente de % (%). Derivarlo a otro comercial le cambia el dueño y eso lo autoriza gerencia.',
          v_juego.razon_social, v_juego.dueno_nombre, coalesce(v_juego.dueno_codigo, 's/c');
      end if;
      v_supervisor := validar_pin_supervisor(p_pin);
    end if;
  end if;

  v_oportunidad := asignar_lead(p_lead_id, p_comercial_id, p_motivo, p_tipo_postventa);

  -- Queda escrito quién autorizó el traspaso, que es lo que hoy no existía.
  if v_supervisor is not null then
    update asignaciones
       set decidida_por = v_supervisor,
           notas = coalesce(notas || ' · ', '') || 'Traspaso de cartera autorizado con código de supervisor'
     where lead_id = p_lead_id
       and created_at > now() - interval '1 minute';
  end if;

  return v_oportunidad;
end;
$fn$;

comment on function asignar_lead_con_pin is
  'Deriva un contacto. Si la derivación le quitaría el cliente a otro comercial, exige el código del supervisor y deja escrito quién autorizó (migración 0107).';

revoke all on function asignar_lead_con_pin(uuid, uuid, motivo_asignacion, tipo_postventa, text) from public;
grant execute on function asignar_lead_con_pin(uuid, uuid, motivo_asignacion, tipo_postventa, text) to authenticated;

-- Y se cierra la otra puerta: la aplicación ya no puede llamar a `asignar_lead`
-- directamente. No es que la pantalla decida pedir el código —es que no hay
-- otro camino—, que es la misma decisión que tomó la 0092.
revoke execute on function asignar_lead(uuid, uuid, motivo_asignacion, tipo_postventa) from authenticated;
