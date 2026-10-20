-- ============================================================
-- CRM EFAMEINSA · Migración 0555 · Cada caso técnico con su código, y sin
-- abrir otro si ya hay uno abierto del mismo problema
-- ============================================================
-- Reunión de gerencia 20-10-2026, caso Comercial Lernake: en el historial
-- «todos dicen problema técnico… no sé qué problema técnico están atendiendo,
-- el 50, el 51, el 52». El cliente volvió a llamar, Central lo derivó y se
-- abrió un SEGUNDO caso (19-10) del mismo problema que seguía abierto desde el
-- 29-09. «Como la atención médica: buscar el caso que dejaron pendiente.»
--
--   1. atenciones.codigo = CASO-00001…, correlativo por orden de creación.
--   2. crear_atencion_de_lead (lo que corre cuando Central deriva un problema
--      técnico): si el cliente ya tiene un caso ABIERTO del mismo tipo y de la
--      misma máquina (o alguna de las dos sin identificar), la llamada nueva se
--      suma a ese caso —queda escrita en el detalle con la fecha y pasa a quien
--      Central derivó— en vez de abrir otro.
--   3. unir_atenciones(desde, hacia, motivo): junta dos casos que ya se
--      duplicaron (Lernake). El de «desde» queda cerrado «unido a CASO-…».
-- ============================================================

create sequence if not exists atenciones_codigo_seq;
alter table atenciones add column if not exists codigo text;
alter table atenciones add column if not exists unida_a uuid references atenciones(id);

do $$
declare r record;
begin
  for r in select id from atenciones where codigo is null order by created_at, id loop
    update atenciones set codigo = 'CASO-' || lpad(nextval('atenciones_codigo_seq')::text, 5, '0') where id = r.id;
  end loop;
end $$;
alter table atenciones alter column codigo set default ('CASO-' || lpad(nextval('atenciones_codigo_seq')::text, 5, '0'));
create unique index if not exists atenciones_codigo_unico on atenciones(codigo);

-- El caso abierto que «es el mismo»: mismo cliente, mismo tipo, misma máquina
-- (o una de las dos sin identificar). El más antiguo, que es el que lleva la historia.
create or replace function public.atencion_abierta_parecida(p_cuenta uuid, p_tipo tipo_atencion, p_equipo uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from atenciones a
   where a.cuenta_id = p_cuenta and a.tipo = p_tipo and a.cerrado_at is null and a.unida_a is null
     and (p_equipo is null or a.equipo_id is null or a.equipo_id = p_equipo)
   order by a.created_at asc
   limit 1
$$;
grant execute on function public.atencion_abierta_parecida(uuid, tipo_atencion, uuid) to authenticated, service_role;

create or replace function public.crear_atencion_de_lead(p_op uuid, p_lead uuid, p_tipo_postventa tipo_postventa, p_asignado uuid)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tipo tipo_atencion;
  v_mensaje text;
  v_equipo uuid;
  v_garantia jsonb;
  v_atencion uuid;
  v_cuenta uuid;
  v_existente uuid;
  v_codigo_lead text;
begin
  if p_op is null or p_lead is null or p_tipo_postventa is null then return null; end if;
  if exists (select 1 from atenciones a where a.lead_id = p_lead) then return null; end if;
  select cuenta_id, equipo_id into v_cuenta, v_equipo from oportunidades where id = p_op;

  select l.sugerido_atencion, l.mensaje, l.codigo into v_tipo, v_mensaje, v_codigo_lead from leads l where l.id = p_lead;
  if v_tipo is null then
    v_tipo := case p_tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'despacho' then null
      when 'soporte_tecnico' then 'soporte_tecnico'::tipo_atencion
      when 'seguimiento' then null
      else 'solicitud_mantenimiento'::tipo_atencion
    end;
  end if;
  if p_tipo_postventa::text = 'soporte_tecnico' then
    if v_tipo is distinct from 'capacitacion'::tipo_atencion then v_tipo := 'soporte_tecnico'::tipo_atencion; end if;
  elsif v_tipo in ('soporte_tecnico', 'capacitacion')
     or (v_tipo in ('revision_garantia', 'otro') and p_tipo_postventa::text <> 'garantia') then
    v_tipo := case p_tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'mantenimiento' then 'solicitud_mantenimiento'::tipo_atencion
      when 'mantenimiento_correctivo' then 'solicitud_mantenimiento'::tipo_atencion
      else null
    end;
  end if;
  if v_tipo is null or v_tipo not in ('puesta_en_marcha', 'problema_tecnico', 'soporte_tecnico', 'revision_garantia', 'capacitacion', 'otro') then
    return null;
  end if;

  if v_equipo is null then
    select m.equipo_id into v_equipo from maquinas_mencionadas(v_cuenta, v_mensaje) m order by m.orden limit 1;
  end if;

  -- 0555: ¿ya hay un caso abierto de este mismo problema? Se continúa ahí.
  v_existente := atencion_abierta_parecida(v_cuenta, v_tipo, v_equipo);
  if v_existente is not null then
    update atenciones
       set detalle = concat_ws(E'\n\n', detalle,
             format('[%s] El cliente volvió a comunicarse%s: %s',
                    to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
                    case when v_codigo_lead is not null then ' (' || v_codigo_lead || ')' else '' end,
                    coalesce(btrim(v_mensaje), 'sin detalle'))),
           equipo_id = coalesce(equipo_id, v_equipo),
           asignado_a = coalesce(p_asignado, asignado_a),
           oportunidad_id = coalesce(oportunidad_id, p_op),
           updated_at = now()
     where id = v_existente;
    return v_existente;
  end if;

  if v_equipo is not null then v_garantia := garantia_del_equipo(v_equipo); end if;

  insert into atenciones (
    cuenta_id, equipo_id, tipo, etapa, oportunidad_id, lead_id,
    asignado_a, recibido_por, registrado_at, detalle, es_prueba,
    en_garantia, hizo_preventivo, garantia_verificada_at, garantia_verificada_por, tipo_detalle
  )
  select v_cuenta, v_equipo, v_tipo, 'registro', p_op, p_lead,
         p_asignado, l.recibido_por, now(), l.mensaje, coalesce(l.es_prueba, false),
         (v_garantia->>'en_garantia')::boolean, (v_garantia->>'hizo_preventivo')::boolean,
         case when v_equipo is not null then now() end,
         case when v_equipo is not null then auth.uid() end,
         case when v_tipo = 'otro' then nullif(btrim(substring(split_part(l.mensaje, E'\n', 1) from '^[Oo]tro:(.*)$')), '') end
    from leads l where l.id = p_lead
  returning id into v_atencion;

  if v_atencion is not null and v_equipo is not null then
    insert into atencion_equipos (atencion_id, equipo_id, agregado_por)
    select v_atencion, m.equipo_id, auth.uid()
      from maquinas_mencionadas(v_cuenta, v_mensaje) m
     where m.equipo_id <> v_equipo
    on conflict do nothing;
  end if;
  return v_atencion;
end $function$;

-- Juntar dos casos que ya se duplicaron.
create or replace function public.unir_atenciones(p_desde uuid, p_hacia uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_d atenciones%rowtype;
  v_h atenciones%rowtype;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false) or auth.uid() is null) then
    raise exception 'Esto lo hace postventa, operaciones o gerencia';
  end if;
  if p_desde = p_hacia then raise exception 'Elija dos casos distintos'; end if;
  select * into v_d from atenciones where id = p_desde for update;
  select * into v_h from atenciones where id = p_hacia for update;
  if v_d.id is null or v_h.id is null then raise exception 'Uno de los casos no existe'; end if;
  if v_d.cuenta_id is distinct from v_h.cuenta_id then raise exception 'Los dos casos tienen que ser del mismo cliente'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Diga por qué se juntan'; end if;

  update atenciones
     set detalle = concat_ws(E'\n\n', detalle,
           format('[%s] Se le sumó %s (%s): %s', to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
                  v_d.codigo, btrim(p_motivo), coalesce(btrim(v_d.detalle), ''))),
         equipo_id = coalesce(equipo_id, v_d.equipo_id),
         updated_at = now()
   where id = p_hacia;
  update atenciones
     set unida_a = p_hacia, cerrado_at = coalesce(cerrado_at, now()), etapa = 'cierre',
         motivo_cierre = format('Unido a %s: %s', v_h.codigo, btrim(p_motivo)), updated_at = now()
   where id = p_desde;
  update atencion_equipos set atencion_id = p_hacia
   where atencion_id = p_desde
     and not exists (select 1 from atencion_equipos x where x.atencion_id = p_hacia and x.equipo_id = atencion_equipos.equipo_id);
end $function$;
revoke all on function public.unir_atenciones(uuid, uuid, text) from public;
grant execute on function public.unir_atenciones(uuid, uuid, text) to authenticated;
