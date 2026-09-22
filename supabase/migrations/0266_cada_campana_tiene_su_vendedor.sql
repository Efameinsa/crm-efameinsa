-- CADA CAMPAÑA PUEDE TENER SU VENDEDOR (22-09-2026).
--
-- Santos, después de la reunión: «voy a hacer más campañas como quedé con
-- Carlos, para Brenda y para Ariana, norte y sur del Perú… ¿cómo
-- redireccionaríamos directamente? Al crear la campaña en Meta solo me pide
-- poner el teléfono».
--
-- En Meta todos los anuncios apuntan al MISMO número (el de la Cloud API):
-- no hay forma de repartir desde allá. El reparto es acá: cada anuncio llega
-- con su `source_id`, el CRM lo reconoce como campaña (0262/0264) y, desde
-- esta migración, la campaña dice de quién es. Si no lo dice, sigue el turno
-- del día como hasta ahora.
--
-- El orden de decisión al entrar un WhatsApp de anuncio:
--   1. ¿El número ya es cliente de otro comercial? → se retiene para Central.
--   2. ¿La campaña tiene dueño? → va a ese comercial.
--   3. Si no → al comercial de turno del día (wa_turnos).

alter table campanias_whatsapp
  add column if not exists comercial_id uuid references perfiles (id);

comment on column campanias_whatsapp.comercial_id is
  'El comercial que atiende los contactos de ESTA campaña (0266). Nulo = al turno del día.';

create or replace function asignar_lead_desde_whatsapp(p_lead_id uuid, p_conversacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead         leads%rowtype;
  v_dia          smallint;
  v_turno        uuid;
  v_turno_nombre text;
  v_turno_codigo text;
  v_por_campania boolean := false;
  v_central      uuid;
  v_juego        record;
  v_oportunidad  uuid;
  v_error        text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead is null then
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'No existe el contacto');
  end if;
  if v_lead.estado <> 'pendiente_triaje' or v_lead.area_destino <> 'comercial' then
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'El contacto ya no está en triaje comercial');
  end if;

  -- 1. EL DUEÑO DE LA CAMPAÑA (0266). La campaña del norte es de Brenda y la
  --    del sur de Ariana: su anuncio va a su vendedora, no al turno.
  if v_lead.codigo_campania_wa is not null then
    select c.comercial_id, p.nombre, p.codigo_comercial
      into v_turno, v_turno_nombre, v_turno_codigo
      from campanias_whatsapp c
      join perfiles p on p.id = c.comercial_id
     where c.codigo = v_lead.codigo_campania_wa
       and p.rol = 'comercial' and p.activo;
    v_por_campania := v_turno is not null;
  end if;

  -- 2. El turno de HOY en Lima, para las campañas sin dueño.
  if v_turno is null then
    v_dia := extract(dow from (now() at time zone 'America/Lima'))::smallint;
    select t.comercial_id, p.nombre, p.codigo_comercial
      into v_turno, v_turno_nombre, v_turno_codigo
      from wa_turnos t
      join perfiles p on p.id = t.comercial_id
     where t.dia_semana = v_dia
       and p.rol = 'comercial' and p.activo;
  end if;

  if v_turno is null then
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_sin_turno', 'Hoy no hay comercial de turno; queda en la bandeja de Central');
    return jsonb_build_object('resultado', 'retenido_sin_turno');
  end if;

  -- LA VALIDACIÓN PREVIA que pidió Santos: si el número (o el RUC) ya es de
  -- un cliente con dueño distinto, no se asigna: se retiene para Central.
  select * into v_juego from cartera_en_juego(p_lead_id, v_turno);
  if v_juego.cuenta_id is not null then
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, cuenta_id, dueno_cartera, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_cartera_ajena', v_turno, v_juego.cuenta_id, v_juego.dueno_id,
            format('%s ya es cliente de %s (%s)', v_juego.razon_social, v_juego.dueno_nombre, coalesce(v_juego.dueno_codigo, 's/c')));
    return jsonb_build_object(
      'resultado', 'retenido_cartera_ajena',
      'cuenta_id', v_juego.cuenta_id, 'razon_social', v_juego.razon_social,
      'dueno_id', v_juego.dueno_id, 'dueno_nombre', v_juego.dueno_nombre, 'dueno_codigo', v_juego.dueno_codigo,
      'comercial_turno', v_turno, 'comercial_nombre', v_turno_nombre, 'comercial_codigo', v_turno_codigo);
  end if;

  select id into v_central from perfiles where rol = 'central' and activo and not es_prueba order by created_at limit 1;
  if v_central is null then
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_error', v_turno, 'No hay cuenta de Central activa para firmar la derivación');
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'Sin cuenta de Central');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_central, 'role', 'authenticated')::text, true);

  begin
    v_oportunidad := asignar_lead(p_lead_id, v_turno, 'nuevo_lead', null);
  exception when others then
    v_error := sqlerrm;
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_error', v_turno, left(v_error, 500));
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', v_error);
  end;

  update asignaciones
     set notas = coalesce(notas || ' · ', '') ||
         case when v_por_campania
              then format('Asignación automática: WhatsApp de la campaña %s (0266)', v_lead.codigo_campania_wa)
              else 'Asignación automática: WhatsApp de campaña, turno del día (0262)' end
   where lead_id = p_lead_id and created_at > now() - interval '1 minute';

  update wa_conversaciones set asignado_a = v_turno where id = p_conversacion_id;

  insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, cuenta_id, detalle)
  select p_lead_id, p_conversacion_id, v_lead.telefono, 'asignado', v_turno, l.cuenta_id,
         format('Asignado a %s (%s) %s', v_turno_nombre, coalesce(v_turno_codigo, 's/c'),
                case when v_por_campania then 'por la campaña ' || v_lead.codigo_campania_wa else 'por el turno del día' end)
    from leads l where l.id = p_lead_id;

  return jsonb_build_object(
    'resultado', 'asignado',
    'comercial_id', v_turno, 'comercial_nombre', v_turno_nombre, 'comercial_codigo', v_turno_codigo,
    'por_campania', v_por_campania,
    'oportunidad_id', v_oportunidad);
end;
$$;

revoke all on function asignar_lead_desde_whatsapp(uuid, uuid) from public;
revoke all on function asignar_lead_desde_whatsapp(uuid, uuid) from authenticated;
grant execute on function asignar_lead_desde_whatsapp(uuid, uuid) to service_role;
