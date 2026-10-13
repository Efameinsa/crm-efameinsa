-- 0457 · Los tipos de caso nuevos (0456) en el registro, la derivación y la apertura.
-- Reunión de postventa 13-10 11:20 (tarea 4 del acta).
--
-- · etiqueta_tipo_atencion: «Revisión por garantía», «Refuerzo de capacitación», «Otro».
-- · registrar_atencion_postventa / registrar_caso_autoderivado: la capacitación
--   viaja como expediente de soporte técnico; revisión por garantía y «otro», como
--   caso técnico (garantia), igual que el problema técnico.
-- · crear_atencion_al_derivar: abre el caso técnico también para los tres tipos
--   nuevos; si Central lo deriva como soporte, una capacitación sigue siendo
--   capacitación; el texto de «Otro» (primera línea «Otro: …» del pedido) queda
--   en atenciones.tipo_detalle.
-- · catalogar_expediente_postventa: recatalogar el expediente como problema técnico
--   o soporte no pisa el tipo fino del caso (revisión por garantía, otro, capacitación).
-- · cambiar_tipo_atencion: recibe el texto de «Otro» (p_detalle).
-- · apertura_desde_caso: tres formatos nuevos con su encabezado — SERVICIO TÉCNICO,
--   REVISIÓN POR GARANTÍA y REFUERZO DE CAPACITACIÓN.

create or replace function public.etiqueta_tipo_atencion(p_tipo text)
returns text
language sql
immutable
as $$
  select case p_tipo
    when 'problema_tecnico' then 'Problema técnico'
    when 'soporte_tecnico' then 'Soporte técnico'
    when 'puesta_en_marcha' then 'Puesta en marcha'
    when 'solicitud_repuesto' then 'Repuesto'
    when 'solicitud_mantenimiento' then 'Mantenimiento'
    when 'revision_garantia' then 'Revisión por garantía'
    when 'capacitacion' then 'Refuerzo de capacitación'
    when 'otro' then 'Otro'
    else p_tipo end
$$;

drop function if exists public.cambiar_tipo_atencion(uuid, tipo_atencion);
create or replace function public.cambiar_tipo_atencion(p_atencion uuid, p_tipo tipo_atencion, p_detalle text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_a record;
  v_detalle text := nullif(btrim(coalesce(p_detalle, '')), '');
begin
  if not (coalesce(es_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Solo postventa, operaciones o gerencia cambian el tipo de una atención';
  end if;
  select id, tipo, etapa, cerrado_at, tipo_detalle into v_a from atenciones where id = p_atencion;
  if v_a.id is null then raise exception 'Esa atención no existe'; end if;
  if v_a.cerrado_at is not null then raise exception 'La atención ya está cerrada'; end if;
  if p_tipo = 'otro' and v_detalle is null then raise exception 'Escriba qué es: con «Otro» el texto es el título del caso'; end if;
  if v_a.tipo = p_tipo then
    -- Mismo tipo: solo se corrige el texto de «Otro».
    if p_tipo = 'otro' and v_detalle is distinct from v_a.tipo_detalle then
      update atenciones set tipo_detalle = left(v_detalle, 120), updated_at = now() where id = p_atencion;
    end if;
    return;
  end if;
  -- EN CUALQUIER ETAPA ABIERTA (0324): retipar_atencion acomoda los pasos.
  perform retipar_atencion(p_atencion, p_tipo);
  update atenciones
     set tipo_detalle = case when p_tipo = 'otro' then left(v_detalle, 120) end,
         updated_at = now()
   where id = p_atencion;
end $$;
grant execute on function public.cambiar_tipo_atencion(uuid, tipo_atencion, text) to authenticated;

CREATE OR REPLACE FUNCTION public.registrar_atencion_postventa(p_cuenta uuid, p_tipo tipo_atencion, p_detalle text, p_equipo uuid DEFAULT NULL::uuid, p_serie text DEFAULT NULL::text, p_codigo_error text DEFAULT NULL::text, p_adjuntos jsonb DEFAULT '[]'::jsonb, p_tipo_expediente text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Soporte técnico (0324) ES un caso técnico: viaja como p_tipo y el expediente
  -- se llama igual. p_tipo_expediente queda para los que no tienen caso técnico.
  v_tipo_viejo := case when p_tipo_expediente is not null then p_tipo_expediente::tipo_postventa else case p_tipo
    when 'soporte_tecnico' then 'soporte_tecnico'::tipo_postventa
    -- 0457: el refuerzo de capacitación es un soporte; la revisión por garantía y «otro», un caso técnico.
    when 'capacitacion' then 'soporte_tecnico'::tipo_postventa
    when 'solicitud_repuesto' then 'repuesto'::tipo_postventa
    when 'solicitud_mantenimiento' then 'mantenimiento'::tipo_postventa
    else 'garantia'::tipo_postventa
  end end;

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
     and l.sugerido_atencion is not distinct from p_tipo
     and l.sugerido_tipo = v_tipo_viejo
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

CREATE OR REPLACE FUNCTION public.registrar_caso_autoderivado(p_cuenta uuid, p_tipo tipo_atencion, p_detalle text, p_equipo uuid DEFAULT NULL::uuid, p_serie text DEFAULT NULL::text, p_codigo_error text DEFAULT NULL::text, p_adjuntos jsonb DEFAULT '[]'::jsonb, p_tipo_expediente text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r jsonb;
  v_lead uuid;
  v_tipo tipo_postventa;
  v_op uuid;
begin
  if not coalesce(puede_postventa(), false) then
    raise exception 'El autoderivado es de postventa: el resto pasa el contacto a Central';
  end if;
  r := registrar_atencion_postventa(p_cuenta, p_tipo, p_detalle, p_equipo, p_serie, p_codigo_error, p_adjuntos, p_tipo_expediente);
  if coalesce((r->>'repetido')::boolean, false) then
    return r;
  end if;
  v_lead := (r->>'lead')::uuid;
  v_tipo := coalesce(nullif(p_tipo_expediente, ''), case p_tipo::text
    when 'solicitud_repuesto' then 'repuesto'
    when 'solicitud_mantenimiento' then 'mantenimiento'
    when 'puesta_en_marcha' then 'puesta_en_marcha'
    when 'soporte_tecnico' then 'soporte_tecnico'
    when 'capacitacion' then 'soporte_tecnico'
    else 'garantia' end)::tipo_postventa;

  perform set_config('app.autoderivar', 'si', true);
  v_op := asignar_lead(v_lead, auth.uid(), 'cartera_existente', v_tipo);
  perform set_config('app.autoderivar', '', true);

  update asignaciones
     set notas = concat_ws(' · ', nullif(notas, ''), 'Autoderivado: lo registró y lo atiende postventa')
   where lead_id = v_lead;

  return r || jsonb_build_object('oportunidad', v_op, 'autoderivado', true);
end $function$;

CREATE OR REPLACE FUNCTION public.crear_atencion_al_derivar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tipo tipo_atencion;
  v_mensaje text;
  v_equipo uuid;
  v_garantia jsonb;
  v_atencion uuid;
begin
  if new.lead_id is null or new.tipo_postventa is null then return new; end if;

  select l.sugerido_atencion, l.mensaje into v_tipo, v_mensaje from leads l where l.id = new.lead_id;
  if v_tipo is null then
    v_tipo := case new.tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'despacho' then null
      when 'soporte_tecnico' then 'soporte_tecnico'::tipo_atencion
      when 'seguimiento' then null
      else 'solicitud_mantenimiento'::tipo_atencion
    end;
  end if;

  -- SOPORTE TÉCNICO LLEVA EL CIRCUITO COMPLETO (reunión 28-09). Si Central lo
  -- deriva como soporte técnico, el caso es de soporte aunque la sugerencia
  -- dijera otra cosa; y si la sugerencia era soporte pero Central eligió otro
  -- tipo, manda Central (la sugerencia solo desempata la puesta en marcha que
  -- viajaba como «garantia», 0231).
  -- 0457: el refuerzo de capacitación ES un soporte técnico: se respeta.
  if new.tipo_postventa::text = 'soporte_tecnico' then
    if v_tipo is distinct from 'capacitacion'::tipo_atencion then v_tipo := 'soporte_tecnico'::tipo_atencion; end if;
  -- 0457: lo mismo con los tipos nuevos: si la sugerencia era capacitación, revisión
  -- por garantía u «otro» y Central eligió otra clase, manda Central.
  elsif v_tipo in ('soporte_tecnico', 'capacitacion')
     or (v_tipo in ('revision_garantia', 'otro') and new.tipo_postventa::text <> 'garantia') then
    v_tipo := case new.tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'mantenimiento' then 'solicitud_mantenimiento'::tipo_atencion
      when 'mantenimiento_correctivo' then 'solicitud_mantenimiento'::tipo_atencion
      else null
    end;
  end if;

  if v_tipo is null or v_tipo not in ('puesta_en_marcha', 'problema_tecnico', 'soporte_tecnico', 'revision_garantia', 'capacitacion', 'otro') then return new; end if;
  if exists (select 1 from atenciones a where a.oportunidad_id = new.id) then return new; end if;

  -- EL REGISTRO JALA LA MÁQUINA (0328): la serie que el pedido ya trae es la
  -- máquina del caso, con la garantía verificada al nacer. Va en el insert y
  -- no en un update posterior para que el enganche al pedido (0244) ya la vea.
  v_equipo := new.equipo_id;
  if v_equipo is null then
    select m.equipo_id into v_equipo
      from maquinas_mencionadas(new.cuenta_id, v_mensaje) m
     order by m.orden
     limit 1;
  end if;
  if v_equipo is not null then
    v_garantia := garantia_del_equipo(v_equipo);
  end if;

  insert into atenciones (
    cuenta_id, equipo_id, tipo, etapa, oportunidad_id,
    asignado_a, recibido_por, registrado_at, detalle, es_prueba,
    en_garantia, hizo_preventivo, garantia_verificada_at, garantia_verificada_por, tipo_detalle
  )
  select
    new.cuenta_id,
    v_equipo,
    v_tipo,
    'registro',
    new.id,
    new.comercial_id,
    l.recibido_por,
    now(),
    l.mensaje,
    coalesce(l.es_prueba, false),
    (v_garantia->>'en_garantia')::boolean,
    (v_garantia->>'hizo_preventivo')::boolean,
    case when v_equipo is not null then now() end,
    case when v_equipo is not null then auth.uid() end,
    -- «Otro» (0457): el texto viaja como primera línea «Otro: …» del pedido.
    case when v_tipo = 'otro' then nullif(btrim(substring(split_part(l.mensaje, E'\n', 1) from '^[Oo]tro:(.*)$')), '') end
  from leads l where l.id = new.lead_id
  returning id into v_atencion;

  -- Las otras máquinas que nombra el pedido quedan sumadas al caso (0253).
  if v_atencion is not null and v_equipo is not null then
    insert into atencion_equipos (atencion_id, equipo_id, agregado_por)
    select v_atencion, m.equipo_id, auth.uid()
      from maquinas_mencionadas(new.cuenta_id, v_mensaje) m
     where m.equipo_id <> v_equipo
    on conflict do nothing;
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.catalogar_expediente_postventa(p_oportunidad uuid, p_tipo text, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o oportunidades%rowtype;
  v_etiqueta text;
  v_at record;
  v_tipo_at tipo_atencion;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Esto lo hace el área de postventa';
  end if;
  if p_tipo not in ('garantia', 'repuesto', 'mantenimiento', 'mantenimiento_correctivo', 'puesta_en_marcha', 'despacho', 'seguimiento', 'soporte_tecnico') then
    raise exception 'Tipo de caso desconocido';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escriba por qué (una frase basta)';
  end if;
  select * into o from oportunidades where id = p_oportunidad for update;
  if o.id is null or o.tipo_postventa is null then
    raise exception 'Ese expediente no es de postventa';
  end if;
  if o.tipo_postventa::text = p_tipo then
    raise exception 'Ya está catalogado así';
  end if;
  v_etiqueta := etiqueta_tipo_postventa(p_tipo);

  update oportunidades set tipo_postventa = p_tipo::tipo_postventa, updated_at = now() where id = p_oportunidad;
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, adjuntos)
  values (p_oportunidad, 'nota', format('Se catalogó como %s: %s', v_etiqueta, btrim(p_motivo)), auth.uid(), '[]'::jsonb);

  -- El caso técnico que cuelga de este expediente sigue al tipo.
  v_tipo_at := case p_tipo
    when 'garantia' then 'problema_tecnico'::tipo_atencion
    when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
    when 'soporte_tecnico' then 'soporte_tecnico'::tipo_atencion
    when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
    when 'mantenimiento' then 'solicitud_mantenimiento'::tipo_atencion
    when 'mantenimiento_correctivo' then 'solicitud_mantenimiento'::tipo_atencion
    else null end;

  select id, tipo, etapa into v_at
    from atenciones
   where oportunidad_id = p_oportunidad and cerrado_at is null
   order by created_at desc
   limit 1;

  if v_at.id is not null then
    -- EL CIRCUITO CAMBIA DE VERDAD (reunión 28-09: «solo cambia el nombre»).
    -- Con otro tipo de caso técnico, el caso se retipa en CUALQUIER etapa
    -- abierta y `retipar_atencion` acomoda los pasos al circuito nuevo. Antes
    -- solo se tocaba hasta el diagnóstico y, más allá, el expediente cambiaba
    -- de nombre mientras el caso seguía con el tipo viejo.
    -- 0457: un caso de revisión por garantía, de capacitación u «otro» ya es de
    -- la clase del expediente: no se lo pisa con el tipo genérico.
    if v_tipo_at is not null and v_at.tipo <> v_tipo_at
       and not (p_tipo = 'garantia' and v_at.tipo::text in ('revision_garantia', 'otro'))
       and not (p_tipo = 'soporte_tecnico' and v_at.tipo::text = 'capacitacion') then
      perform retipar_atencion(v_at.id, v_tipo_at);
    elsif v_at.etapa in ('solicitud', 'registro', 'diagnostico') then
      if v_tipo_at is null then
        -- Despacho o seguimiento: no hay circuito técnico que recorrer.
        update atenciones
           set cerrado_at = now(), etapa = 'cierre', resultado = 'derivado',
               motivo_cierre = format('El expediente se catalogó como %s: %s', v_etiqueta, btrim(p_motivo)),
               updated_at = now()
         where id = v_at.id;
      end if;
    end if;
  elsif v_tipo_at in ('problema_tecnico', 'puesta_en_marcha', 'soporte_tecnico') then
    insert into atenciones (cuenta_id, equipo_id, tipo, etapa, oportunidad_id, asignado_a, recibido_por, registrado_at, detalle, es_prueba)
    select o.cuenta_id, o.equipo_id, v_tipo_at, 'registro', o.id, o.comercial_id, auth.uid(), now(),
           coalesce((select l.mensaje from leads l where l.id = o.lead_id), btrim(p_motivo)),
           coalesce((select es_prueba from perfiles where id = o.comercial_id), false);
  end if;

  return v_etiqueta;
end $function$;

CREATE OR REPLACE FUNCTION public.apertura_desde_caso(p_atencion uuid, p_tipo_pedido text, p_apertura_tipo text, p_fecha date, p_hora text, p_tecnico text, p_transporte text, p_direccion text, p_confirmo text, p_destino text, p_guia text DEFAULT NULL::text, p_guia_detalle text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_recibe_nombre text DEFAULT NULL::text, p_recibe_telefono text DEFAULT NULL::text, p_empresa text DEFAULT 'EFAMEINSA'::text, p_repuestos jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a atenciones%rowtype;
  v_cliente text;
  v_id uuid;
  v_hora time := nullif(btrim(coalesce(p_hora, '')), '')::time;
  v_garantia boolean := p_apertura_tipo = 'entrega_garantia';
  v_item jsonb;
  v_desc text;
  v_sku text;
  v_cant int;
  v_i int;
  v_n int := 0;
  v_lineas text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'La apertura de servicio la emite postventa';
  end if;
  if p_tipo_pedido not in ('garantia', 'revision', 'mantenimiento') then raise exception 'El servicio es una garantía, una revisión o un mantenimiento'; end if;
  if p_apertura_tipo not in ('mantenimiento', 'puesta_marcha', 'entrega_garantia', 'servicio_tecnico', 'revision_garantia', 'capacitacion') then raise exception 'Ese no es uno de los formatos de apertura de servicio'; end if;
  if p_destino not in ('lima', 'provincia') then raise exception 'Diga si el servicio es en Lima o en provincia'; end if;
  if p_fecha is null then raise exception 'Diga el día del servicio'; end if;
  -- En la entrega de repuestos puede no ir técnico (salen por agencia o los lleva el almacén).
  if not v_garantia and nullif(btrim(coalesce(p_tecnico, '')), '') is null then raise exception 'Diga qué técnico va'; end if;
  if nullif(btrim(coalesce(p_direccion, '')), '') is null then raise exception 'Escriba dónde se hace el servicio, tal como lo confirmó el cliente'; end if;
  if nullif(btrim(coalesce(p_confirmo, '')), '') is null then raise exception 'Diga con quién del cliente confirmó la dirección'; end if;
  if coalesce(p_empresa, 'EFAMEINSA') not in ('EFAMEINSA', 'OPEN') then raise exception 'La apertura sale a nombre de EFAMEINSA o de OPEN'; end if;
  if p_guia is not null and p_guia not in ('traslado', 'materiales', 'repuestos', 'ambas') then raise exception 'Esa no es una de las guías que se pueden pedir'; end if;
  if v_garantia then
    if p_tipo_pedido <> 'garantia' then raise exception 'La entrega de repuestos por garantía va con el servicio «Garantía»'; end if;
    if jsonb_typeof(p_repuestos) <> 'array' or not exists (
      select 1 from jsonb_array_elements(p_repuestos) e where nullif(btrim(coalesce(e->>'descripcion', '')), '') is not null
    ) then
      raise exception 'Agregue los repuestos que se entregan por garantía';
    end if;
  end if;

  select * into v_a from atenciones where id = p_atencion for update;
  if v_a.id is null then raise exception 'Ese caso no existe'; end if;
  if v_a.cuenta_id is null then raise exception 'El caso no está en la ficha de un cliente: únalo a su ficha primero'; end if;
  if v_a.cerrado_at is not null then raise exception 'El caso ya está cerrado'; end if;
  if v_a.servicio_id is not null then raise exception 'Este caso ya tiene su apertura de servicio: ábrala desde su pedido'; end if;

  select coalesce(nullif(btrim(v_a.cliente_texto), ''), coalesce(c.num_doc || ' - ', '') || c.razon_social)
    into v_cliente from cuentas c where c.id = v_a.cuenta_id;

  if v_garantia then
    for v_item in select * from jsonb_array_elements(p_repuestos) loop
      v_desc := upper(nullif(btrim(coalesce(v_item->>'descripcion', '')), ''));
      if v_desc is null then continue; end if;
      v_cant := greatest(1, least(50, coalesce(nullif(v_item->>'cantidad', '')::numeric, 1)::int));
      v_lineas := v_lineas || (v_cant || ' x ' || v_desc);
    end loop;
  end if;

  insert into servicios_postventa (
    cuenta_id, cliente_texto, fecha_confirmacion, ubicacion, equipo, tipo_servicio, observaciones,
    origen, tipo_pedido, modalidad, responsable_id,
    direccion_entrega, direccion_verificada_at, direccion_verificada_con,
    apertura_tipo, apertura_fecha, apertura_hora, tecnico_asignado, transporte, apertura_nota,
    apertura_guia, apertura_guia_detalle, fecha_despacho, despacho_hora,
    apertura_despacho_at, apertura_despacho_por, es_prueba,
    recibe_nombre, recibe_telefono, apertura_empresa
  ) values (
    v_a.cuenta_id, v_cliente, (now() at time zone 'America/Lima')::date, btrim(p_direccion),
    case when v_garantia then 'REPUESTOS POR GARANTÍA: ' || array_to_string(v_lineas, ' · ')
         else coalesce(nullif(btrim(v_a.equipo_texto), ''), 'Servicio técnico') end,
    case when v_garantia then 'GARANTÍA · ENTREGA DE REPUESTOS'
         -- 0457: el encabezado dice lo que hace el técnico (reunión 13-10).
         when p_apertura_tipo = 'revision_garantia' then 'REVISIÓN POR GARANTÍA'
         when p_apertura_tipo = 'servicio_tecnico' then 'SERVICIO TÉCNICO'
         when p_apertura_tipo = 'capacitacion' then 'REFUERZO DE CAPACITACIÓN'
         else case p_tipo_pedido when 'garantia' then 'GARANTÍA' when 'revision' then 'REVISIÓN' else 'MANTENIMIENTO' end end,
    concat_ws(E'\n',
      case when v_garantia then 'Abierto desde un caso de postventa (sin cierre de venta): entrega de repuestos por garantía, sin cobro.'
           else 'Abierto desde un caso de postventa (sin cierre de venta).' end,
      case when v_garantia and nullif(btrim(coalesce(v_a.equipo_texto, '')), '') is not null then 'Equipo en garantía: ' || btrim(v_a.equipo_texto) end,
      nullif(btrim(coalesce(v_a.detalle, '')), '')),
    'caso',
    case when v_garantia then 'repuesto' when p_tipo_pedido = 'mantenimiento' then 'mantenimiento' else 'revision' end,
    p_destino, auth.uid(),
    btrim(p_direccion), now(), btrim(p_confirmo),
    p_apertura_tipo, p_fecha, v_hora, nullif(btrim(coalesce(p_tecnico, '')), ''), nullif(btrim(coalesce(p_transporte, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''),
    p_guia, nullif(btrim(coalesce(p_guia_detalle, '')), ''), p_fecha, v_hora,
    now(), auth.uid(), v_a.es_prueba,
    coalesce(nullif(btrim(coalesce(p_recibe_nombre, '')), ''), btrim(p_confirmo)), nullif(btrim(coalesce(p_recibe_telefono, '')), ''),
    coalesce(p_empresa, 'EFAMEINSA')
  ) returning id into v_id;

  -- Cada unidad es una fila, como en los pedidos que vienen de un cierre (0260).
  if v_garantia then
    for v_item in select * from jsonb_array_elements(p_repuestos) loop
      v_desc := upper(nullif(btrim(coalesce(v_item->>'descripcion', '')), ''));
      if v_desc is null then continue; end if;
      v_sku := nullif(btrim(coalesce(v_item->>'sku', '')), '');
      v_cant := greatest(1, least(50, coalesce(nullif(v_item->>'cantidad', '')::numeric, 1)::int));
      for v_i in 1..v_cant loop
        v_n := v_n + 1;
        insert into pedido_equipos (servicio_id, orden, descripcion, sku, es_prueba)
        values (v_id, v_n, v_desc, v_sku, v_a.es_prueba);
      end loop;
    end loop;
  end if;

  update atenciones set servicio_id = v_id, programada_at = coalesce(programada_at, (p_fecha + coalesce(v_hora, '09:00'::time)) at time zone 'America/Lima'),
         tecnico = coalesce(tecnico, nullif(btrim(coalesce(p_tecnico, '')), '')), updated_at = now()
   where id = p_atencion;
  return v_id;
end $function$;

insert into _migraciones_aplicadas (archivo) values ('0457_tipos_de_caso_en_registro_y_apertura.sql')
on conflict do nothing;
