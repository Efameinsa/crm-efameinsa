-- 0567 · Cada gestión pertenece a un caso; las fichas gemelas se reconocen
--
-- GERENCIA, reunión del 20-10-2026 15:45 (Pepas de Oro, Lino Espíritu):
--   «Nunca se termina un caso… están superponiendo los casos uno encima del otro.»
--   «Cuando tú ingresas una llamada tienes que indicar a qué caso estás hablando…
--    tiene que obligarme a mí cuando hago el registro… check, check.»
--   «Para cada caso un color específico para reconocer.»
--   «Volvemos a lo mismo… la desigualdad de dos fichas» (Lino: DNI 44224120 y
--    RUC 10442241207, dos casos abiertos por la misma secadora).
--
-- QUÉ HACE
--   · actividades.atencion_id: la gestión dice de qué caso es. Una gestión de
--     dos casos se guarda como dos filas en el mismo clic (mismo lote).
--   · cuentas_gemelas(cuenta): la propia ficha, las unidas a ella o en la que
--     está unida, las del mismo RUC/DNI y la persona natural cuyo RUC 10 lleva
--     su DNI adentro (10 + DNI + dígito).
--   · atencion_abierta_parecida mira las gemelas y la máquina en cualquier
--     ficha (antes, solo la misma cuenta_id).
--   · leads.caso_elegido / caso_nuevo_motivo: lo que Central eligió al derivar;
--     crear_atencion_de_lead lo respeta.
--   · atencion_deja_gestion: la nota automática lleva el caso y anota la
--     reclasificación.
--   · Relleno: gestiones de un expediente con un solo caso vivo en esa fecha.

alter table public.actividades
  add column if not exists atencion_id uuid references public.atenciones(id) on delete set null;
create index if not exists ix_actividades_atencion on public.actividades (atencion_id) where atencion_id is not null;
comment on column public.actividades.atencion_id is
  '0567: el caso al que pertenece la gestión (gerencia 20-10). Null = no es de ningún caso.';

alter table public.leads
  add column if not exists caso_elegido uuid references public.atenciones(id) on delete set null,
  add column if not exists caso_nuevo_motivo text;
comment on column public.leads.caso_elegido is '0567: Central dijo que esta derivación es de este caso abierto.';
comment on column public.leads.caso_nuevo_motivo is '0567: Central dijo que es otro problema aunque había un caso abierto, y por qué.';

create or replace function public.cuentas_gemelas(p_cuenta uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with base as (
    select c.id, c.num_doc, c.fusionada_en from cuentas c where c.id = p_cuenta
  ), raiz as (
    select coalesce(b.fusionada_en, b.id) as id from base b
  ), docs as (
    select distinct x.d from (
      select c.num_doc as d from cuentas c where c.id in (select id from raiz)
      union select b.num_doc from base b
    ) x where x.d ~ '^[0-9]{8}$' or x.d ~ '^[0-9]{11}$'
  )
  select p_cuenta
  union select id from raiz
  union select c.id from cuentas c where c.fusionada_en in (select id from raiz union select p_cuenta)
  union select c.id from cuentas c, docs where c.num_doc = docs.d
  -- persona natural: RUC 10 + DNI + dígito, en los dos sentidos
  union select c.id from cuentas c, docs where docs.d ~ '^10[0-9]{9}$' and c.num_doc = substr(docs.d, 3, 8)
  union select c.id from cuentas c, docs where docs.d ~ '^[0-9]{8}$' and c.num_doc ~ '^10[0-9]{9}$' and substr(c.num_doc, 3, 8) = docs.d
$$;
grant execute on function public.cuentas_gemelas(uuid) to authenticated, service_role;

create or replace function public.atencion_abierta_parecida(p_cuenta uuid, p_tipo tipo_atencion, p_equipo uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from atenciones a
   where a.cerrado_at is null and a.unida_a is null
     and (
       -- la misma máquina, en cualquier ficha (Lino 20-10)
       (p_equipo is not null and (a.equipo_id = p_equipo
          or exists (select 1 from atencion_equipos ae where ae.atencion_id = a.id and ae.equipo_id = p_equipo)))
       or (a.cuenta_id in (select cuentas_gemelas(p_cuenta)) and a.tipo = p_tipo
           and (p_equipo is null or a.equipo_id is null or a.equipo_id = p_equipo))
     )
   order by (p_equipo is not null and a.equipo_id is not distinct from p_equipo) desc, a.created_at asc
   limit 1
$$;
grant execute on function public.atencion_abierta_parecida(uuid, tipo_atencion, uuid) to authenticated, service_role;

-- Los casos abiertos de un cliente (con sus gemelas), para elegir al anotar.
-- La acción del servidor comprueba antes que quien pide puede ver el
-- expediente (con su sesión); esto solo arma la lista.
create or replace function public.casos_abiertos_de_cuenta(p_cuenta uuid)
returns table (id uuid, codigo text, tipo text, tipo_detalle text, etapa text, equipo text,
               serie text, abierto_at timestamptz, lleva text, cuenta_id uuid, otra_ficha text)
language sql stable security definer set search_path = public as $$
  select a.id, a.codigo, a.tipo::text, a.tipo_detalle, a.etapa::text,
         coalesce(nullif(btrim(ei.modelo_texto), ''), a.equipo_texto),
         ei.serie, a.created_at,
         coalesce(pt.nombre, pa.nombre),
         a.cuenta_id,
         case when a.cuenta_id <> p_cuenta then c.razon_social || coalesce(' · ' || c.tipo_doc || ' ' || c.num_doc, '') end
    from atenciones a
    left join equipos_instalados ei on ei.id = a.equipo_id
    left join perfiles pt on pt.id = a.tomada_por
    left join perfiles pa on pa.id = a.asignado_a
    left join cuentas c on c.id = a.cuenta_id
   where a.cuenta_id in (select cuentas_gemelas(p_cuenta))
     and a.cerrado_at is null and a.unida_a is null
   order by a.created_at
$$;
revoke execute on function public.casos_abiertos_de_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.casos_abiertos_de_cuenta(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.crear_atencion_de_lead(p_op uuid, p_lead uuid, p_tipo_postventa tipo_postventa, p_asignado uuid)
 RETURNS uuid
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
  v_cuenta uuid;
  v_existente uuid;
  v_codigo_lead text;
  v_elegido uuid;
  v_nuevo_motivo text;
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
  -- 0567 (gerencia 20-10, «tienes que indicar a qué caso estás hablando»):
  -- si Central eligió el caso al derivar, manda su elección; si dijo «es otro
  -- problema», se abre uno nuevo aunque haya un parecido. Si no eligió nada
  -- (derivaciones viejas, procesos automáticos), sigue la búsqueda de la 0555,
  -- que ahora mira también las fichas gemelas y la máquina.
  select l.caso_elegido, l.caso_nuevo_motivo into v_elegido, v_nuevo_motivo from leads l where l.id = p_lead;
  if v_elegido is not null and exists (select 1 from atenciones x where x.id = v_elegido and x.cerrado_at is null and x.unida_a is null) then
    v_existente := v_elegido;
  elsif v_nuevo_motivo is not null then
    v_existente := null;
  else
    v_existente := atencion_abierta_parecida(v_cuenta, v_tipo, v_equipo);
  end if;
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
         p_asignado, l.recibido_por, now(), concat_ws(E'\n\n', l.mensaje, case when v_nuevo_motivo is not null then 'Central: es otro problema. ' || v_nuevo_motivo end), coalesce(l.es_prueba, false),
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

CREATE OR REPLACE FUNCTION public.unir_atenciones(p_desde uuid, p_hacia uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_d.cuenta_id is distinct from v_h.cuenta_id and v_d.cuenta_id not in (select cuentas_gemelas(v_h.cuenta_id)) then raise exception 'Los dos casos tienen que ser del mismo cliente (o de fichas que son el mismo cliente)'; end if;
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

CREATE OR REPLACE FUNCTION public.atencion_deja_gestion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quien uuid := auth.uid();
  v_tipo text := replace(new.tipo::text, '_', ' ');
  v_notas text[] := '{}';
  v_nota text;
begin
  if v_quien is null or new.oportunidad_id is null then return new; end if;

  if coalesce(new.diagnostico, '') <> '' and new.diagnostico is distinct from old.diagnostico then
    v_notas := v_notas || format('[Atención %s] Diagnóstico: %s', v_tipo, new.diagnostico);
  end if;
  if coalesce(new.trabajo_realizado, '') <> '' and new.trabajo_realizado is distinct from old.trabajo_realizado then
    v_notas := v_notas || format('[Atención %s] Trabajo realizado: %s', v_tipo, new.trabajo_realizado);
  end if;
  if coalesce(new.pruebas_detalle, '') <> '' and new.pruebas_detalle is distinct from old.pruebas_detalle then
    v_notas := v_notas || format('[Atención %s] Pruebas: %s', v_tipo, new.pruebas_detalle);
  end if;
  if new.cerrado_at is not null and old.cerrado_at is null then
    v_notas := v_notas || format('[Atención %s] Cerrada (%s): %s', v_tipo,
      case new.resultado::text when 'resuelto' then 'resuelto' when 'no_procede' then 'no procede'
        when 'derivado' then 'derivado' else 'sin resultado' end,
      coalesce(nullif(new.motivo_cierre, ''), 'sin motivo escrito'));
  end if;
  if new.etapa::text = 'seguimiento' and old.etapa::text <> 'seguimiento' then
    v_notas := v_notas || format('[Atención %s] Pasa a seguimiento. Queda pendiente: %s', v_tipo,
      coalesce(nullif(new.seguimiento_nota, ''), 'no se anotó'));
  elsif old.etapa::text = 'seguimiento' and new.etapa::text <> 'seguimiento' then
    v_notas := v_notas || format('[Atención %s] Seguimiento terminado: %s', v_tipo,
      coalesce(nullif(new.seguimiento_nota, ''), 'sin nota'));
  end if;

  -- 0567 (gerencia 20-10): «una vez que reclasificas… debería salir en la línea de tiempo».
  if new.tipo is distinct from old.tipo then
    v_notas := v_notas || format('[Atención %s] Reclasificado: era %s, ahora es %s', v_tipo,
      replace(old.tipo::text, '_', ' '), v_tipo);
  end if;

  -- 0567: cada nota sabe de qué caso es (el historial la pinta con su color).
  foreach v_nota in array v_notas loop
    insert into actividades (oportunidad_id, tipo, nota, realizada_por, atencion_id)
    values (new.oportunidad_id, 'nota', v_nota, v_quien, new.id);
  end loop;
  return new;
end $function$;

-- Relleno hacia atrás, sin inventar: una gestión entra a un caso solo si su
-- expediente tenía UN caso vivo en ese momento.
with cand as (
  select ac.id as act, (array_agg(a.id))[1] as caso, count(*) n
    from actividades ac
    join atenciones a on a.oportunidad_id = ac.oportunidad_id and a.unida_a is null
     and ac.realizada_at >= a.created_at - interval '1 minute'
     and ac.realizada_at <= coalesce(a.cerrado_at, now()) + interval '1 minute'
   where ac.atencion_id is null
   group by ac.id
)
update actividades x set atencion_id = cand.caso from cand where cand.act = x.id and cand.n = 1;
