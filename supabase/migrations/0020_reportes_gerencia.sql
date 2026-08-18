-- ============================================================
-- CRM EFAMEINSA · Migración 0020 · Reportes de gerencia fiables
-- ============================================================
-- Motivo (auditoría 2026-08-18): las páginas de gerencia traían TODAS las
-- filas de oportunidades/ventas al servidor Next y contaban en memoria.
-- supabase-js devuelve máximo 1.000 filas por consulta y la base ya tiene
-- 1.568 oportunidades → el embudo y la tabla por comercial estaban
-- truncados sin avisar. Además el panel del comercial hacía
-- `.in("oportunidad_id", <800 uuids>)` (URL demasiado larga → consulta
-- fallida → velocímetro en 0 aunque hubiera ventas).
--
-- Solución: las agregaciones viven en Postgres. Esta migración agrega:
--   1. `origen` en oportunidades/ventas: 'crm' (registrado en el sistema)
--      vs 'historico_excel' (importado de las hojas COTIZ). Gerencia puede
--      excluir el histórico de cualquier reporte con un clic.
--   2. `parametros`: tipo de cambio USD→PEN editable por gerencia. Las
--      ventas están en USD y el gasto de Meta Ads en PEN — sin esto no se
--      puede calcular ROAS/CPA honestamente.
--   3. `v_ventas_detalle`: una venta con su comercial, cliente y lead de
--      origen (canal/fuente/campaña) en una sola fila.
--   4. `resumen_gerencia()`: TODOS los números del panel en una llamada,
--      con filtro de período, comercial y origen.

-- ------------------------------------------------------------
-- 1. Origen del dato
-- ------------------------------------------------------------
alter table oportunidades add column if not exists origen text not null default 'crm'
  check (origen in ('crm', 'historico_excel'));
alter table ventas add column if not exists origen text not null default 'crm'
  check (origen in ('crm', 'historico_excel'));
create index if not exists ix_ventas_origen_fecha on ventas (origen, fecha_venta);
create index if not exists ix_oportunidades_origen on oportunidades (origen);

-- Lo ya importado por scripts/importar-ventas-historicas.mjs se reconoce por
-- la nota fija que dejó ese script.
update ventas set origen = 'historico_excel'
  where notas = 'Importado de histórico — sin cotización asociada.';
update oportunidades o set origen = 'historico_excel'
  where exists (select 1 from actividades a where a.oportunidad_id = o.id and a.nota like '[Histórico venta%');

-- ------------------------------------------------------------
-- 2. Parámetros de gerencia (tipo de cambio)
-- ------------------------------------------------------------
create table if not exists parametros (
  clave        text primary key,
  valor        numeric(12,4) not null,
  descripcion  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references perfiles (id)
);
alter table parametros enable row level security;
drop policy if exists parametros_select on parametros;
create policy parametros_select on parametros for select to authenticated using (true);
drop policy if exists parametros_write on parametros;
create policy parametros_write on parametros for all to authenticated
  using (es_backoffice()) with check (es_backoffice());

-- ⚠️ 3.75 es un valor de arranque para que los cálculos no queden vacíos:
-- gerencia debe fijar el T.C. real desde Admin → Catálogos.
insert into parametros (clave, valor, descripcion) values
  ('tc_usd_pen', 3.75, 'Tipo de cambio USD → PEN usado para comparar ventas (USD) contra gasto publicitario (PEN). Lo fija gerencia.')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 3. Vista: venta con todo su contexto
-- ------------------------------------------------------------
create or replace view v_ventas_detalle with (security_invoker = on) as
select v.id,
       v.fecha_venta,
       v.monto_total,
       v.moneda,
       v.serie,
       v.origen,
       v.oportunidad_id,
       v.cotizacion_id,
       o.comercial_id,
       p.nombre            as comercial_nombre,
       p.codigo_comercial,
       o.cuenta_id,
       c.razon_social,
       c.tipo_doc,
       c.num_doc,
       c.departamento,
       c.rubro_id,
       o.lead_id,
       l.canal,
       l.fuente,
       l.utm_campaign,
       -- Cómo llegó el cliente que compró: publicidad / contacto entrante /
       -- cartera propia (sin lead) / histórico Excel.
       case
         when v.origen = 'historico_excel' then 'historico_excel'
         when l.id is null then 'cartera'
         when l.fuente in ('google_ads', 'meta_ads') then l.fuente
         else 'contacto_' || l.canal::text
       end                 as via_adquisicion
from ventas v
join oportunidades o on o.id = v.oportunidad_id
join perfiles p      on p.id = o.comercial_id
join cuentas c       on c.id = o.cuenta_id
left join leads l    on l.id = o.lead_id;

-- ------------------------------------------------------------
-- 4. Resumen de gerencia (todas las agregaciones en una llamada)
-- ------------------------------------------------------------
-- p_desde/p_hasta: rango inclusivo. p_comercial: null = todos.
-- p_incluir_historico: false = solo lo registrado en el CRM.
-- Devuelve jsonb con: kpis, serie_mensual, embudo, por_comercial,
-- via_adquisicion, top_clientes, calidad_datos.
create or replace function resumen_gerencia(
  p_desde date,
  p_hasta date,
  p_comercial uuid default null,
  p_incluir_historico boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tc         numeric := coalesce((select valor from parametros where clave = 'tc_usd_pen'), 3.75);
  v_meses      integer := greatest(1,
                 (extract(year from p_hasta) - extract(year from p_desde)) * 12
                 + (extract(month from p_hasta) - extract(month from p_desde)) + 1);
  v_kpis       jsonb;
  v_serie      jsonb;
  v_embudo     jsonb;
  v_comercial  jsonb;
  v_via        jsonb;
  v_top        jsonb;
  v_calidad    jsonb;
begin
  if not es_backoffice() and (p_comercial is null or p_comercial <> auth.uid()) then
    raise exception 'No autorizado';
  end if;

  -- ---------- KPIs ----------
  with ventas_p as (
    select * from v_ventas_detalle
    where fecha_venta between p_desde and p_hasta
      and (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm')
  ),
  -- Primera venta histórica de cada cuenta (para saber si un comprador del
  -- período es nuevo o recurrente): se mira TODO el historial, no el rango.
  primera_venta as (
    select cuenta_id, min(fecha_venta) as primera
    from v_ventas_detalle
    where (p_incluir_historico or origen = 'crm')
    group by cuenta_id
  ),
  compradores as (
    select vp.cuenta_id,
           sum(case when vp.moneda = 'USD' then vp.monto_total else vp.monto_total / v_tc end) as monto_usd,
           count(*) as n,
           (pv.primera < p_desde) as recurrente
    from ventas_p vp join primera_venta pv on pv.cuenta_id = vp.cuenta_id
    group by vp.cuenta_id, pv.primera
  ),
  -- Valor de vida (CLTV) sobre todo el historial disponible.
  cltv as (
    select cuenta_id,
           sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end) as total_usd,
           count(*) as n
    from v_ventas_detalle
    where (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm')
    group by cuenta_id
  ),
  op_p as (
    select * from oportunidades
    where (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm')
  )
  select jsonb_build_object(
    'tc_usd_pen',            v_tc,
    'meses_periodo',         v_meses,
    'ventas_usd',            coalesce((select sum(monto_total) from ventas_p where moneda = 'USD'), 0),
    'ventas_pen',            coalesce((select sum(monto_total) from ventas_p where moneda = 'PEN'), 0),
    'ventas_usd_equiv',      coalesce((select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) from ventas_p), 0),
    'n_ventas',              (select count(*) from ventas_p),
    'ticket_promedio_usd',   coalesce((select avg(case when moneda='USD' then monto_total else monto_total / v_tc end) from ventas_p), 0),
    'pipeline_usd',          coalesce((select sum(monto_estimado) from op_p where etapa not in ('venta','rechazada','derivada')), 0),
    'n_abiertas',            (select count(*) from op_p where etapa not in ('venta','rechazada','derivada')),
    'op_creadas',            (select count(*) from op_p where created_at::date between p_desde and p_hasta),
    'op_ganadas',            (select count(*) from op_p where etapa = 'venta' and coalesce(cerrada_at, updated_at)::date between p_desde and p_hasta),
    'op_rechazadas',         (select count(*) from op_p where etapa = 'rechazada' and cerrada_at::date between p_desde and p_hasta),
    'leads_recibidos',       (select count(*) from leads where recibido_at::date between p_desde and p_hasta
                                and (p_comercial is null or asignado_a = p_comercial)),
    'leads_publicidad',      (select count(*) from leads where recibido_at::date between p_desde and p_hasta
                                and fuente in ('google_ads','meta_ads')
                                and (p_comercial is null or asignado_a = p_comercial)),
    'leads_sin_asignar',     (select count(*) from leads where estado = 'pendiente_triaje'),
    'cot_por_aprobar',       (select count(*) from cotizaciones where estado_aprobacion = 'pendiente_gerencia'),
    'cot_enviadas',          (select count(*) from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
                                where cz.enviada_at::date between p_desde and p_hasta
                                and (p_comercial is null or o.comercial_id = p_comercial)),
    'clientes_con_venta',    (select count(*) from compradores),
    'clientes_nuevos',       (select count(*) from compradores where not recurrente),
    'clientes_recurrentes',  (select count(*) from compradores where recurrente),
    'monto_recurrentes_usd', coalesce((select sum(monto_usd) from compradores where recurrente), 0),
    'monto_nuevos_usd',      coalesce((select sum(monto_usd) from compradores where not recurrente), 0),
    'cltv_promedio_usd',     coalesce((select avg(total_usd) from cltv), 0),
    'cltv_recurrentes_usd',  coalesce((select avg(total_usd) from cltv where n >= 2), 0),
    'clientes_historicos',   (select count(*) from cltv),
    'clientes_recurrentes_historicos', (select count(*) from cltv where n >= 2),
    'frecuencia_promedio',   coalesce((select avg(n) from cltv), 0)
  ) into v_kpis;

  -- ---------- Serie mensual (12 meses hasta p_hasta) ----------
  with meses as (
    select generate_series(date_trunc('month', p_hasta) - interval '11 months', date_trunc('month', p_hasta), interval '1 month')::date as mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ventas_usd', coalesce(x.ventas_usd, 0),
           'n_ventas', coalesce(x.n, 0)
         ) order by m.mes), '[]'::jsonb)
  into v_serie
  from meses m
  left join lateral (
    select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as ventas_usd, count(*) as n
    from v_ventas_detalle
    where date_trunc('month', fecha_venta)::date = m.mes
      and (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm')
  ) x on true;

  -- ---------- Embudo: oportunidades CREADAS en el período, por etapa actual ----------
  select coalesce(jsonb_object_agg(etapa, n), '{}'::jsonb) into v_embudo
  from (
    select etapa::text, count(*) as n
    from oportunidades
    where created_at::date between p_desde and p_hasta
      and (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm')
    group by etapa
  ) e;

  -- ---------- Por comercial ----------
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'nombre', p.nombre, 'codigo', p.codigo_comercial,
           'meta_mensual', p.meta_mensual,
           'meta_periodo', coalesce(p.meta_mensual, 0) * v_meses,
           'ventas_usd', coalesce(v.ventas_usd, 0),
           'n_ventas', coalesce(v.n, 0),
           'clientes', coalesce(v.clientes, 0),
           'op_creadas', coalesce(o.creadas, 0),
           'op_abiertas', coalesce(o.abiertas, 0),
           'op_ganadas', coalesce(o.ganadas, 0),
           'op_rechazadas', coalesce(o.rechazadas, 0),
           'pipeline_usd', coalesce(o.pipeline, 0),
           'cot_enviadas', coalesce(cz.enviadas, 0),
           'cotizado_usd', coalesce(cz.cotizado, 0)
         ) order by coalesce(v.ventas_usd, 0) desc, p.codigo_comercial), '[]'::jsonb)
  into v_comercial
  from perfiles p
  left join lateral (
    select sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as ventas_usd,
           count(*) as n, count(distinct cuenta_id) as clientes
    from v_ventas_detalle d
    where d.comercial_id = p.id and d.fecha_venta between p_desde and p_hasta
      and (p_incluir_historico or d.origen = 'crm')
  ) v on true
  left join lateral (
    select count(*) filter (where created_at::date between p_desde and p_hasta) as creadas,
           count(*) filter (where etapa not in ('venta','rechazada','derivada')) as abiertas,
           count(*) filter (where etapa = 'venta' and coalesce(cerrada_at, updated_at)::date between p_desde and p_hasta) as ganadas,
           count(*) filter (where etapa = 'rechazada' and cerrada_at::date between p_desde and p_hasta) as rechazadas,
           sum(monto_estimado) filter (where etapa not in ('venta','rechazada','derivada')) as pipeline
    from oportunidades o
    where o.comercial_id = p.id and (p_incluir_historico or o.origen = 'crm')
  ) o on true
  left join lateral (
    select count(*) as enviadas, sum(cz.total) as cotizado
    from cotizaciones cz join oportunidades o2 on o2.id = cz.oportunidad_id
    where o2.comercial_id = p.id and cz.enviada_at::date between p_desde and p_hasta
  ) cz on true
  where p.rol = 'comercial' and p.activo
    and (p_comercial is null or p.id = p_comercial);

  -- ---------- Vía de adquisición de las ventas del período ----------
  select coalesce(jsonb_agg(jsonb_build_object('via', via, 'n', n, 'monto_usd', monto_usd) order by monto_usd desc), '[]'::jsonb)
  into v_via
  from (
    select via_adquisicion as via, count(*) as n,
           sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as monto_usd
    from v_ventas_detalle
    where fecha_venta between p_desde and p_hasta
      and (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm')
    group by via_adquisicion
  ) x;

  -- ---------- Top clientes del período ----------
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', cuenta_id, 'razon_social', razon_social, 'n', n, 'monto_usd', monto_usd,
           'comercial', comercial_nombre) order by monto_usd desc), '[]'::jsonb)
  into v_top
  from (
    select cuenta_id, min(razon_social) as razon_social, min(comercial_nombre) as comercial_nombre, count(*) as n,
           sum(case when moneda='USD' then monto_total else monto_total / v_tc end) as monto_usd
    from v_ventas_detalle
    where fecha_venta between p_desde and p_hasta
      and (p_comercial is null or comercial_id = p_comercial)
      and (p_incluir_historico or origen = 'crm')
    group by cuenta_id
    order by monto_usd desc
    limit 10
  ) x;

  -- ---------- Calidad de datos (lo que resta fiabilidad, dicho de frente) ----------
  select jsonb_build_object(
    'ventas_historicas_sin_monto', (select count(*) from oportunidades o where o.origen = 'historico_excel' and o.etapa = 'venta'
                                      and not exists (select 1 from ventas v where v.oportunidad_id = o.id)
                                      and (p_comercial is null or o.comercial_id = p_comercial)),
    'ventas_sin_serie',            (select count(*) from ventas where serie is null),
    'cuentas_sin_documento',       (select count(*) from cuentas c where c.tipo_doc = 'SIN_DOC'
                                      and (p_comercial is null or c.comercial_id = p_comercial)),
    'ventas_historicas_total',     (select count(*) from ventas where origen = 'historico_excel'),
    'ventas_crm_total',            (select count(*) from ventas where origen = 'crm'),
    'primer_lead_publicidad',      (select min(recibido_at)::date from leads where fuente in ('google_ads','meta_ads'))
  ) into v_calidad;

  return jsonb_build_object(
    'kpis', v_kpis,
    'serie_mensual', v_serie,
    'embudo', v_embudo,
    'por_comercial', v_comercial,
    'via_adquisicion', v_via,
    'top_clientes', v_top,
    'calidad_datos', v_calidad
  );
end $$;

revoke all on function resumen_gerencia(date, date, uuid, boolean) from public;
grant execute on function resumen_gerencia(date, date, uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 5. Listado de clientes paginado + filtrado (evita el tope de 1.000 filas
--    y hace el conteo de oportunidades abiertas en la misma consulta)
-- ------------------------------------------------------------
create or replace function listar_clientes(
  p_q text default null,
  p_comercial uuid default null,
  p_solo_con_venta boolean default false,
  p_solo_sin_doc boolean default false,
  p_orden text default 'recientes',   -- 'recientes' | 'nombre' | 'ultima_venta' | 'valor'
  p_limite integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_total bigint;
  v_filas jsonb;
  v_tel   text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
begin
  with base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.distrito, c.departamento, c.comercial_id,
           c.ultima_venta_at, c.created_at,
           p.nombre as comercial_nombre, p.codigo_comercial,
           (select count(*) from oportunidades o where o.cuenta_id = c.id and o.etapa not in ('venta','rechazada','derivada')) as abiertas,
           (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = c.id) as n_ventas,
           (select coalesce(sum(v.monto_total), 0) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = c.id and v.moneda = 'USD') as total_usd
    from cuentas c
    left join perfiles p on p.id = c.comercial_id
    where (p_comercial is null or c.comercial_id = p_comercial)
      and (not p_solo_con_venta or c.ultima_venta_at is not null)
      and (not p_solo_sin_doc or c.tipo_doc = 'SIN_DOC')
      and (
        p_q is null or p_q = ''
        or c.razon_social ilike '%' || p_q || '%'
        or c.num_doc ilike '%' || p_q || '%'
        or (v_tel is not null and length(v_tel) >= 6 and exists (
              select 1 from contactos ct where ct.cuenta_id = c.id and ct.telefono_normalizado like '%' || v_tel || '%'))
      )
  ),
  contado as (select count(*) as total from base),
  pagina as (
    select * from base
    order by
      case when p_orden = 'nombre' then razon_social end asc,
      case when p_orden = 'ultima_venta' then ultima_venta_at end desc nulls last,
      case when p_orden = 'valor' then total_usd end desc,
      created_at desc
    limit p_limite offset p_offset
  )
  select (select total from contado),
         coalesce((select jsonb_agg(to_jsonb(pagina)) from pagina), '[]'::jsonb)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end $$;

revoke all on function listar_clientes(text, uuid, boolean, boolean, text, integer, integer) from public;
grant execute on function listar_clientes(text, uuid, boolean, boolean, text, integer, integer) to authenticated;
