-- ============================================================
-- Postventa registra, pero deriva: la atención entra por Central
-- ============================================================
-- Reunión con Lesly, 31-08 11:45. Textual:
--
--   «Cualquier caso que venga, que reciba posventa, tiene que ser derivado a
--    Central. Lo que él va a registrar tiene que llegar a la Central para que
--    la Central también le vuelva a enviar, si le corresponde atender la
--    posventa o le corresponde atender a las comerciales.»
--
-- Y sobre el formulario que hay hoy: «mal asunto… voy a arreglar este
-- formulario».
--
-- QUÉ ESTÁ MAL HOY. `registrarCaso` (src/lib/acciones/casos.ts) crea la
-- oportunidad con `comercial_id = auth.uid()`: postventa se queda el caso.
-- Eso saltea el reparto, y el reparto no es un trámite — es quien decide si el
-- cliente que llama por un repuesto en realidad es una venta de equipos. Un
-- caso que el área se queda sola desaparece de la contabilidad de Central.
--
-- La pantalla nació el 27-08 de una frase de Ariana —«las llamadas van a ir
-- para Hever, directamente»— que describía el TELÉFONO, no la autoridad para
-- repartir. Lesly corrigió eso hoy.
--
-- NO SE INVENTA UN CAMINO NUEVO. La 0125 ya lo construyó para el caso simétrico
-- —el comercial que se entera de que su cliente quiere servicio— y dejó escrita
-- la regla: «el aviso entra a la bandeja de triaje como cualquier contacto,
-- Central sigue siendo quien deriva, que es la regla de Carlos del 24-08». Acá
-- se usa la misma puerta en el otro sentido.

-- ------------------------------------------------------------
-- 1. La sugerencia viaja con el tipo NUEVO
-- ------------------------------------------------------------
-- `sugerido_tipo` es `tipo_postventa` (garantia|repuesto|mantenimiento) y no
-- alcanza: no distingue una puesta en marcha de un problema técnico, que es
-- justo el corte que hizo el ingeniero. Se agrega al lado, sin tocar el viejo,
-- que lo usan la bandeja y la derivación.
alter table leads
  add column if not exists sugerido_atencion tipo_atencion;

comment on column leads.sugerido_atencion is
  'El tipo de atención propuesto (0132). Convive con sugerido_tipo, que es el enum viejo '
  'que usan la bandeja de Central y asignar_lead().';

-- ------------------------------------------------------------
-- 2. La puerta: postventa registra y manda a triaje
-- ------------------------------------------------------------
-- `security definer` por lo mismo que la 0125: la política de `leads` (0060) no
-- deja insertar en la cola de triaje a cualquiera. Esta es la puerta con
-- nombre, y valida lo que tiene que valer.
create or replace function registrar_atencion_postventa(
  p_cuenta    uuid,
  p_tipo      tipo_atencion,
  p_detalle   text,
  p_equipo    uuid default null,
  p_serie     text default null,
  p_codigo_error text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien  uuid := auth.uid();
  v_cuenta cuentas;
  v_cont   contactos;
  v_lead   uuid;
  v_codigo text;
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
  select l.id, l.codigo into v_lead, v_codigo
    from leads l
   where l.cuenta_id = p_cuenta
     and l.estado = 'pendiente_triaje'
     and l.sugerido_atencion = p_tipo
   limit 1;
  if v_lead is not null then
    return jsonb_build_object('codigo', v_codigo, 'repetido', true);
  end if;

  insert into leads (
    estado, area_destino, canal, fuente,
    nombre_contacto, telefono, email, num_doc, razon_social,
    mensaje, cuenta_id, recibido_por, es_prueba,
    sugerido_a, sugerido_tipo, sugerido_atencion, sugerido_por
  ) values (
    'pendiente_triaje', 'servicio_tecnico', 'llamada', 'llamada a postventa',
    coalesce(v_cont.nombre, v_cuenta.razon_social),
    v_cont.telefono, v_cont.email, v_cuenta.num_doc, v_cuenta.razon_social,
    btrim(p_detalle)
      || case when p_serie is not null then E'\nSerie: ' || upper(btrim(p_serie)) else '' end
      || case when p_codigo_error is not null then E'\nCódigo de error: ' || btrim(p_codigo_error) else '' end,
    p_cuenta, v_quien, v_prueba,
    v_quien, v_tipo_viejo, p_tipo, v_quien
  )
  returning id, codigo into v_lead, v_codigo;

  return jsonb_build_object('codigo', v_codigo, 'lead', v_lead, 'repetido', false);
end $fn$;

comment on function registrar_atencion_postventa(uuid, tipo_atencion, text, uuid, text, text) is
  'Postventa registra una atención y la manda a la bandeja de Central con su sugerencia (0132). '
  'No crea la oportunidad: eso pasa cuando Central deriva. Pedido de Lesly el 31-08.';

-- ------------------------------------------------------------
-- 3. Cuando Central deriva, nace la atención técnica
-- ------------------------------------------------------------
-- Un disparador y no una llamada desde la aplicación, porque Central deriva por
-- más de un camino (la bandeja, la corrección de una derivación, el reemplazo
-- de comercial) y todos terminan insertando la oportunidad. Colgarse del insert
-- es la única forma de que ninguno se olvide.
--
-- SOLO PARA LA PISTA TÉCNICA. Un repuesto o un mantenimiento son una venta y
-- siguen las etapas comerciales, tal como él lo escribió: «aquí se aplica el
-- proceso regular de clasificación y etapas de un gestor comercial». Crearles
-- una atención sería duplicarles el trabajo.
create or replace function crear_atencion_al_derivar() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_tipo tipo_atencion;
begin
  if new.lead_id is null or new.tipo_postventa is null then return new; end if;

  select l.sugerido_atencion into v_tipo from leads l where l.id = new.lead_id;
  if v_tipo is null then
    -- Vino por el camino viejo, sin el eje nuevo: se deduce lo que se puede.
    v_tipo := case new.tipo_postventa
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      else 'solicitud_mantenimiento'::tipo_atencion
    end;
  end if;

  if v_tipo not in ('puesta_en_marcha', 'problema_tecnico') then return new; end if;
  if exists (select 1 from atenciones a where a.oportunidad_id = new.id) then return new; end if;

  insert into atenciones (
    cuenta_id, equipo_id, tipo, etapa, oportunidad_id,
    asignado_a, recibido_por, registrado_at, detalle, es_prueba
  )
  select
    new.cuenta_id,
    new.equipo_id,
    v_tipo,
    'registro',            -- Central ya la derivó: la solicitud quedó atrás
    new.id,
    new.comercial_id,
    l.recibido_por,
    now(),
    l.mensaje,
    coalesce(l.es_prueba, false)
  from leads l where l.id = new.lead_id;

  return new;
end $fn$;

drop trigger if exists tr_crear_atencion_al_derivar on oportunidades;
create trigger tr_crear_atencion_al_derivar after insert on oportunidades
  for each row execute function crear_atencion_al_derivar();

-- ------------------------------------------------------------
-- 4. La garantía, resuelta al abrir y no a ojo
-- ------------------------------------------------------------
-- Los dos condicionales que dictó, contestados con lo que el parque instalado
-- ya sabe: «lo que él verifica es si está o no está en garantía» y «este
-- cliente ha hecho mantenimiento preventivo o no lo ha hecho».
create or replace function garantia_del_equipo(p_equipo uuid)
returns jsonb language sql stable set search_path = public as $fn$
  select jsonb_build_object(
    'en_garantia',      e.garantia_hasta is not null and e.garantia_hasta >= current_date,
    'garantia_hasta',   e.garantia_hasta,
    'garantia_meses',   e.garantia_meses,
    'meses_de_uso',     case when e.fecha_puesta_marcha is not null
                             then extract(year from age(current_date, e.fecha_puesta_marcha)) * 12
                                + extract(month from age(current_date, e.fecha_puesta_marcha))
                        end,
    'hizo_preventivo',  e.ultimo_mantenimiento is not null,
    'ultimo_mantenimiento', e.ultimo_mantenimiento,
    'proximo_mantenimiento', e.proximo_mantenimiento,
    'serie',            e.serie,
    'modelo',           coalesce(e.modelo_texto, ''),
    'cuenta_id',        e.cuenta_id
  )
  from equipos_instalados e where e.id = p_equipo;
$fn$;

comment on function garantia_del_equipo(uuid) is
  'Contesta los dos condicionales del circuito de postventa (0132): si el equipo está en '
  'garantía y si el cliente viene haciendo mantenimiento preventivo.';
