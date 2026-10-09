-- ============================================================
-- CRM EFAMEINSA · Migración 0428 · Los formularios de Meta van al
-- comercial dueño de la campaña
-- ============================================================
-- Santos, 09-10-2026: los videos de octubre salen con una campaña por
-- comercial (UW → Katerine C5, UT → Brenda C1, torre LG → Abel C6) y los
-- formularios de clientes potenciales tienen que llegarle a ese comercial,
-- igual que los WhatsApp de campaña (0266). Los formularios no llegan por el
-- webhook de la página (la página es de otro portafolio): Meta los escribe en
-- un Google Sheets y un Apps Script los manda a /api/webhooks/meta-leads-sheets.
--
-- Reglas (las mismas del WhatsApp, sin el turno del día):
--   1. El anuncio está en `campanias_whatsapp` con comercial activo → a él.
--   2. El cliente ya es de la cartera de otro comercial activo → a su dueño
--      (0395). Si ese dueño ya no está activo → queda para Central.
--   3. Anuncio sin dueño → queda en la bandeja de Central, como dijo Santos
--      el 21-09 para los formularios («Central ya lo derivará»).
-- Cada resultado queda en `wa_asignaciones_automaticas` (conversacion_id
-- nulo = vino de un formulario).
-- ============================================================

create or replace function public.asignar_lead_desde_formulario(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead         leads%rowtype;
  v_destino      uuid;
  v_nombre       text;
  v_codigo       text;
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

  -- 1. El dueño de la campaña.
  if v_lead.codigo_campania_wa is not null then
    select c.comercial_id, p.nombre, p.codigo_comercial
      into v_destino, v_nombre, v_codigo
      from campanias_whatsapp c
      join perfiles p on p.id = c.comercial_id
     where c.codigo = v_lead.codigo_campania_wa
       and p.rol = 'comercial' and p.activo;
  end if;

  -- 3. Sin dueño: Central lo deriva (regla de los formularios, 21-09).
  if v_destino is null then
    insert into wa_asignaciones_automaticas (lead_id, telefono, resultado, detalle)
    values (p_lead_id, v_lead.telefono, 'retenido_sin_turno',
            format('Formulario de Meta sin comercial dueño%s; queda en la bandeja de Central',
                   case when v_lead.codigo_campania_wa is not null then ' (campaña ' || v_lead.codigo_campania_wa || ')' else '' end));
    return jsonb_build_object('resultado', 'central');
  end if;

  -- 2. El cliente ya tiene comercial: va a su dueño (0395).
  select * into v_juego from cartera_en_juego(p_lead_id, v_destino);
  if v_juego.cuenta_id is not null then
    if exists (select 1 from perfiles p where p.id = v_juego.dueno_id and p.rol = 'comercial' and p.activo) then
      v_destino := v_juego.dueno_id;
      v_nombre := v_juego.dueno_nombre;
      v_codigo := v_juego.dueno_codigo;
      v_por_cartera := true;
    else
      insert into wa_asignaciones_automaticas (lead_id, telefono, resultado, comercial_turno, cuenta_id, dueno_cartera, detalle)
      values (p_lead_id, v_lead.telefono, 'retenido_cartera_ajena', v_destino, v_juego.cuenta_id, v_juego.dueno_id,
              format('Formulario de Meta: %s ya es cliente de %s (%s), que no está activo como comercial', v_juego.razon_social, v_juego.dueno_nombre, coalesce(v_juego.dueno_codigo, 's/c')));
      return jsonb_build_object('resultado', 'retenido_cartera_ajena',
        'razon_social', v_juego.razon_social, 'dueno_nombre', v_juego.dueno_nombre, 'dueno_codigo', v_juego.dueno_codigo);
    end if;
  end if;

  select id into v_central from perfiles where rol = 'central' and activo and not es_prueba order by created_at limit 1;
  if v_central is null then
    insert into wa_asignaciones_automaticas (lead_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, v_lead.telefono, 'retenido_error', v_destino, 'Formulario de Meta: no hay cuenta de Central activa para firmar la derivación');
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'Sin cuenta de Central');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_central, 'role', 'authenticated')::text, true);

  begin
    v_oportunidad := asignar_lead(p_lead_id, v_destino, case when v_por_cartera then 'cartera_existente' else 'nuevo_lead' end::motivo_asignacion, null);
  exception when others then
    v_error := sqlerrm;
    insert into wa_asignaciones_automaticas (lead_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, v_lead.telefono, 'retenido_error', v_destino, left('Formulario de Meta: ' || v_error, 500));
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', v_error);
  end;

  update asignaciones
     set notas = coalesce(notas || ' · ', '') ||
         case when v_por_cartera
              then format('Asignación automática: formulario de Meta de un cliente de su cartera (%s) (0428)', v_juego.razon_social)
              else format('Asignación automática: formulario de Meta de la campaña %s (0428)', v_lead.codigo_campania_wa) end
   where lead_id = p_lead_id and created_at > now() - interval '1 minute';

  insert into wa_asignaciones_automaticas (lead_id, telefono, resultado, comercial_turno, cuenta_id, dueno_cartera, detalle)
  select p_lead_id, v_lead.telefono, 'asignado', v_destino, l.cuenta_id,
         case when v_por_cartera then v_destino end,
         format('Formulario de Meta asignado a %s (%s) %s', v_nombre, coalesce(v_codigo, 's/c'),
                case when v_por_cartera then 'porque ya es cliente suyo: ' || v_juego.razon_social
                     else 'por la campaña ' || v_lead.codigo_campania_wa end)
    from leads l where l.id = p_lead_id;

  return jsonb_build_object(
    'resultado', 'asignado',
    'comercial_id', v_destino, 'comercial_nombre', v_nombre, 'comercial_codigo', v_codigo,
    'por_cartera', v_por_cartera,
    'razon_social', case when v_por_cartera then v_juego.razon_social end,
    'oportunidad_id', v_oportunidad);
end;
$function$;

revoke all on function public.asignar_lead_desde_formulario(uuid) from public, anon, authenticated;
grant execute on function public.asignar_lead_desde_formulario(uuid) to service_role;
