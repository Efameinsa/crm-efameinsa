-- REUNIÓN DE GERENCIA DEL 28-09 (Carlos, Lesly, Central, Rubí y Gabriela).
--
-- 1. LOS TIPOS DEL EXPEDIENTE. Mirando BUNGARENA LODGE, Central derivó como
--    «soporte técnico» una llamada en la que el cliente pedía que le
--    despacharan: «el cliente no está pidiendo puesta en marcha, ha solicitado
--    despacho… tiene que aparecer en el desplegable». Carlos dictó la lista:
--    «despacho, puesta en marcha, mantenimiento, repuestos… y problema técnico.
--    Mantenimiento preventivo, mantenimiento correctivo». Se agregan
--    `despacho`, `puesta_en_marcha` y `mantenimiento_correctivo` al tipo del
--    expediente (`garantia` sigue siendo «Problema técnico / soporte» y
--    `mantenimiento` el preventivo, para no mover lo que ya está cargado).
--
-- 2. RECLASIFICAR ARRASTRA EL CIRCUITO. «Si es puesta en marcha aparece la
--    línea de tiempo… si es despacho, ¿qué va a aparecer?… solamente para que
--    lo lleve a la agenda… y ya no tiene que llenar todo el circuito». Al
--    catalogar el expediente, el caso técnico que cuelga de él se acomoda:
--    cambia de tipo si todavía no se planificó; si pasa a despacho o a
--    seguimiento, el caso se cierra como derivado (el despacho se trabaja en
--    el pedido); y si pasa a problema técnico o puesta en marcha y no tenía
--    caso, se abre, para que aparezca su circuito.
--
-- 3. LA SOLICITUD DEL CLIENTE LA VE TODA EL ÁREA. «Uno tiene más amplia la
--    información, otro no… hay que darle doble cheque… que estén alineadas».
--    A Gabriela no le salía «lo que solicitó el cliente» en el expediente que
--    atendía Rubí: la política de `leads` solo abría el contacto a quien Central
--    se lo asignó. Ahora lo ve quien trabaja el expediente del que cuelga (su
--    dueño actual, o cualquiera de postventa si el expediente es de postventa).

alter type tipo_postventa add value if not exists 'despacho';
alter type tipo_postventa add value if not exists 'puesta_en_marcha';
alter type tipo_postventa add value if not exists 'mantenimiento_correctivo';

-- ─── 3. Quién ve el contacto que originó un expediente ──────────────────────
-- Función aparte (security definer) para no encadenar políticas de
-- `oportunidades` dentro de la de `leads`.
create or replace function lead_visible_por_su_expediente(p_lead uuid, p_oportunidad uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from oportunidades o
     where (o.lead_id = p_lead or o.id = p_oportunidad)
       and (
         o.comercial_id = auth.uid()
         or (o.tipo_postventa is not null and (coalesce(puede_postventa(), false) or coalesce(es_operaciones(), false)))
       )
  )
$$;

drop policy if exists leads_ve_quien_trabaja_su_expediente on leads;
create policy leads_ve_quien_trabaja_su_expediente on leads
  for select
  using (lead_visible_por_su_expediente(id, oportunidad_id));

-- ─── 1 y 2. Catalogar el expediente ─────────────────────────────────────────
create or replace function etiqueta_tipo_postventa(p_tipo text)
returns text
language sql
immutable
as $$
  select case p_tipo
    when 'garantia' then 'Problema técnico'
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
  if p_tipo not in ('garantia', 'repuesto', 'mantenimiento', 'mantenimiento_correctivo', 'puesta_en_marcha', 'despacho', 'seguimiento') then
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
