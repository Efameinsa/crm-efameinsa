-- ============================================================
-- CRM EFAMEINSA · Migración 0141 · Derivar se suma al expediente abierto
-- ============================================================
-- Decidido por el ing. Carlos en la reunión del 01-09, sobre los casos del
-- PDF «MEJORAS EN EL CRM 31.08.26»:
--
--   «En la práctica, creo que va a tener que acumular. […] si es para el
--    mismo comercial, yo diría que se tendría que consolidar. […] Mejor que
--    lo acumule y ya si el mismo comercial le indicara que no es este tema,
--    ya podríamos dividirlo.» / «Debe de crearse automáticamente entonces.»
--
-- EL PROBLEMA: el mismo cliente entra dos veces (formulario web + WhatsApp,
-- con minutos de diferencia) y cada derivación abría su propia oportunidad
-- sobre la MISMA cuenta. El comercial trabajaba una; la gemela quedaba en
-- cero y «Lo que derivé» gritaba «nadie lo ha tocado» en falso. De 21
-- derivaciones «sin gestión» en 30 días, 7 eran esta falsa alarma (Nataly
-- Ludeña con 5 gestiones y USD 22.149 al lado; Alex Chávez con llamada y
-- Presu_2200-26 al lado; Fredd con la llamada y la consulta de stock).
--
-- LA REGLA (de Carlos, con la analogía del historial clínico):
--   · Mismo comercial + expediente ABIERTO y con movimiento → se ACUMULA.
--   · Distinta área (postventa) → expediente aparte, SIEMPRE: «ahí sí no
--     hay dificultad».
--   · Dividir un expediente acumulado por error: casi no pasa; queda para
--     después.
--
-- TRES PIEZAS:
--   1. `leads.oportunidad_id`: el lead recuerda a qué expediente fue a
--      parar (hasta hoy el vínculo era solo al revés, oportunidades.lead_id,
--      y un expediente solo podía recordar UN lead).
--   2. `asignar_lead` (parche sobre la definición viva): antes de abrir
--      expediente, busca uno abierto del mismo comercial en la misma cuenta
--      (origen crm, no postventa, con movimiento en los últimos 30 días).
--      Si existe, el lead se suma ahí.
--   3. Los gemelos vacíos que ya existen se fusionan con su expediente
--      trabajado — SOLO los casos inequívocos: gemelo sin una sola gestión,
--      cotización ni referencia de ninguna tabla, comercial que no es
--      postventa, y UN único expediente destino posible.
-- ============================================================

-- ── 1. El lead recuerda su expediente ─────────────────────────────────
alter table leads add column if not exists oportunidad_id uuid references oportunidades(id);
comment on column leads.oportunidad_id is
  'A qué oportunidad fue a parar esta derivación. Desde la 0141 un expediente puede juntar varios leads (el cliente que entra dos veces por dos canales); oportunidades.lead_id conserva solo el PRIMERO.';
create index if not exists ix_leads_oportunidad on leads (oportunidad_id) where oportunidad_id is not null;

update leads l
   set oportunidad_id = o.id
  from oportunidades o
 where o.lead_id = l.id
   and l.oportunidad_id is null;

-- ── 2. asignar_lead se suma al expediente abierto ─────────────────────
do $$
declare
  v_def    text;
  v_ancla  text;
  v_veces  integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'asignar_lead'
   limit 1;
  if v_def is null then
    raise exception 'No existe la función asignar_lead';
  end if;
  if v_def like '%CONSOLIDAR (Carlos%' then
    raise notice '0141: asignar_lead ya estaba parchada; no se toca.';
    return;
  end if;

  v_ancla := 'insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa, tipo_postventa)
  values (v_cuenta_id, v_lead.id, p_comercial_id, ''asignada'', p_tipo_postventa)
  returning id into v_oportunidad_id;';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0141: el anclaje del insert de oportunidades aparece % veces, no 1', v_veces;
  end if;
  v_def := replace(v_def, v_ancla,
'-- CONSOLIDAR (Carlos, reunión 01-09): si el cliente ya tiene un expediente
  -- ABIERTO con este MISMO comercial, el contacto se suma ahí en vez de
  -- abrir un gemelo. Solo casos comerciales (postventa siempre abre el
  -- suyo: «ese es otro expediente totalmente independiente»), solo
  -- expedientes del CRM (no cascarones del Excel histórico) y solo con
  -- movimiento reciente: un expediente quieto hace un mes es otra consulta.
  if not v_postventa and p_tipo_postventa is null then
    select o.id into v_oportunidad_id
      from oportunidades o
     where o.cuenta_id = v_cuenta_id
       and o.comercial_id = p_comercial_id
       and o.origen = ''crm''
       and o.tipo_postventa is null
       and o.etapa in (''asignada'', ''filtrada'', ''cotizada'', ''seguimiento'', ''potencial'')
       and o.updated_at >= now() - interval ''30 days''
     order by o.updated_at desc
     limit 1;
  end if;

  if v_oportunidad_id is null then
    insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa, tipo_postventa)
    values (v_cuenta_id, v_lead.id, p_comercial_id, ''asignada'', p_tipo_postventa)
    returning id into v_oportunidad_id;
  else
    -- Sumarse cuenta como movimiento: el expediente acaba de recibir un
    -- contacto nuevo del cliente.
    update oportunidades set updated_at = now() where id = v_oportunidad_id;
  end if;');

  v_ancla := 'estado = ''asignado'',';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0141: el anclaje del update de leads aparece % veces, no 1', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || '
    oportunidad_id = v_oportunidad_id,');

  execute v_def;
  raise notice '0141 aplicada: asignar_lead consolida en el expediente abierto.';
end $$;

-- ── 3. Fusionar los gemelos vacíos que ya existen ─────────────────────
-- Criterios inequívocos, verificados contra producción el 01-09 (con estos
-- criterios calzan 3: PRO-08939 Nataly, PRO-08962 Norabuena, PRO-08971 Alex;
-- los 2 de postventa tienen atenciones colgadas y quedan fuera, igual que
-- PRO-09083, que tiene TRES destinos posibles).
do $$
declare
  v_fila record;
  v_fusionados integer := 0;
begin
  for v_fila in
    with vacias as (
      select l.id as lead_id, l.codigo, l.asignado_a, l.cuenta_id, o.id as op_vacia
        from leads l
        join oportunidades o on o.lead_id = l.id
        join perfiles p on p.id = l.asignado_a
       where l.estado = 'asignado'
         and not l.es_prueba
         and not coalesce(p.es_postventa, false)
         and o.origen = 'crm'
         and o.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
         and not exists (select 1 from actividades a where a.oportunidad_id = o.id)
         and not exists (select 1 from cotizaciones c where c.oportunidad_id = o.id)
         and not exists (select 1 from ventas v where v.oportunidad_id = o.id)
         and not exists (select 1 from informes_cierre i where i.oportunidad_id = o.id)
         and not exists (select 1 from servicios_postventa s where s.oportunidad_id = o.id)
         and not exists (select 1 from atenciones t where t.oportunidad_id = o.id or t.oportunidad_origen = o.id)
         and not exists (select 1 from leads l2 where l2.oportunidad_id = o.id and l2.id <> l.id)
    )
    select v.lead_id, v.codigo, v.op_vacia,
           (array_agg(o2.id order by o2.updated_at desc))[1] as destino,
           count(*) as destinos
      from vacias v
      join oportunidades o2
        on o2.cuenta_id = v.cuenta_id
       and o2.id <> v.op_vacia
       and o2.comercial_id = v.asignado_a
       and o2.origen = 'crm'
       and o2.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
       and (exists (select 1 from actividades a where a.oportunidad_id = o2.id)
         or exists (select 1 from cotizaciones c where c.oportunidad_id = o2.id))
     group by v.lead_id, v.codigo, v.op_vacia
    having count(*) = 1
  loop
    update leads set oportunidad_id = v_fila.destino where id = v_fila.lead_id;
    delete from oportunidades where id = v_fila.op_vacia;
    v_fusionados := v_fusionados + 1;
    raise notice '0141: % fusionado — su gemelo vacío % se borró; el lead apunta a %',
      v_fila.codigo, v_fila.op_vacia, v_fila.destino;
  end loop;
  raise notice '0141: % gemelos fusionados.', v_fusionados;
end $$;
