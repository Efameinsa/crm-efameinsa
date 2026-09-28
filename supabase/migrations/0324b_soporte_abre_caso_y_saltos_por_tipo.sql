-- 0324b: LA SEGUNDA MITAD DE LA 0324 (reunión de gerencia 28-09, 14:18): lo que
-- CAMBIA EL COMPORTAMIENTO que ve la gente y por eso se aplica junto con el
-- despliegue de la pantalla nueva, no antes.
--
--   · Soporte técnico abre caso técnico al derivar y al reclasificar (con la
--     pantalla vieja saldría un caso sin etiqueta de tipo).
--   · Reclasificar el expediente retipa el caso en cualquier etapa abierta.
--   · Solo se saltean los pasos que el circuito del tipo marca como opcionales
--     o que no le corresponden (la pantalla vieja ofrece «no aplica» en
--     planificación, atención, pruebas y conformidad para todos los tipos).
--   · Los expedientes de soporte técnico ya abiertos reciben su caso técnico.
--
-- Requiere la 0324 (valor 'soporte_tecnico' del enum, regla_circuito_atencion,
-- etiquetas y retipar_atencion).

-- ── crear_atencion_al_derivar: soporte técnico abre caso técnico ─────────────
CREATE OR REPLACE FUNCTION public.crear_atencion_al_derivar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if new.tipo_postventa::text = 'soporte_tecnico' then
    v_tipo := 'soporte_tecnico'::tipo_atencion;
  elsif v_tipo = 'soporte_tecnico' then
    v_tipo := case new.tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'mantenimiento' then 'solicitud_mantenimiento'::tipo_atencion
      when 'mantenimiento_correctivo' then 'solicitud_mantenimiento'::tipo_atencion
      else null
    end;
  end if;

  if v_tipo is null or v_tipo not in ('puesta_en_marcha', 'problema_tecnico', 'soporte_tecnico') then return new; end if;
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
end $function$;

-- ── catalogar_expediente_postventa: el caso sigue al tipo en cualquier etapa ─
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
    if v_tipo_at is not null and v_at.tipo <> v_tipo_at then
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

-- ── omitir_etapa_atencion: se saltea lo que el circuito del tipo permite ─────
CREATE OR REPLACE FUNCTION public.omitir_etapa_atencion(p_atencion uuid, p_etapa text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a         record;
  v_motivo    text := trim(coalesce(p_motivo, ''));
  v_orden     text[] := enum_range(null::etapa_atencion)::text[];
  v_siguiente text;
begin
  select id, tipo, etapa, cerrado_at, etapas_omitidas into v_a
    from atenciones where id = p_atencion;

  if v_a.id is null then
    raise exception 'Esa atención no existe';
  end if;
  if v_a.cerrado_at is not null then
    raise exception 'La atención ya está cerrada';
  end if;

  -- QUÉ SE PUEDE SALTEAR lo dice el circuito del tipo (reunión 28-09, 0324):
  -- solo los pasos opcionales, y los que no corresponden al tipo. El resto es
  -- obligatorio; para lo que terminó fuera del circuito está «cerrar acá»
  -- (0181). Solicitud, registro y cierre nunca son opcionales.
  if p_etapa in ('solicitud', 'registro', 'cierre', 'seguimiento')
     or regla_circuito_atencion(v_a.tipo::text, p_etapa) = 'obligatorio' then
    raise exception 'En %, «%» es obligatorio: no se puede saltear',
      etiqueta_tipo_atencion(v_a.tipo::text), etiqueta_etapa_atencion(p_etapa);
  end if;

  -- SE SALTEA LA QUE TOCA, NO CUALQUIERA. Si no, se podría marcar «no aplica»
  -- sobre algo ya cumplido, o sobre una etapa lejana, y la tira contaría una
  -- historia que no pasó. Para saltear dos seguidas se hace dos veces, que es
  -- literalmente el «check, check, check» que pidió Carlos.
  v_siguiente := v_orden[array_position(v_orden, v_a.etapa::text) + 1];
  if p_etapa is distinct from v_siguiente then
    raise exception 'Solo se puede saltear la etapa que toca ahora (%), no «%»',
      coalesce(v_siguiente, 'ninguna'), p_etapa;
  end if;

  if length(v_motivo) < 5 then
    raise exception 'Escriba por qué no aplica: es lo que va a leer quien revise el caso después';
  end if;

  update atenciones
     set etapa = p_etapa::etapa_atencion,
         etapas_omitidas = coalesce(etapas_omitidas, '{}'::jsonb) || jsonb_build_object(
           p_etapa,
           jsonb_build_object('motivo', v_motivo, 'at', now(), 'por', auth.uid())
         ),
         updated_at = now()
   where id = p_atencion;
end $function$;

-- Los expedientes de soporte técnico que nacieron entre la 0321 y esta
-- migración no abrieron caso técnico: se les abre ahora, como lo habría hecho
-- el disparador.
insert into atenciones (
  cuenta_id, equipo_id, tipo, etapa, oportunidad_id,
  asignado_a, recibido_por, registrado_at, detalle, es_prueba
)
select o.cuenta_id, o.equipo_id, 'soporte_tecnico', 'registro', o.id,
       o.comercial_id, l.recibido_por, now(), l.mensaje, coalesce(l.es_prueba, false)
  from oportunidades o
  join leads l on l.id = o.lead_id
 where o.tipo_postventa = 'soporte_tecnico'
   and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
   and not exists (select 1 from atenciones a where a.oportunidad_id = o.id);
