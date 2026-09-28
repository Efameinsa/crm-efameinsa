-- EL CIRCUITO DEL CASO TÉCNICO, POR TIPO — y SOPORTE TÉCNICO como caso técnico.
-- Reunión de gerencia del 28-09, 14:18 (Carlos, Lesly, Rubí, Gabriela, Santos).
--
-- 1. «Diagnóstico es un resultado… sería mejor antecedente». La etapa de la
--    base sigue llamándose `diagnostico` (es un sello con fecha); la pantalla
--    la muestra como «Antecedentes».
--
-- 2. Cada tipo tiene su circuito:
--      problema técnico, soporte técnico, mantenimiento → completo.
--      puesta en marcha → antecedentes y atención OPCIONALES («a veces se
--                         soluciona en la llamada»); pruebas y conformidad sí.
--      repuesto          → antecedentes OPCIONAL; «pruebas y conformidad no va».
--    La tabla vive en src/lib/atenciones.ts (CIRCUITO_POR_TIPO, con su test).
--    `regla_circuito_atencion` es su espejo en la base, para que la base no
--    deje saltear un paso obligatorio aunque alguien llame directo a la RPC.
--    SI CAMBIA UNA, CAMBIA LA OTRA (scripts/_probar-circuito.mjs las compara).
--
-- 3. Reclasificar cambia el circuito de verdad («solo cambia el nombre» fue la
--    queja): `retipar_atencion` acomoda los pasos al tipo nuevo, y el cambio de
--    tipo se permite en cualquier etapa abierta.
--
-- 4. «Soporte técnico» (0321 lo hizo solo tipo de EXPEDIENTE) lleva el
--    circuito completo: es un tipo de caso técnico más. «En soporte técnico
--    está bien todo el circuito.»
--
-- ESTA mitad no cambia nada de lo que ve la gente con la pantalla vieja
-- (vocabulario, regla del circuito, retipar, registrar con p_tipo soporte).
-- La que sí lo cambia —soporte abre caso técnico, reclasificar retipa, saltos
-- según el tipo— es la 0324b y se aplica con el despliegue.

alter type tipo_atencion add value if not exists 'soporte_tecnico';
-- El valor nuevo no se puede USAR en la misma transacción en que se agrega:
-- se confirma acá y el resto corre en otra (todo lo de abajo es idempotente).
commit;

-- El espejo de CIRCUITO_POR_TIPO (src/lib/atenciones.ts).
create or replace function regla_circuito_atencion(p_tipo text, p_etapa text)
returns text
language sql
immutable
as $$
  select case
    when p_etapa = 'seguimiento' then 'opcional'
    when p_tipo = 'puesta_en_marcha' and p_etapa in ('diagnostico', 'atencion') then 'opcional'
    when p_tipo = 'solicitud_repuesto' and p_etapa = 'diagnostico' then 'opcional'
    when p_tipo = 'solicitud_repuesto' and p_etapa in ('pruebas', 'conformidad') then 'no_corresponde'
    else 'obligatorio'
  end
$$;

create or replace function etiqueta_tipo_atencion(p_tipo text)
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
    else p_tipo end
$$;

create or replace function etiqueta_etapa_atencion(p_etapa text)
returns text
language sql
immutable
as $$
  select case p_etapa
    when 'solicitud' then 'Solicitud'
    when 'registro' then 'Registro'
    when 'diagnostico' then 'Antecedentes'
    when 'planificacion' then 'Planificación'
    when 'atencion' then 'Atención'
    when 'pruebas' then 'Pruebas'
    when 'conformidad' then 'Conformidad'
    when 'cierre' then 'Cierre'
    when 'seguimiento' then 'Seguimiento'
    else p_etapa end
$$;

-- CAMBIAR EL TIPO Y ACOMODAR EL CIRCUITO. Lo usan `cambiar_tipo_atencion`
-- (el «En realidad es otra cosa…» del caso) y `catalogar_expediente_postventa`
-- (el «Reclasificar» del expediente). No revisa permisos: los revisan ellas.
--
-- Qué acomoda:
--   A. El paso en el que está el caso se había saltado y en el tipo nuevo es
--      obligatorio → se vuelve a pedir (antecedentes → registro; atención →
--      planificación; pruebas y conformidad → pruebas, con el trabajo que ya
--      estaba escrito).
--   B. En el tipo nuevo no corresponden pruebas ni conformidad y el caso las
--      estaba esperando → quedan como «No corresponde a …» y pasa al cierre.
-- Lo que ya pasó de verdad (sellos con fecha) no se toca: es historia.
create or replace function retipar_atencion(p_atencion uuid, p_tipo tipo_atencion)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v        record;
  v_om     jsonb;
  v_etapa  text;
  v_pruebas timestamptz;
  v_nota   jsonb;
begin
  select id, tipo, etapa, cerrado_at, coalesce(etapas_omitidas, '{}'::jsonb) om,
         trabajo_realizado, pruebas_at, pruebas_conforme, conformidad_at
    into v
    from atenciones where id = p_atencion for update;
  if v.id is null then raise exception 'Esa atención no existe'; end if;
  if v.cerrado_at is not null then raise exception 'La atención ya está cerrada'; end if;
  if v.tipo = p_tipo then return; end if;

  v_om := v.om;
  v_etapa := v.etapa::text;
  v_pruebas := v.pruebas_at;

  -- A.
  if v_om ? v_etapa and regla_circuito_atencion(p_tipo::text, v_etapa) = 'obligatorio' then
    if v_etapa = 'diagnostico' then
      v_om := v_om - 'diagnostico';
      v_etapa := 'registro';
    elsif v_etapa = 'atencion' then
      v_om := v_om - 'atencion';
      v_etapa := 'planificacion';
    elsif v_etapa = 'conformidad' and v.conformidad_at is null then
      v_om := v_om - 'conformidad' - 'pruebas';
      -- «pruebas» es donde queda el caso con el trabajo ya escrito (registrarTrabajo).
      v_etapa := case when v.trabajo_realizado is not null then 'pruebas' else 'atencion' end;
      if v_etapa = 'pruebas' then v_pruebas := coalesce(v_pruebas, now()); end if;
    end if;
  end if;

  -- B.
  if regla_circuito_atencion(p_tipo::text, 'pruebas') = 'no_corresponde'
     and v_etapa = 'pruebas' and v.pruebas_conforme is null then
    v_nota := jsonb_build_object(
      'motivo', 'No corresponde a ' || etiqueta_tipo_atencion(p_tipo::text),
      'at', now(), 'por', auth.uid());
    v_om := v_om || jsonb_build_object('pruebas', v_nota, 'conformidad', v_nota);
    v_etapa := 'conformidad';
  end if;

  update atenciones
     set tipo = p_tipo,
         etapa = v_etapa::etapa_atencion,
         etapas_omitidas = v_om,
         pruebas_at = v_pruebas,
         updated_at = now()
   where id = p_atencion;
end $$;
revoke execute on function retipar_atencion(uuid, tipo_atencion) from public, anon, authenticated;

-- ── registrar_atencion_postventa: acepta p_tipo = 'soporte_tecnico' ──────────
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

-- ── cambiar_tipo_atencion: en cualquier etapa abierta, con el circuito nuevo ─
CREATE OR REPLACE FUNCTION public.cambiar_tipo_atencion(p_atencion uuid, p_tipo tipo_atencion)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a record;
begin
  if not (coalesce(es_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Solo postventa, operaciones o gerencia cambian el tipo de una atención';
  end if;
  select id, tipo, etapa, cerrado_at into v_a from atenciones where id = p_atencion;
  if v_a.id is null then raise exception 'Esa atención no existe'; end if;
  if v_a.cerrado_at is not null then raise exception 'La atención ya está cerrada'; end if;
  -- EN CUALQUIER ETAPA ABIERTA (reunión 28-09, 0324). Hasta la 0323 solo antes
  -- de planificar, y el cambio era un rótulo: el circuito seguía igual. Ahora
  -- `retipar_atencion` acomoda los pasos al circuito del tipo nuevo.
  if v_a.tipo = p_tipo then return; end if;
  perform retipar_atencion(p_atencion, p_tipo);
end $function$;
