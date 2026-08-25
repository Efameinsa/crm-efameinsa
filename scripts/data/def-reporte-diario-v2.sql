CREATE OR REPLACE FUNCTION public.reporte_diario_comercial(p_comercial uuid, p_fecha date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
  v_meta  integer := coalesce((select valor::integer from parametros where clave = 'meta_seguimientos_diarios'), 30);
  v_tc    numeric := coalesce((select valor from parametros where clave = 'tc_usd_pen'), 3.75);
  v_perfil        jsonb;
  v_seguimientos  jsonb;
  v_cotizaciones  jsonb;
  v_ventas        jsonb;
  v_leads         jsonb;
  v_complementarias jsonb;
  v_agenda        jsonb;
  v_plan_gestiones jsonb;
  v_plan_tareas   jsonb;
  v_resumen       jsonb;
begin
  if not es_backoffice() and p_comercial is distinct from auth.uid() then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object('id', id, 'nombre', nombre, 'codigo', codigo_comercial, 'meta_mensual', meta_mensual)
    into v_perfil from perfiles where id = p_comercial;
  if v_perfil is null then
    raise exception 'Comercial no encontrado';
  end if;

  -- 1. SEGUIMIENTOS del día. Se listan TODOS los contactos (incluidos los que
  -- no contestaron, marcados aparte) porque el comercial necesita mostrar el
  -- trabajo hecho, no solo el que salió bien.
  select coalesce(jsonb_agg(jsonb_build_object(
           'hora', to_char(a.realizada_at at time zone 'America/Lima', 'HH24:MI'),
           'cliente', cu.razon_social,
           'tipo', a.tipo::text,
           'nota', a.nota,
           'resultado', r.nombre,
           'efectivo', (a.resultado_id is null or r.codigo is distinct from 'NO_CONTESTO'),
           'intencion', o.intencion::text,
           'oportunidad_id', o.id
         ) order by a.realizada_at), '[]'::jsonb)
  into v_seguimientos
  from actividades a
  join oportunidades o on o.id = a.oportunidad_id
  join cuentas cu on cu.id = o.cuenta_id
  left join catalogo_resultados_gestion r on r.id = a.resultado_id
  where a.realizada_por = p_comercial
    and (a.realizada_at at time zone 'America/Lima')::date = v_fecha
    and a.tipo in ('llamada', 'whatsapp', 'email', 'visita', 'showroom');

  -- 2. PRESUPUESTOS ENVIADOS ese día (los del CRM: los del archivo son de
  -- años anteriores y no forman parte de la jornada).
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', cz.codigo,
           'correlativo', cz.correlativo,
           'serie', cz.serie::text,
           'cliente', cu.razon_social,
           'total', cz.total,
           'moneda', cz.moneda::text,
           'estado', cz.estado::text,
           'aprobacion', cz.estado_aprobacion::text,
           'enviada', cz.enviada_at is not null
         ) order by cz.correlativo), '[]'::jsonb)
  into v_cotizaciones
  from cotizaciones cz
  join oportunidades o on o.id = cz.oportunidad_id
  join cuentas cu on cu.id = o.cuenta_id
  where o.comercial_id = p_comercial
    -- Solo lo que SALIÓ al cliente, y fechado por el día en que salió
    -- (migración 0071). Antes se listaba por created_at, el día en que se
    -- empezó a armar: una cotización empezada el viernes y enviada el lunes es
    -- trabajo del lunes.
    and cz.enviada_at is not null
    and (cz.enviada_at at time zone 'America/Lima')::date = v_fecha;

  -- 3. VENTAS cerradas (fecha_venta es `date`: sin conversión de zona).
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente', cu.razon_social, 'monto', v.monto_total, 'moneda', v.moneda::text,
           'monto_usd', case when v.moneda = 'USD' then v.monto_total else v.monto_total / v_tc end
         ) order by v.monto_total desc), '[]'::jsonb)
  into v_ventas
  from ventas v
  join oportunidades o on o.id = v.oportunidad_id
  join cuentas cu on cu.id = o.cuenta_id
  where o.comercial_id = p_comercial and v.fecha_venta = v_fecha;

  -- 4. LEADS RECIBIDOS ese día (lo que Central le derivó). Carlos: "se le han
  -- entregado 5 leads"; la comparación con los presupuestos hechos es
  -- justamente el indicador que le interesa.
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', l.codigo,
           'nombre', coalesce(l.razon_social, l.nombre_contacto),
           'canal', l.canal::text,
           'hora', to_char(l.asignado_at at time zone 'America/Lima', 'HH24:MI')
         ) order by l.asignado_at), '[]'::jsonb)
  into v_leads
  from leads l
  where l.asignado_a = p_comercial
    and (l.asignado_at at time zone 'America/Lima')::date = v_fecha
    and l.estado = 'asignado';

  -- 5. ACTIVIDADES COMPLEMENTARIAS: tareas personales completadas del día.
  select coalesce(jsonb_agg(jsonb_build_object(
           'titulo', t.titulo, 'hora', to_char(t.hora, 'HH24:MI')
         ) order by t.hora nulls last, t.titulo), '[]'::jsonb)
  into v_complementarias
  from tareas_agenda t
  where t.comercial_id = p_comercial and t.fecha = v_fecha and t.completada;

  -- 6. AGENDA: lo que queda para mañana y lo que se pasó de fecha.
  select jsonb_build_object(
    'pendiente_hoy', count(*) filter (
      where o.proxima_accion_at = v_fecha
        and not exists (select 1 from actividades a2 where a2.oportunidad_id = o.id
                          and (a2.realizada_at at time zone 'America/Lima')::date = v_fecha)),
    'vencidas', count(*) filter (where o.proxima_accion_at < v_fecha),
    'manana', count(*) filter (where o.proxima_accion_at = v_fecha + 1)
  ) into v_agenda
  from oportunidades o
  where o.comercial_id = p_comercial and o.etapa not in ('venta', 'rechazada', 'derivada');

  -- 7. PLANIFICACIÓN DEL DÍA SIGUIENTE, con detalle (reunión 25-08: el
  -- número de «mañana» ya salía, pero gerencia quiere ver QUÉ hay planificado
  -- para ver cómo se están gestionando). Gestiones programadas por cliente…
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente', cu.razon_social,
           'accion', o.proxima_accion,
           'hora', to_char(o.proxima_accion_hora, 'HH24:MI'),
           'etapa', o.etapa::text
         ) order by o.proxima_accion_hora nulls last, cu.razon_social), '[]'::jsonb)
  into v_plan_gestiones
  from oportunidades o
  join cuentas cu on cu.id = o.cuenta_id
  where o.comercial_id = p_comercial
    and o.etapa not in ('venta', 'rechazada', 'derivada')
    and o.proxima_accion_at = v_fecha + 1;

  -- …y tareas propias de la agenda todavía sin completar.
  select coalesce(jsonb_agg(jsonb_build_object(
           'titulo', t.titulo, 'hora', to_char(t.hora, 'HH24:MI')
         ) order by t.hora nulls last, t.titulo), '[]'::jsonb)
  into v_plan_tareas
  from tareas_agenda t
  where t.comercial_id = p_comercial and t.fecha = v_fecha + 1 and not t.completada;

  v_resumen := jsonb_build_object(
    'meta_seguimientos', v_meta,
    'seguimientos_efectivos', (select count(*) from jsonb_array_elements(v_seguimientos) s where (s->>'efectivo')::boolean),
    'intentos_sin_contacto', (select count(*) from jsonb_array_elements(v_seguimientos) s where not (s->>'efectivo')::boolean),
    'cotizaciones', jsonb_array_length(v_cotizaciones),
    'cotizaciones_enviadas', (select count(*) from jsonb_array_elements(v_cotizaciones) c where (c->>'enviada')::boolean),
    'ventas', jsonb_array_length(v_ventas),
    'monto_vendido_usd', coalesce((select sum((v->>'monto_usd')::numeric) from jsonb_array_elements(v_ventas) v), 0),
    'leads_recibidos', jsonb_array_length(v_leads),
    'complementarias', jsonb_array_length(v_complementarias)
  );

  return jsonb_build_object(
    'fecha', v_fecha,
    'comercial', v_perfil,
    'resumen', v_resumen,
    'seguimientos', v_seguimientos,
    'cotizaciones', v_cotizaciones,
    'ventas', v_ventas,
    'leads', v_leads,
    'complementarias', v_complementarias,
    'agenda', v_agenda,
    'planificacion_manana', jsonb_build_object(
      'fecha', v_fecha + 1,
      'gestiones', v_plan_gestiones,
      'tareas', v_plan_tareas
    )
  );
end $function$
