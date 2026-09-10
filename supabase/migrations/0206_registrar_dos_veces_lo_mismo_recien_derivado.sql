-- ============================================================
-- CRM EFAMEINSA · Migración 0206 · Registrar dos veces lo mismo, recién derivado
-- ============================================================
-- Santos, 10-09, trayendo el pedido de la señorita de postventa: «que borre la
-- solicitud de registro más reciente, la emitió dos veces debido a que no
-- aparecían las que había emitido». Era INVERSIONES TURISTICAS DEL CAMPO
-- S.A.C - HOSTAL LA ARBOLEDA: PRO-09252 a las 15:25 y PRO-09254 a las 15:38,
-- el mismo mantenimiento correctivo del mismo rodillo GMP G14.25. Se borró la
-- repetida (no tenía gestión) y el número quedó anulado.
--
-- LA PARTE QUE FALTABA ARREGLAR. `registrar_atencion_postventa` (0132) ya
-- traía un guardián para esto —«registrar dos veces el mismo problema del
-- mismo cliente no crea dos casos»—, pero solo mira los leads que siguen en
-- `pendiente_triaje`:
--
--     where l.cuenta_id = p_cuenta
--       and l.estado = 'pendiente_triaje'
--       and l.sugerido_atencion = p_tipo
--
-- O sea que DEJA DE PROTEGER exactamente cuando Central deriva. Y ese es el
-- mismo instante en que el caso desaparece de las pantallas de quien lo
-- registró, porque hasta que Central se lo devuelve no está en ninguna lista
-- suya. Los dos huecos se abren juntos y por eso el duplicado pasó: a las
-- 15:35:51 Central derivó el PRO-09252, y a las 15:38:30 el guardián ya no lo
-- veía. Es la misma hora en que ella tampoco.
--
-- QUÉ CAMBIA. El guardián sigue mirando TODO lo que está en la cola de Central
-- (sin límite de tiempo: si lleva tres días ahí, sigue siendo el mismo caso) y
-- además lo derivado en las últimas 2 horas. Dos horas cubren de sobra la
-- confusión real —las derivaciones del área tardan entre 3 y 28 minutos— sin
-- estorbar un pedido genuinamente nuevo del mismo cliente más tarde.
--
-- Y devuelve con qué toparse: el estado y el expediente, para que la pantalla
-- pueda decir «ya lo registró hace 13 min, Central ya se lo devolvió» y llevar
-- ahí, en vez del escueto «no se duplicó» que no dice dónde está lo anterior.
--
-- Lo descartado por Central NO cuenta: si Central lo desestimó y el cliente
-- vuelve a llamar, es un caso nuevo y tiene que poder registrarse.
--
-- No toca ninguna fila. Solo la definición viva de la función.
-- ============================================================

create or replace function public.registrar_atencion_postventa(
  p_cuenta uuid,
  p_tipo tipo_atencion,
  p_detalle text,
  p_equipo uuid default null::uuid,
  p_serie text default null::text,
  p_codigo_error text default null::text,
  p_adjuntos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quien  uuid := auth.uid();
  v_cuenta cuentas;
  v_cont   contactos;
  v_lead   uuid;
  v_codigo text;
  v_estado estado_lead;
  v_oport  uuid;
  v_minutos integer;
  v_prueba boolean := es_cuenta_prueba();
  v_tipo_viejo tipo_postventa;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  -- Registra el área o Central. Un comercial tiene su propio camino (0125).
  if not (coalesce(es_postventa(), false)
          or coalesce(es_backoffice(), false)
          or coalesce(es_operaciones(), false)
          or coalesce(rol_actual() = 'central', false)) then
    raise exception 'Solo postventa o Central registran una atención';
  end if;

  if length(coalesce(btrim(p_detalle), '')) < 10 then
    raise exception 'Escriba qué le pasa al equipo: es lo que va a leer Central para derivarlo';
  end if;

  select * into v_cuenta from cuentas where id = p_cuenta;
  if not found then raise exception 'Ese cliente no existe'; end if;

  select * into v_cont from contactos
   where cuenta_id = p_cuenta order by es_principal desc, created_at limit 1;

  -- El puente con el enum viejo, para que la bandeja y `asignar_lead` sigan
  -- entendiendo la sugerencia sin cambiarles nada.
  v_tipo_viejo := case p_tipo
    when 'solicitud_repuesto' then 'repuesto'::tipo_postventa
    when 'solicitud_mantenimiento' then 'mantenimiento'::tipo_postventa
    else 'garantia'::tipo_postventa
  end;

  -- Registrar dos veces el mismo problema del mismo cliente no crea dos casos.
  --
  -- Mira lo que sigue en la cola de Central (siempre) y lo que Central acaba
  -- de derivar (2 h). Antes solo lo primero, y por eso el 10-09 entraron dos
  -- veces el mismo mantenimiento de HOSTAL LA ARBOLEDA con tres minutos de
  -- diferencia de la derivación.
  select l.id, l.codigo, l.estado, l.oportunidad_id,
         (extract(epoch from (now() - l.recibido_at)) / 60)::integer
    into v_lead, v_codigo, v_estado, v_oport, v_minutos
    from leads l
   where l.cuenta_id = p_cuenta
     and l.sugerido_atencion = p_tipo
     and l.estado <> 'descartado'
     and (l.estado = 'pendiente_triaje' or l.recibido_at > now() - interval '2 hours')
   order by l.recibido_at desc
   limit 1;
  if v_lead is not null then
    return jsonb_build_object(
      'codigo', v_codigo,
      'repetido', true,
      'estado', v_estado,
      'oportunidad', v_oport,
      'minutos', v_minutos
    );
  end if;

  insert into leads (
    estado, area_destino, canal, fuente,
    nombre_contacto, telefono, email, num_doc, razon_social,
    mensaje, cuenta_id, recibido_por, es_prueba,
    sugerido_a, sugerido_tipo, sugerido_atencion, sugerido_por, adjuntos
  ) values (
    'pendiente_triaje', 'servicio_tecnico', 'llamada', 'llamada a postventa',
    coalesce(v_cont.nombre, v_cuenta.razon_social),
    v_cont.telefono, v_cont.email, v_cuenta.num_doc, v_cuenta.razon_social,
    btrim(p_detalle)
      || case when p_serie is not null then E'\nSerie: ' || upper(btrim(p_serie)) else '' end
      || case when p_codigo_error is not null then E'\nCódigo de error: ' || btrim(p_codigo_error) else '' end,
    p_cuenta, v_quien, v_prueba,
    v_quien, v_tipo_viejo, p_tipo, v_quien, coalesce(p_adjuntos, '[]'::jsonb)
  )
  returning id, codigo into v_lead, v_codigo;

  return jsonb_build_object('codigo', v_codigo, 'lead', v_lead, 'repetido', false);
end $function$;

comment on function public.registrar_atencion_postventa is
  'Registra la atención que recibe postventa como lead en la cola de Central (0132). No duplica: si el mismo cliente ya tiene un caso del mismo tipo esperando en Central, o derivado en las últimas 2 horas, devuelve ese (0206, tras el duplicado de HOSTAL LA ARBOLEDA del 10-09).';
