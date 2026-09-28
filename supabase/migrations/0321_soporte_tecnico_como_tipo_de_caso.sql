-- «SOPORTE TÉCNICO» COMO PESTAÑA PROPIA AL REGISTRAR UN CASO (Santos, 28-09:
-- «en el paso 2 debería haber otra pestañita que diga soporte técnico, no solo
-- problema técnico, puesta en marcha, repuesto, mantenimiento»).
--
-- Problema técnico es una falla (lleva garantía, diagnóstico y técnico).
-- Soporte técnico es orientar o asistir al cliente —uso, configuración,
-- limpieza, dudas— sin que haya una avería: no abre el circuito técnico.
-- Se agrega como tipo del expediente, Central lo ve en la sugerencia y lo
-- puede elegir al derivar, y postventa puede reclasificar hacia o desde él.

alter type tipo_postventa add value if not exists 'soporte_tecnico';

-- Registrar un caso: acepta el tipo del expediente cuando no hay caso técnico
-- (p_tipo null). La función viva, con esos tres cambios.
drop function if exists registrar_atencion_postventa(uuid, tipo_atencion, text, uuid, text, text, jsonb);
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
  -- Soporte técnico (28-09) no tiene caso técnico: viaja solo como tipo del expediente.
  v_tipo_viejo := case when p_tipo_expediente is not null then p_tipo_expediente::tipo_postventa else case p_tipo
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
end $function$

;
grant execute on function registrar_atencion_postventa(uuid, tipo_atencion, text, uuid, text, text, jsonb, text) to authenticated;

-- Etiqueta, catalogar y el disparador de la derivación, con soporte técnico.
create or replace function etiqueta_tipo_postventa(p_tipo text)
returns text
language sql
immutable
as $$
  select case p_tipo
    when 'garantia' then 'Problema técnico'
    when 'soporte_tecnico' then 'Soporte técnico'
    when 'repuesto' then 'Repuestos'
    when 'mantenimiento' then 'Mantenimiento preventivo'
    when 'mantenimiento_correctivo' then 'Mantenimiento correctivo'
    when 'puesta_en_marcha' then 'Puesta en marcha'
    when 'despacho' then 'Despacho'
    when 'seguimiento' then 'Seguimiento'
    else p_tipo end
$$;

create or replace function catalogar_expediente_postventa(p_oportunidad uuid, p_tipo text, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
    if v_at.etapa in ('solicitud', 'registro', 'diagnostico') then
      if v_tipo_at is null then
        -- Despacho o seguimiento: no hay circuito técnico que recorrer.
        update atenciones
           set cerrado_at = now(), etapa = 'cierre', resultado = 'derivado',
               motivo_cierre = format('El expediente se catalogó como %s: %s', v_etiqueta, btrim(p_motivo)),
               updated_at = now()
         where id = v_at.id;
      elsif v_at.tipo <> v_tipo_at then
        update atenciones set tipo = v_tipo_at, updated_at = now() where id = v_at.id;
      end if;
    end if;
  elsif v_tipo_at in ('problema_tecnico', 'puesta_en_marcha') then
    insert into atenciones (cuenta_id, equipo_id, tipo, etapa, oportunidad_id, asignado_a, recibido_por, registrado_at, detalle, es_prueba)
    select o.cuenta_id, o.equipo_id, v_tipo_at, 'registro', o.id, o.comercial_id, auth.uid(), now(),
           coalesce((select l.mensaje from leads l where l.id = o.lead_id), btrim(p_motivo)),
           coalesce((select es_prueba from perfiles where id = o.comercial_id), false);
  end if;

  return v_etiqueta;
end $$;

-- Central deriva con el tipo nuevo: el caso técnico nace para problema técnico
-- y para puesta en marcha (antes la puesta viajaba como «garantia» más la
-- sugerencia del contacto).
create or replace function crear_atencion_al_derivar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo tipo_atencion;
begin
  if new.lead_id is null or new.tipo_postventa is null then return new; end if;

  select l.sugerido_atencion into v_tipo from leads l where l.id = new.lead_id;
  if v_tipo is null then
    v_tipo := case new.tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'despacho' then null
      when 'soporte_tecnico' then null
      when 'seguimiento' then null
      else 'solicitud_mantenimiento'::tipo_atencion
    end;
  end if;

  if v_tipo is null or v_tipo not in ('puesta_en_marcha', 'problema_tecnico') then return new; end if;
  if exists (select 1 from atenciones a where a.oportunidad_id = new.id) then return new; end if;

  insert into atenciones (
    cuenta_id, equipo_id, tipo, etapa, oportunidad_id,
    asignado_a, recibido_por, registrado_at, detalle, es_prueba
  )
  select
    new.cuenta_id,
    new.equipo_id,
    v_tipo,
    'registro',
    new.id,
    new.comercial_id,
    l.recibido_por,
    now(),
    l.mensaje,
    coalesce(l.es_prueba, false)
  from leads l where l.id = new.lead_id;

  return new;
end $$;
