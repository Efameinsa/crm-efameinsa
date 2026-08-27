-- ============================================================
-- CRM EFAMEINSA · Migración 0093 · Un comercial que además hace postventa
-- ============================================================
-- Darwin, 27-08: «la señorita C4 también tiene labores de servicio al cliente…
-- podríamos agregarle todos los campos del sidebar que corresponden a postventa
-- debajo de las opciones que ya tiene, con una señal que diga que es postventa».
--
-- EL PROBLEMA DE FONDO. `es_postventa` venía respondiendo TRES preguntas
-- distintas con un solo booleano:
--   1. ¿a qué puede entrar?      → permiso
--   2. ¿qué ve primero?          → navegación y aterrizaje
--   3. ¿cómo se la mide?         → en qué reporte entra
-- Para la cuenta PV las tres respuestas coinciden y el booleano alcanza. Para
-- Ariana divergen: sí debe entrar, debe seguir viendo lo comercial primero, y
-- debe seguir contando como vendedora. Prenderle `es_postventa` le apagaría la
-- barra de comercial y la sacaría del resumen de gerencia.
--
-- ENTONCES SE SEPARAN:
--   · `es_postventa`   → a qué área PERTENECE. Define dónde aterriza y cómo se
--     la mide. No se toca.
--   · `hace_postventa` → qué PUEDE HACER. Le suma las pantallas del área, con
--     alcance acotado a su propia cartera.
--
-- Y LA MEDICIÓN SE CORRIGE APARTE, que es lo que de verdad resuelve la clase de
-- problema: hasta hoy ninguna función de gerencia miraba `tipo_postventa`. Los
-- casos de garantía no ensuciaban los números por una casualidad —todos eran de
-- la cuenta PV, que está excluida por su perfil—, o sea que se protegía por DE
-- QUIÉN ES el caso y no por QUÉ ES. El primer caso que cayera en un comercial
-- se filtraba a su meta de 30 seguimientos y al embudo de gerencia.
--
-- Se mide el trabajo, no a la persona: una garantía no es una venta la atienda
-- quien la atienda.

-- ------------------------------------------------------------
-- 1. La capacidad, separada de la pertenencia
-- ------------------------------------------------------------
alter table perfiles add column if not exists hace_postventa boolean not null default false;

comment on column perfiles.hace_postventa is
  'Comercial que además atiende postventa de SUS clientes. Le suma las pantallas del área sin cambiarle el rol ni sacarlo del resumen de ventas (migración 0093).';

-- `es_postventa` implica poder: quien es del área, obviamente entra.
create or replace function puede_postventa()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_postventa or hace_postventa from perfiles where id = auth.uid()), false)
$$;

comment on function puede_postventa is
  'Puede usar las pantallas de postventa: por pertenecer al área o por tenerlo como tarea adicional. El ALCANCE lo decide cada política (migración 0093).';

-- ------------------------------------------------------------
-- 2. El alcance: su cartera, no el área entera
-- ------------------------------------------------------------
-- Privilegio mínimo por defecto. Ariana atiende a SUS clientes; para cubrir a
-- la persona de postventa cuando no está hace falta `es_postventa`, que es una
-- decisión aparte y deliberada de gerencia.
--
-- La lectura por cartera ya existía desde la 0087 (`servicios_pv_comercial`,
-- `equipos_lectura`, `informes_serv_lectura`). Lo que faltaba es poder ESCRIBIR:
-- sin esto, Ariana vería el despacho de su cliente y no podría marcar ni un
-- paso, que es peor que no dárselo.

create or replace function es_cliente_de(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cuentas c where c.id = p_cuenta and c.comercial_id = auth.uid())
$$;

drop policy if exists servicios_pv_cartera_escribe on servicios_postventa;
create policy servicios_pv_cartera_escribe on servicios_postventa for update to authenticated
  using (puede_postventa() and es_prueba = es_cuenta_prueba() and es_cliente_de(cuenta_id))
  with check (puede_postventa() and es_prueba = es_cuenta_prueba() and es_cliente_de(cuenta_id));

drop policy if exists equipos_cartera_escribe on equipos_instalados;
create policy equipos_cartera_escribe on equipos_instalados for update to authenticated
  using (puede_postventa() and es_prueba = es_cuenta_prueba() and es_cliente_de(cuenta_id))
  with check (puede_postventa() and es_prueba = es_cuenta_prueba() and es_cliente_de(cuenta_id));

drop policy if exists informes_serv_cartera_crea on informes_servicio;
create policy informes_serv_cartera_crea on informes_servicio for insert to authenticated
  with check (puede_postventa() and es_prueba = es_cuenta_prueba() and es_cliente_de(cuenta_id));

drop policy if exists informes_serv_cartera_edita on informes_servicio;
create policy informes_serv_cartera_edita on informes_servicio for update to authenticated
  using (puede_postventa() and es_prueba = es_cuenta_prueba() and es_cliente_de(cuenta_id))
  with check (puede_postventa() and es_prueba = es_cuenta_prueba() and es_cliente_de(cuenta_id));

drop policy if exists soporte_cartera on soporte_tecnico;
create policy soporte_cartera on soporte_tecnico for select to authenticated
  using (
    es_prueba = es_cuenta_prueba()
    and puede_postventa()
    and es_cliente_de(cuenta_id)
  );

-- ------------------------------------------------------------
-- 3. La supervisión separa las dos columnas
-- ------------------------------------------------------------
-- «Gestiones de venta 24 / 30 · Postventa 6». El día de Ariana se ve completo
-- —no parece que trabajó poco— y la meta sigue midiendo lo que dice medir.
--
-- Se toma la definición VIVA y se le inyectan los cambios, igual que hicieron
-- la 0072, la 0075 y la 0078: copiar una función de 150 líneas que ya se
-- redefinió cinco veces es la forma segura de perder algo por el camino. Si el
-- texto esperado no está, se levanta el error: una corrección que falla en
-- silencio es peor que no hacerla.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'supervision_diaria' limit 1;
  if v_def is null then raise exception 'No existe supervision_diaria'; end if;

  -- 3.1 El conteo de gestiones distingue por el tipo de la oportunidad.
  --     Una actividad suelta (sin oportunidad) cuenta como comercial: es lo que
  --     era antes de esta migración y no hay razón para cambiarlo.
  v_nuevo := replace(
    v_def,
    '    from actividades a
    left join catalogo_resultados_gestion r on r.id = a.resultado_id
    where a.realizada_por = p.id',
    '    from actividades a
    left join catalogo_resultados_gestion r on r.id = a.resultado_id
    left join oportunidades op_a on op_a.id = a.oportunidad_id
    where a.realizada_por = p.id
      and op_a.tipo_postventa is null'
  );
  if v_nuevo = v_def then raise exception 'No se encontró el bloque de actividades en supervision_diaria'; end if;
  v_def := v_nuevo;

  -- 3.2 Su columna propia: la carga de postventa, visible y aparte.
  v_nuevo := replace(
    v_def,
    '  left join lateral (
    select coalesce(jsonb_object_agg(t.tipo, t.n), ''{}''::jsonb) as por_tipo',
    '  left join lateral (
    select count(*) as n
    from actividades a2
    join oportunidades op_b on op_b.id = a2.oportunidad_id
    where a2.realizada_por = p.id
      and (a2.realizada_at at time zone ''America/Lima'')::date = v_fecha
      and a2.tipo in (''llamada'', ''whatsapp'', ''email'', ''visita'', ''reunion_online'')
      and op_b.tipo_postventa is not null
  ) pv on true
  left join lateral (
    select coalesce(jsonb_object_agg(t.tipo, t.n), ''{}''::jsonb) as por_tipo'
  );
  if v_nuevo = v_def then raise exception 'No se encontró el bloque por_tipo en supervision_diaria'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(
    v_def,
    '           ''cumple_meta'', coalesce(a.efectivos, 0) >= v_meta,',
    '           ''cumple_meta'', coalesce(a.efectivos, 0) >= v_meta,
           ''gestiones_postventa'', coalesce(pv.n, 0),
           ''hace_postventa'', p.hace_postventa,'
  );
  if v_nuevo = v_def then raise exception 'No se encontró cumple_meta en supervision_diaria'; end if;
  v_def := v_nuevo;

  -- 3.3 El total del día también, para que el encabezado cierre.
  v_nuevo := replace(
    v_def,
    '    ''seguimientos_efectivos'', coalesce(sum((c->>''seguimientos_efectivos'')::int), 0),',
    '    ''seguimientos_efectivos'', coalesce(sum((c->>''seguimientos_efectivos'')::int), 0),
    ''gestiones_postventa'', coalesce(sum((c->>''gestiones_postventa'')::int), 0),'
  );
  if v_nuevo = v_def then raise exception 'No se encontró el total de seguimientos en supervision_diaria'; end if;

  execute v_nuevo;
end $$;

comment on function supervision_diaria(date) is
  'Consolidado del día por comercial. Las gestiones sobre casos de postventa se cuentan aparte y NO entran en la meta de seguimientos: una garantía no es una venta la atienda quien la atienda (migración 0093).';

-- ------------------------------------------------------------
-- 4. Los casos de postventa salen del embudo y del pipeline
-- ------------------------------------------------------------
-- Tres puntos en `resumen_gerencia` cuentan oportunidades: el conjunto `op_p`,
-- el embudo por etapa y el detalle por comercial. Los tres tienen que ignorar
-- los casos de postventa, o una garantía marcada «ejecutado» —que se guarda
-- como etapa `venta`— entraría al reporte como venta ganada.
do $$
declare
  v_def text;
  v_nuevo text;
  v_n integer := 0;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'resumen_gerencia' limit 1;
  if v_def is null then raise exception 'No existe resumen_gerencia'; end if;

  v_nuevo := replace(
    v_def,
    '  op_p as (
    select * from oportunidades
    where (p_comercial is null or comercial_id = p_comercial)
      and origen = ''crm''
  )',
    '  op_p as (
    select * from oportunidades
    where (p_comercial is null or comercial_id = p_comercial)
      and origen = ''crm''
      and tipo_postventa is null
  )'
  );
  if v_nuevo <> v_def then v_n := v_n + 1; v_def := v_nuevo; end if;

  v_nuevo := replace(
    v_def,
    '    from oportunidades
    where (created_at at time zone ''America/Lima'')::date between p_desde and p_hasta
      and (p_comercial is null or comercial_id = p_comercial)
      and origen = ''crm''
    group by etapa',
    '    from oportunidades
    where (created_at at time zone ''America/Lima'')::date between p_desde and p_hasta
      and (p_comercial is null or comercial_id = p_comercial)
      and origen = ''crm''
      and tipo_postventa is null
    group by etapa'
  );
  if v_nuevo <> v_def then v_n := v_n + 1; v_def := v_nuevo; end if;

  v_nuevo := replace(
    v_def,
    '    from oportunidades o
    where o.comercial_id = p.id and o.origen = ''crm''
  ) o on true',
    '    from oportunidades o
    where o.comercial_id = p.id and o.origen = ''crm'' and o.tipo_postventa is null
  ) o on true'
  );
  if v_nuevo <> v_def then v_n := v_n + 1; v_def := v_nuevo; end if;

  if v_n < 3 then
    raise exception 'Solo se pudieron corregir % de los 3 conteos de oportunidades en resumen_gerencia', v_n;
  end if;

  execute v_def;
end $$;

comment on function resumen_gerencia(date, date, uuid, boolean) is
  'Resumen comercial del período. Los casos de postventa quedan fuera del embudo, del pipeline y de las ganadas: no son ventas (migración 0093).';
