-- MUDAR UNA SOLICITUD NO SE LLEVA UN EXPEDIENTE QUE NO ES SUYO (corrige la 0354).
--
-- Probado con PRO-09964 el mismo 30-09: esa solicitud ya cuelga del hilo de
-- Rubí en Vidawasi (8 gestiones desde julio, el de la tarjeta de panel). Con
-- la 0354, volver a mudarla se habría llevado el hilo entero a la otra ficha,
-- porque la función mudaba «el expediente de la solicitud» sin mirar si había
-- nacido de ella. Pasa igual con las que se suman a un expediente abierto
-- («el cliente volvió a escribir», 0141).
--
-- Regla: el expediente se muda con la solicitud SOLO si nació de ella
-- (`oportunidades.lead_id` = la solicitud). Si la solicitud se había sumado a
-- otro, se muda ella sola y allá se suma al expediente abierto de la misma
-- persona; si allá no hay ninguno, no se inventa: se dice y lo arregla Central.
--
-- La decisión vive en UNA función (`plan_mover_solicitud`) que usan la vista
-- previa y la mudanza, para que la pantalla nunca prometa otra cosa que la
-- que después hace la base.

create or replace function public.plan_mover_solicitud(p_lead_id uuid, p_cuenta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_lead      leads%rowtype;
  v_op        oportunidades%rowtype;
  v_destino   cuentas%rowtype;
  v_propio    boolean := false;
  v_gestiones integer := 0;
  v_nuevo_com uuid;
  v_viva      uuid;
  v_bloqueo   text;
begin
  select * into v_lead from leads where id = p_lead_id;
  select * into v_destino from cuentas where id = p_cuenta_id;
  if v_lead.id is null then return jsonb_build_object('bloqueo', 'Ese contacto no existe.'); end if;
  if v_destino.id is null or v_destino.fusionada_en is not null then
    return jsonb_build_object('bloqueo', 'Esa ficha de cliente no existe o ya se unió a otra. Búsquela de nuevo.');
  end if;
  if v_destino.id = v_lead.cuenta_id then
    return jsonb_build_object('bloqueo', format('La solicitud ya está en la ficha de %s.', v_destino.razon_social));
  end if;
  if not v_lead.es_prueba and exists (select 1 from perfiles p where p.id = v_destino.comercial_id and p.es_prueba) then
    return jsonb_build_object('bloqueo', 'Esa ficha es del banco de pruebas. No se le puede mudar una solicitud real.');
  end if;

  if v_lead.oportunidad_id is not null then
    select * into v_op from oportunidades where id = v_lead.oportunidad_id;
  end if;
  v_propio := v_op.id is not null and v_op.lead_id = p_lead_id;

  if v_propio then
    if exists (select 1 from cotizaciones q where q.oportunidad_id = v_op.id)
       or exists (select 1 from ventas v where v.oportunidad_id = v_op.id)
       or exists (select 1 from informes_cierre i where i.oportunidad_id = v_op.id)
       or exists (select 1 from servicios_postventa s where s.oportunidad_id = v_op.id) then
      v_bloqueo := 'Ese expediente ya tiene cotización, venta o servicio a nombre del otro cliente. Pídale a gerencia u operaciones que lo corrija: hay documentos que cambiar.';
    end if;
    select count(*) into v_gestiones
      from actividades a join perfiles p on p.id = a.realizada_por
     where a.oportunidad_id = v_op.id and p.rol::text <> 'admin';
  elsif v_op.id is not null then
    -- Hilo ajeno: cuenta solo lo que se hizo desde que llegó esta solicitud.
    select count(*) into v_gestiones
      from actividades a join perfiles p on p.id = a.realizada_por
     where a.oportunidad_id = v_op.id and p.rol::text <> 'admin'
       and a.realizada_at >= coalesce(v_lead.recibido_at, v_lead.created_at);
  end if;

  v_nuevo_com := v_op.comercial_id;
  if v_propio and v_op.tipo_postventa is null
     and v_destino.comercial_id is not null and v_destino.comercial_id <> v_op.comercial_id then
    v_nuevo_com := v_destino.comercial_id;
  end if;

  -- Dónde se suma allá: al expediente abierto de la misma persona y de la
  -- misma clase (postventa con postventa, comercial con comercial). Con el
  -- propio, solo si el que se muda está vacío: con historia, viaja entero.
  if v_op.id is not null and (not v_propio or v_gestiones = 0) then
    select o.id into v_viva
      from oportunidades o
     where o.cuenta_id = v_destino.id
       and o.comercial_id is not distinct from v_nuevo_com
       and o.cerrada_at is null
       and o.etapa::text not in ('historico', 'rechazada', 'venta', 'derivada')
       and (o.tipo_postventa is null) = (v_op.tipo_postventa is null)
     order by o.updated_at desc
     limit 1;
  end if;

  if v_op.id is not null and not v_propio and v_viva is null and v_bloqueo is null then
    v_bloqueo := format(
      'Esta solicitud está dentro de un expediente con más historia, y en %s no hay un expediente abierto de %s donde sumarla. Pídale a Central que la derive de nuevo a esa ficha.',
      v_destino.razon_social,
      coalesce((select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = v_op.comercial_id), 'quien la atiende'));
  end if;

  return jsonb_build_object(
    'bloqueo', v_bloqueo,
    'propio', v_propio,
    'op', v_op.id,
    'op_comercial', v_op.comercial_id,
    'nuevo_com', v_nuevo_com,
    'viva', v_viva,
    'gestiones', v_gestiones,
    'pide_codigo', v_gestiones > 0 or v_nuevo_com is distinct from v_op.comercial_id
  );
end $function$;

revoke all on function public.plan_mover_solicitud(uuid, uuid) from public, anon;
-- Solo la usan las dos de abajo (security definer): nadie la llama de afuera.

create or replace function public.previa_mover_solicitud(p_lead_id uuid, p_cuenta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_plan jsonb;
begin
  if not puede_corregir_solicitud(p_lead_id) then
    return jsonb_build_object('bloqueo', 'Una solicitud la cambia de cliente quien la registró, Central o gerencia.');
  end if;
  v_plan := plan_mover_solicitud(p_lead_id, p_cuenta_id);
  return jsonb_build_object(
    'bloqueo', v_plan->>'bloqueo',
    'pide_codigo', coalesce((v_plan->>'pide_codigo')::boolean, false),
    'gestiones', coalesce((v_plan->>'gestiones')::integer, 0),
    'tiene_expediente', v_plan->>'op' is not null,
    'expediente_propio', coalesce((v_plan->>'propio')::boolean, false),
    'atiende_ahora', (select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = (v_plan->>'op_comercial')::uuid),
    'atendera', (select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = (v_plan->>'nuevo_com')::uuid),
    'suma_a_expediente_abierto', v_plan->>'viva' is not null
  );
end $function$;

create or replace function public.mover_solicitud_a_otra_ficha(
  p_lead_id   uuid,
  p_cuenta_id uuid,
  p_motivo    text,
  p_pin       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quien      uuid := auth.uid();
  v_lead       leads%rowtype;
  v_origen     cuentas%rowtype;
  v_destino    cuentas%rowtype;
  v_op         oportunidades%rowtype;
  v_plan       jsonb;
  v_motivo     text := btrim(coalesce(p_motivo, ''));
  v_propio     boolean;
  v_viva       uuid;
  v_nuevo_com  uuid;
  v_autorizo   uuid;
  v_contactos  integer := 0;
  v_resto      integer;
  v_cerrada    boolean := false;
  v_quien_nom  text;
  v_queda_en   uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(v_motivo) < 10 then
    raise exception 'Diga en una frase de quién es y cómo se dio cuenta. Queda en las dos fichas.';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;
  if not puede_corregir_solicitud(p_lead_id) then
    raise exception 'Una solicitud la cambia de cliente quien la registró, Central o gerencia.';
  end if;

  select * into v_destino from cuentas where id = p_cuenta_id for update;
  v_plan := plan_mover_solicitud(p_lead_id, p_cuenta_id);
  if v_plan->>'bloqueo' is not null then raise exception '%', v_plan->>'bloqueo'; end if;

  v_propio    := coalesce((v_plan->>'propio')::boolean, false);
  v_viva      := (v_plan->>'viva')::uuid;
  v_nuevo_com := (v_plan->>'nuevo_com')::uuid;
  if coalesce((v_plan->>'pide_codigo')::boolean, false) then
    v_autorizo := validar_codigo_autorizacion(p_pin, 'derivacion');
  end if;

  select * into v_origen from cuentas where id = v_lead.cuenta_id;
  if v_lead.oportunidad_id is not null then
    select * into v_op from oportunidades where id = v_lead.oportunidad_id for update;
  end if;
  select coalesce(codigo_comercial || ' · ', '') || nombre into v_quien_nom from perfiles where id = v_quien;

  -- 1) LA SOLICITUD, con la memoria de dónde estaba.
  update leads
     set cuenta_id    = v_destino.id,
         razon_social = v_destino.razon_social,
         num_doc      = case when v_destino.tipo_doc <> 'SIN_DOC' and v_destino.num_doc is not null
                             then v_destino.num_doc else num_doc end,
         asignado_a   = case when v_nuevo_com is distinct from v_op.comercial_id then v_nuevo_com else asignado_a end,
         oportunidad_id = coalesce(v_viva, oportunidad_id),
         datos_originales = coalesce(datos_originales, '{}'::jsonb) || jsonb_build_object(
           'movido_de_ficha', jsonb_build_object(
             'cuenta_id', v_origen.id, 'razon_social', v_lead.razon_social,
             'oportunidad_id', v_lead.oportunidad_id, 'asignado_a', v_lead.asignado_a,
             'motivo', v_motivo, 'por', v_quien, 'at', now())),
         updated_at   = now()
   where id = p_lead_id;

  -- 2) EL EXPEDIENTE.
  if v_op.id is not null then
    if v_viva is not null and v_propio then
      -- El suyo estaba vacío: se archiva con la nota de a dónde se fue.
      update oportunidades set etapa = 'historico', updated_at = now() where id = v_op.id;
      insert into actividades (oportunidad_id, tipo, nota, realizada_por)
      values (v_op.id, 'nota', format(
        'Expediente archivado: la solicitud %s no era de %s sino de %s. La mudó %s: «%s». Siguió en el expediente que ya estaba abierto allá.',
        coalesce(v_lead.codigo, ''), coalesce(v_origen.razon_social, 'esta ficha'), v_destino.razon_social, v_quien_nom, v_motivo), v_quien);
    elsif v_viva is not null then
      -- Hilo ajeno: el hilo se queda; solo se anota que la solicitud se fue.
      insert into actividades (oportunidad_id, tipo, nota, realizada_por)
      values (v_op.id, 'nota', format(
        'La solicitud %s se había sumado acá por error: era de %s. La mudó %s: «%s».',
        coalesce(v_lead.codigo, ''), v_destino.razon_social, v_quien_nom, v_motivo), v_quien);
    else
      -- El propio, con historia o sin dónde sumarse: viaja entero.
      update oportunidades
         set cuenta_id = v_destino.id, comercial_id = v_nuevo_com, updated_at = now()
       where id = v_op.id;
      update asignaciones set cuenta_id = v_destino.id
       where lead_id = p_lead_id and cuenta_id is distinct from v_destino.id;
    end if;

    v_queda_en := coalesce(v_viva, v_op.id);
    update oportunidades set updated_at = now() where id = v_queda_en;
    insert into actividades (oportunidad_id, tipo, nota, realizada_por)
    values (v_queda_en, 'nota', format(
      'La solicitud %s llegó desde la ficha de %s, donde se había registrado por error. La mudó %s: «%s».',
      coalesce(v_lead.codigo, ''), coalesce(v_origen.razon_social, 'otro cliente'), v_quien_nom, v_motivo), v_quien);
  end if;

  if v_destino.comercial_id is null and v_propio and v_op.tipo_postventa is null and v_nuevo_com is not null then
    update cuentas set comercial_id = v_nuevo_com, cartera_desde = hoy_lima(), updated_at = now()
     where id = v_destino.id;
  end if;

  -- 3) LA PERSONA QUE TRAJO ESTA SOLICITUD, y nada más (ver 0354).
  if v_origen.id is not null then
    update contactos ct
       set cuenta_id = v_destino.id, es_principal = false
     where ct.cuenta_id = v_origen.id
       and v_lead.telefono_normalizado is not null
       and ct.telefono_normalizado = v_lead.telefono_normalizado
       and not exists (select 1 from leads o where o.cuenta_id = v_origen.id and o.id <> p_lead_id
                          and o.telefono_normalizado = ct.telefono_normalizado)
       and not exists (select 1 from contactos d where d.cuenta_id = v_destino.id
                          and d.telefono_normalizado = ct.telefono_normalizado);
    get diagnostics v_contactos = row_count;

    if v_lead.email is not null then
      update contactos ct
         set email = null
       where ct.cuenta_id = v_origen.id
         and lower(ct.email) = lower(v_lead.email)
         and not exists (select 1 from leads o where o.cuenta_id = v_origen.id and o.id <> p_lead_id
                            and lower(o.email) = lower(v_lead.email));
    end if;

    -- 4) La ficha de origen se cierra solo si la abrió esta solicitud y quedó vacía.
    select
      (select count(*) from leads                   where cuenta_id = v_origen.id)
    + (select count(*) from oportunidades           where cuenta_id = v_origen.id)
    + (select count(*) from contactos               where cuenta_id = v_origen.id)
    + (select count(*) from asignaciones            where cuenta_id = v_origen.id)
    + (select count(*) from atenciones              where cuenta_id = v_origen.id)
    + (select count(*) from cotizaciones_historicas where cuenta_id = v_origen.id)
    + (select count(*) from informes_cierre         where cuenta_id = v_origen.id)
    + (select count(*) from informes_servicio       where cuenta_id = v_origen.id)
    + (select count(*) from servicios_postventa     where cuenta_id = v_origen.id)
    + (select count(*) from soporte_tecnico         where cuenta_id = v_origen.id)
    + (select count(*) from equipos_instalados      where cuenta_id = v_origen.id)
    + (select count(*) from sunat_candidatos        where cuenta_id = v_origen.id or ruc_ya_en_cuenta = v_origen.id)
    + (select count(*) from inventario_equipos      where reservado_para = v_origen.id)
    + (select count(*) from cuentas                 where cuenta_padre_id = v_origen.id)
      into v_resto;
    if coalesce(v_resto, 0) = 0 and v_origen.created_at >= coalesce(v_lead.recibido_at, v_lead.created_at) - interval '1 minute' then
      delete from cuentas where id = v_origen.id;
      v_cerrada := true;
    end if;
  end if;

  insert into lead_solicitud_cambios (lead_id, tipo, cuenta_antes, cuenta_despues, antes, despues, motivo, hecho_por, autorizo)
  values (p_lead_id, 'ficha', case when v_cerrada then null else v_origen.id end, v_destino.id,
          v_origen.razon_social, v_destino.razon_social, v_motivo, v_quien, v_autorizo);

  -- Avisos: a quien la tenía y a quien la recibe, si no es quien la mudó.
  if v_lead.asignado_a is not null and v_lead.asignado_a <> v_quien then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (v_lead.asignado_a, 'solicitud_movida',
            format('%s era de otro cliente', coalesce(v_lead.codigo, 'Una solicitud suya')),
            format('%s la mudó de %s a %s: «%s».', coalesce(v_quien_nom, 'Alguien'),
                   coalesce(v_origen.razon_social, 'otra ficha'), v_destino.razon_social, v_motivo),
            case when v_queda_en is not null then '/comercial/oportunidades/' || v_queda_en::text end);
  end if;
  if v_viva is not null then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    select o.comercial_id, 'solicitud_movida',
           format('Se sumó %s a su expediente de %s', coalesce(v_lead.codigo, 'una solicitud'), v_destino.razon_social),
           format('Estaba por error en la ficha de %s. Dice: «%s»', coalesce(v_origen.razon_social, 'otro cliente'), left(coalesce(v_lead.mensaje, ''), 280)),
           '/comercial/oportunidades/' || o.id
      from oportunidades o
     where o.id = v_viva and o.comercial_id is not null
       and o.comercial_id <> v_quien and o.comercial_id is distinct from v_lead.asignado_a;
  end if;

  return jsonb_build_object(
    'destino', v_destino.razon_social,
    'origen', v_origen.razon_social,
    'expediente', v_queda_en,
    'sumada_a_expediente_abierto', v_viva is not null,
    'contactos_mudados', v_contactos,
    'ficha_cerrada', v_cerrada,
    'con_codigo', v_autorizo is not null
  );
end $function$;

revoke all on function public.previa_mover_solicitud(uuid, uuid) from public, anon;
grant execute on function public.previa_mover_solicitud(uuid, uuid) to authenticated;
revoke all on function public.mover_solicitud_a_otra_ficha(uuid, uuid, text, text) from public, anon;
grant execute on function public.mover_solicitud_a_otra_ficha(uuid, uuid, text, text) to authenticated;
