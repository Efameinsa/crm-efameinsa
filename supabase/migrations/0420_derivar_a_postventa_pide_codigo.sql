-- ============================================================
-- 0420 · DERIVAR A POSTVENTA PIDE EL CÓDIGO DEL SUPERVISOR
--
-- Ing. Carlos, 09-10-2026 (por Santos): «a partir de ahora todos los
-- prospectos o clientes, DERIVACIONES, en general que a la central se le
-- pida PIN, que no derive unilateralmente, que nos está metiendo en
-- problemas». Santos aclara que es sobre las derivaciones hacia POSTVENTA.
--
-- Hasta hoy un caso de postventa no pedía nada (0080: no toma cartera, así
-- que no había traspaso que autorizar). Ahora toda derivación a postventa la
-- autoriza gerencia u operaciones con su código de cuatro dígitos, el mismo
-- de siempre (ámbito 'derivacion'), y se quema al usarse.
--
-- · Quien tiene el código (gerencia, admin, operaciones) no se lo pide a sí
--   mismo.
-- · Si gerencia levantó el código por el día (pin_libre_hasta, 0111), pasa.
-- · Quién lo autorizó queda en autorizaciones_supervisor (acción
--   'derivar_postventa', con el contacto y quién lo pidió). Un caso sobre un
--   cliente que ya existía no deja fila en `asignaciones` (no mueve cartera),
--   así que la nota allí solo aparece cuando sí la deja.
-- · El caso que postventa registra ella misma (0327) no pasa por aquí: usa
--   asignar_lead directo.
--
-- Misma firma que la 0223: create or replace, se conservan los permisos.
-- ============================================================

create or replace function public.asignar_lead_con_pin(
  p_lead_id uuid,
  p_comercial_id uuid,
  p_motivo motivo_asignacion default null,
  p_tipo_postventa tipo_postventa default null,
  p_pin text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_juego record;
  v_supervisor uuid;
  v_autorizo_pv uuid;
  v_oportunidad uuid;
  v_tiene_codigo boolean;
begin
  -- A POSTVENTA, CENTRAL NO DERIVA SOLA (0420).
  if p_tipo_postventa is not null and pin_libre_hasta() is null then
    select p.rol::text in ('gerencia', 'admin', 'operaciones') or coalesce(p.es_operaciones, false)
      into v_tiene_codigo
      from perfiles p
     where p.id = auth.uid();

    if not coalesce(v_tiene_codigo, false) then
      if coalesce(btrim(p_pin), '') = '' then
        raise exception 'DERIVACION_A_POSTVENTA: Derivar a postventa lo autoriza gerencia u operaciones con su código. Pídaselo y escríbalo en la casilla.';
      end if;
      v_autorizo_pv := validar_pin_supervisor(p_pin);
      -- Se quema: el código de ese supervisor cambia para el siguiente uso.
      insert into autorizaciones_supervisor (supervisor_id, solicitante_id, ventana, accion, lead_id, motivo)
      values (v_autorizo_pv, auth.uid(), ventana_pin_actual(), 'derivar_postventa', p_lead_id,
              format('Derivación a postventa (%s)', p_tipo_postventa));
    end if;
  end if;

  select * into v_juego from cartera_en_juego(p_lead_id, p_comercial_id);

  if v_juego.cuenta_id is not null then
    -- Un caso de postventa no toma cartera nunca (0080): su código, si hizo
    -- falta, ya se pidió arriba.
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

  -- Y quién autorizó la derivación a postventa (0420).
  if v_autorizo_pv is not null then
    update asignaciones
       set notas = coalesce(notas || ' · ', '') || 'Derivación a postventa autorizada por '
                   || coalesce((select nombre from perfiles where id = v_autorizo_pv), 'el supervisor')
     where lead_id = p_lead_id
       and created_at > now() - interval '1 minute';
  end if;

  -- La razón por la que se derivó como cliente nuevo teniendo una coincidencia
  -- delante (0223). Se guarda tal cual la escribió Central, con su rótulo,
  -- para que se distinga de una nota de traspaso.
  if length(btrim(coalesce(p_nota, ''))) > 0 then
    update asignaciones
       set notas = coalesce(notas || ' · ', '') || 'Derivado como cliente nuevo pese a la coincidencia: ' || btrim(p_nota)
     where lead_id = p_lead_id
       and created_at > now() - interval '1 minute';
  end if;

  return v_oportunidad;
end;
$function$;

comment on function public.asignar_lead_con_pin(uuid, uuid, motivo_asignacion, tipo_postventa, text, text) is
  'Deriva un contacto; pide el código del supervisor si la derivación mueve cartera (0107) o si va a postventa y no la hace gerencia/operaciones (0420), y anota la razón cuando se deriva como cliente nuevo pese a una coincidencia (0223).';
