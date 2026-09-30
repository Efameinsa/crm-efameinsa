-- CORRIGE LA 0355: un expediente SIN solicitud de origen se tomaba por «propio».
--
-- Visto en la prueba en pantalla del 30-09 con PRO-09964: el hilo de Rubí en
-- Vidawasi no nació de ninguna solicitud (`lead_id` nulo). `lead_id = la
-- solicitud` daba NULL —no false—, y con eso la mudanza ni se bloqueaba ni se
-- sumaba a otro expediente: se habría llevado el hilo entero a la otra ficha.
-- Nadie la usó antes de esta corrección (lead_solicitud_cambios sin filas
-- tipo «ficha»). Ahora es false explícito.

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
  v_propio := coalesce(v_op.lead_id = p_lead_id, false);

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
