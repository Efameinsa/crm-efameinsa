-- ============================================================
-- CRM EFAMEINSA · Migración 0408 · El cliente rechazado que vuelve a
-- escribir por WhatsApp: el chat va al dueño de la ficha y se le abre
-- el seguimiento
-- ============================================================
-- Ariana (C4), 06-10-2026, con el chat «ss» (SANTOS MAMANI RAMOS): el
-- cliente seguía pidiendo «precio de 17 kilos» y a ella no le salía
-- «Registrar gestión»; al marcar «No contesta» el CRM respondía «no tiene
-- expediente abierto». El chat era de Ariana (reparto de retenidos del
-- 05-10), pero la ficha y el expediente eran de Katerine, que lo había
-- cerrado como rechazado el 23-09. Ese día había 17 chats abiertos en los
-- que el cliente escribió DESPUÉS del rechazo (PRO-09882 daba los datos
-- para cotizar) y en 3 el chat y la ficha eran de personas distintas.
-- Santos (gerencia), 06-10: que el chat vuelva al comercial de la ficha y
-- que desde el chat se abra el seguimiento.
--
-- 1. wa_chat_al_dueno_de_la_ficha(conv): la llama el webhook cuando entra un
--    mensaje a un chat abierto cuyo expediente está rechazado. Si la ficha
--    es de un comercial activo distinto del que tiene el chat, el chat pasa
--    a él. Devuelve quién lo tenía para avisarle.
--
-- 2. wa_abrir_seguimiento(conv): el botón «Volvió a escribir: abrir
--    seguimiento» del chat. Lo usa quien tiene el chat y es dueño de la
--    ficha. Si ya tiene un expediente vivo con ese cliente, la gestión va
--    ahí (un expediente por cliente); si no, reabre el rechazado en
--    seguimiento. Deja anotado por qué y devuelve el expediente.
-- ============================================================

create or replace function public.wa_chat_al_dueno_de_la_ficha(p_conversacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conv   wa_conversaciones%rowtype;
  v_lead   leads%rowtype;
  v_etapa  text;
  v_dueno  uuid;
  v_razon  text;
  v_nombre text;
  v_codigo text;
begin
  select * into v_conv from wa_conversaciones where id = p_conversacion_id for update;
  if v_conv.id is null or v_conv.estado = 'cerrada' or v_conv.lead_id is null then return null; end if;

  select * into v_lead from leads where id = v_conv.lead_id;
  if v_lead.oportunidad_id is null or v_lead.cuenta_id is null then return null; end if;

  select etapa::text into v_etapa from oportunidades where id = v_lead.oportunidad_id;
  if v_etapa is distinct from 'rechazada' then return null; end if;

  select c.comercial_id, c.razon_social into v_dueno, v_razon from cuentas c where c.id = v_lead.cuenta_id;
  if v_dueno is null or v_dueno = v_conv.asignado_a then return null; end if;

  select p.nombre, p.codigo_comercial into v_nombre, v_codigo
    from perfiles p where p.id = v_dueno and p.rol = 'comercial' and p.activo;
  if v_nombre is null then return null; end if;

  update wa_conversaciones set asignado_a = v_dueno where id = v_conv.id;

  return jsonb_build_object(
    'antes', v_conv.asignado_a,
    'ahora', v_dueno,
    'ahora_nombre', v_nombre,
    'ahora_codigo', v_codigo,
    'razon_social', v_razon,
    'lead_codigo', v_lead.codigo
  );
end;
$function$;

revoke all on function public.wa_chat_al_dueno_de_la_ficha(uuid) from public, anon, authenticated;
grant execute on function public.wa_chat_al_dueno_de_la_ficha(uuid) to service_role;


create or replace function public.wa_abrir_seguimiento(p_conversacion_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_yo      uuid := auth.uid();
  v_conv    wa_conversaciones%rowtype;
  v_lead    leads%rowtype;
  v_op      oportunidades%rowtype;
  v_dueno   uuid;
  v_dueno_n text;
  v_destino uuid;
  v_volvio  timestamptz;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;

  select * into v_conv from wa_conversaciones where id = p_conversacion_id;
  if v_conv.id is null then raise exception 'El chat no existe'; end if;
  if v_conv.asignado_a is distinct from v_yo then raise exception 'Este chat lo atiende otra persona'; end if;

  select * into v_lead from leads where id = v_conv.lead_id;
  if v_lead.oportunidad_id is null or v_lead.cuenta_id is null then
    raise exception 'Este contacto no tiene ficha ni expediente: pídale a Central que lo derive';
  end if;

  select * into v_op from oportunidades where id = v_lead.oportunidad_id for update;
  if v_op.etapa::text <> 'rechazada' then raise exception 'El expediente de este contacto no está cerrado como rechazado'; end if;

  select c.comercial_id, p.nombre into v_dueno, v_dueno_n
    from cuentas c left join perfiles p on p.id = c.comercial_id
   where c.id = v_lead.cuenta_id;
  if v_dueno is distinct from v_yo then
    raise exception 'Este cliente es de la cartera de %: el seguimiento lo abre esa persona', coalesce(v_dueno_n, 'otro comercial');
  end if;

  v_volvio := coalesce(v_conv.ultimo_mensaje_cliente_at, now());

  -- Un expediente por cliente: si ya tiene uno vivo con este cliente, ahí.
  select o.id into v_destino
    from oportunidades o
   where o.cuenta_id = v_lead.cuenta_id
     and o.comercial_id = v_yo
     and o.id <> v_op.id
     and o.cerrada_at is null
     and o.tipo_postventa is null
     and o.etapa::text not in ('venta', 'rechazada', 'derivada', 'historico')
   order by o.updated_at desc
   limit 1;

  if v_destino is null then
    update oportunidades
       set etapa = 'seguimiento',
           cerrada_at = null,
           motivo_rechazo_id = null,
           comercial_id = v_yo,
           updated_at = now()
     where id = v_op.id;
    v_destino := v_op.id;
  else
    update leads set oportunidad_id = v_destino, updated_at = now() where id = v_lead.id;
  end if;

  insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
  values (
    v_destino,
    'nota',
    format(
      'El cliente volvió a escribir por WhatsApp el %s, después de que el expediente se cerrara como rechazado el %s: se abre el seguimiento%s.',
      to_char(v_volvio at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
      coalesce(to_char(v_op.cerrada_at at time zone 'America/Lima', 'DD-MM-YYYY'), 'antes'),
      case when v_destino <> v_op.id then ' en el expediente que ya estaba abierto' else '' end
    ),
    v_yo,
    now()
  );

  return v_destino;
end;
$function$;

revoke all on function public.wa_abrir_seguimiento(uuid) from public, anon;
grant execute on function public.wa_abrir_seguimiento(uuid) to authenticated, service_role;
