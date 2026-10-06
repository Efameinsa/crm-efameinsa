-- ============================================================
-- CRM EFAMEINSA · Migración 0395 · El WhatsApp de un cliente va a su
-- comercial, y el número que escribe en el chat también se revisa
-- ============================================================
-- Central, 05-10-2026, con capturas: chats «Sin comercial · X ya es cliente
-- de Brenda» del 21-09 que nadie derivó («¿por qué se cerró la conversación?
-- ¿igual pudo derivar a la comercial correspondiente?»). Desde la 0262 el
-- chat de un número que ya era cliente de otro comercial se RETENÍA en la
-- bandeja de Central; el contacto sí se repartía, pero el chat quedaba sin
-- dueño y la ventana de 72 h se cerraba sin respuesta. Había 41 así.
-- Santos (gerencia), 05-10: derivarlos al dueño y cambiar la regla.
--
-- 1. asignar_lead_desde_whatsapp: si el número ya es de un cliente con
--    comercial activo, el chat va a ESE comercial (no al dueño de la campaña
--    ni al turno). Solo se retiene si el dueño ya no es un comercial activo.
--
-- 2. El cruce de Alvaro Quiroz (05-10): cliente de C9 (ROKARENA SAC), volvió
--    a escribir con su número OCULTO (@AlvaroQuiSan) desde el anuncio de
--    Moisés y le llegó a C2. Sin número no hay con qué empatar la cartera;
--    el número apareció después, escrito en el chat. Ahora, cuando un cliente
--    sin número visible escribe un celular, se busca de quién es y se avisa
--    una sola vez (Central, el dueño y quien tiene el chat).
-- ============================================================

create or replace function public.asignar_lead_desde_whatsapp(p_lead_id uuid, p_conversacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead         leads%rowtype;
  v_dia          smallint;
  v_turno        uuid;
  v_turno_nombre text;
  v_turno_codigo text;
  v_por_campania boolean := false;
  v_por_cartera  boolean := false;
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

  -- 1. EL DUEÑO DE LA CAMPAÑA (0266).
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

  -- 3. EL CLIENTE YA TIENE COMERCIAL (0395): el chat va a su dueño. Se
  --    retiene para Central solo si ese dueño ya no es un comercial activo.
  select * into v_juego from cartera_en_juego(p_lead_id, v_turno);
  if v_juego.cuenta_id is not null then
    if exists (select 1 from perfiles p where p.id = v_juego.dueno_id and p.rol = 'comercial' and p.activo) then
      v_turno := v_juego.dueno_id;
      v_turno_nombre := v_juego.dueno_nombre;
      v_turno_codigo := v_juego.dueno_codigo;
      v_por_cartera := true;
      v_por_campania := false;
    else
      insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, cuenta_id, dueno_cartera, detalle)
      values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_cartera_ajena', v_turno, v_juego.cuenta_id, v_juego.dueno_id,
              format('%s ya es cliente de %s (%s), que no está activo como comercial', v_juego.razon_social, v_juego.dueno_nombre, coalesce(v_juego.dueno_codigo, 's/c')));
      return jsonb_build_object(
        'resultado', 'retenido_cartera_ajena',
        'cuenta_id', v_juego.cuenta_id, 'razon_social', v_juego.razon_social,
        'dueno_id', v_juego.dueno_id, 'dueno_nombre', v_juego.dueno_nombre, 'dueno_codigo', v_juego.dueno_codigo,
        'comercial_turno', v_turno, 'comercial_nombre', v_turno_nombre, 'comercial_codigo', v_turno_codigo);
    end if;
  end if;

  select id into v_central from perfiles where rol = 'central' and activo and not es_prueba order by created_at limit 1;
  if v_central is null then
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_error', v_turno, 'No hay cuenta de Central activa para firmar la derivación');
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'Sin cuenta de Central');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_central, 'role', 'authenticated')::text, true);

  begin
    v_oportunidad := asignar_lead(p_lead_id, v_turno, case when v_por_cartera then 'cartera_existente' else 'nuevo_lead' end::motivo_asignacion, null);
  exception when others then
    v_error := sqlerrm;
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_error', v_turno, left(v_error, 500));
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', v_error);
  end;

  update asignaciones
     set notas = coalesce(notas || ' · ', '') ||
         case when v_por_cartera
              then format('Asignación automática: WhatsApp de un cliente de su cartera (%s) (0395)', v_juego.razon_social)
              when v_por_campania
              then format('Asignación automática: WhatsApp de la campaña %s (0266)', v_lead.codigo_campania_wa)
              else 'Asignación automática: WhatsApp de campaña, turno del día (0262)' end
   where lead_id = p_lead_id and created_at > now() - interval '1 minute';

  update wa_conversaciones set asignado_a = v_turno where id = p_conversacion_id;

  insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, cuenta_id, dueno_cartera, detalle)
  select p_lead_id, p_conversacion_id, v_lead.telefono, 'asignado', v_turno, l.cuenta_id,
         case when v_por_cartera then v_turno end,
         format('Asignado a %s (%s) %s', v_turno_nombre, coalesce(v_turno_codigo, 's/c'),
                case when v_por_cartera then 'porque ya es cliente suyo: ' || v_juego.razon_social
                     when v_por_campania then 'por la campaña ' || v_lead.codigo_campania_wa
                     else 'por el turno del día' end)
    from leads l where l.id = p_lead_id;

  return jsonb_build_object(
    'resultado', 'asignado',
    'comercial_id', v_turno, 'comercial_nombre', v_turno_nombre, 'comercial_codigo', v_turno_codigo,
    'por_campania', v_por_campania,
    'por_cartera', v_por_cartera,
    'razon_social', case when v_por_cartera then v_juego.razon_social end,
    'oportunidad_id', v_oportunidad);
end;
$function$;

-- ------------------------------------------------------------
-- 2. El número que el cliente escribe en el chat
-- ------------------------------------------------------------
alter table public.wa_conversaciones
  add column if not exists telefono_escrito_avisado_at timestamptz;

comment on column public.wa_conversaciones.telefono_escrito_avisado_at is
  'Cuándo se avisó que el celular escrito en el chat (cliente con número oculto) ya era de otro comercial. Un solo aviso por chat (0395).';

-- Devuelve una fila si el texto trae un celular peruano que ya es de un
-- cliente o de un contacto vigente de OTRO comercial que el que tiene el
-- chat. Marca el chat para no volver a avisar. Solo service_role (webhook).
create or replace function public.telefono_escrito_de_otro_comercial(p_conversacion_id uuid, p_texto text)
returns table(telefono text, cuenta_id uuid, razon_social text, dueno_id uuid, dueno_nombre text, dueno_codigo text, codigo_lead text, asignado_a uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conv   wa_conversaciones%rowtype;
  v_tel    text;
  v_cuenta uuid;
  v_razon  text;
  v_dueno  uuid;
  v_lead   text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado';
  end if;

  select * into v_conv from wa_conversaciones where id = p_conversacion_id;
  -- Solo los chats sin número visible (@usuario): en los demás el número ya
  -- se empató al entrar.
  if v_conv.id is null or v_conv.telefono ~ '^[0-9]+$' or v_conv.telefono_escrito_avisado_at is not null then
    return;
  end if;

  -- Un celular peruano: 9 dígitos que empiezan en 9, con o sin 51 y con
  -- espacios o guiones entre medio («932 616 427», «+51 932-616-427»).
  v_tel := (regexp_match(regexp_replace(coalesce(p_texto, ''), '[ .-]', '', 'g'), '(?:\+?51)?(9[0-9]{8})(?![0-9])'))[1];
  if v_tel is null then return; end if;

  select c.id, c.razon_social, c.comercial_id into v_cuenta, v_razon, v_dueno
    from contactos ct join cuentas c on c.id = ct.cuenta_id
   where ct.telefono_normalizado = v_tel and c.fusionada_en is null and c.comercial_id is not null
   order by c.updated_at desc nulls last
   limit 1;

  if v_dueno is null then
    select l.codigo, l.asignado_a, l.cuenta_id into v_lead, v_dueno, v_cuenta
      from leads l
     where l.telefono_normalizado = v_tel and l.estado = 'asignado' and l.asignado_a is not null
       and l.created_at > now() - interval '90 days'
     order by l.created_at desc
     limit 1;
    if v_cuenta is not null then select c.razon_social into v_razon from cuentas c where c.id = v_cuenta; end if;
  end if;

  if v_dueno is null or v_dueno = v_conv.asignado_a then return; end if;
  if not exists (select 1 from perfiles p where p.id = v_dueno and p.activo) then return; end if;

  update wa_conversaciones set telefono_escrito_avisado_at = now() where id = p_conversacion_id;

  return query
    select v_tel, v_cuenta, v_razon, p.id, p.nombre, p.codigo_comercial, v_lead, v_conv.asignado_a
      from perfiles p where p.id = v_dueno;
end;
$function$;

revoke all on function public.telefono_escrito_de_otro_comercial(uuid, text) from public, anon, authenticated;
grant execute on function public.telefono_escrito_de_otro_comercial(uuid, text) to service_role;
