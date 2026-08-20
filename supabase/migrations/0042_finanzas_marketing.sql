-- ============================================================
-- CRM EFAMEINSA · Migración 0042 · Finanzas de marketing
-- ============================================================
-- Sección nueva de gerencia para decidir inversión publicitaria con números,
-- pedida por Darwin. Reúne cuatro preguntas que hoy se responden a pedazos:
--
--  1) ¿Cuánto queda después de vender? — estado de resultados simple
--     (ventas → costo de ventas → utilidad bruta → menos publicidad).
--  2) ¿El negocio se sostiene por la publicidad o por la relación con los
--     clientes de siempre? — ventas agrupadas en publicidad / relación /
--     sin atribución clara.
--  3) ¿Cuánto vale un cliente? — CLTV con su distribución real, no solo el
--     promedio: está fuertemente sesgado (promedio US$ 12.356 contra mediana
--     US$ 5.490), así que decidir con el promedio lleva a sobreestimar lo que
--     deja un cliente típico.
--  4) ¿Cómo evoluciona mes a mes? — misma cuenta por mes, para análisis
--     horizontal (variación) y vertical (% sobre ventas) en la UI.
--
-- EL MARGEN ES UN PARÁMETRO, NO UN DATO: el CRM no conoce los costos de
-- compra. Gerencia declaró 10-12 % de utilidad por producto; se guarda en
-- `parametros.margen_bruto_pct` (editable como el tipo de cambio) y todo lo
-- que dependa de él se rotula "estimada" en la UI. Nunca presentarlo como
-- contabilidad.

insert into parametros (clave, valor, descripcion)
values ('margen_bruto_pct', 11, 'Utilidad bruta estimada sobre la venta (%). Gerencia declaró 10-12 % por producto. Se usa para el estado de resultados de Finanzas de marketing.')
on conflict (clave) do nothing;

-- Agrupa la vía de adquisición en las tres categorías que permiten responder
-- "¿publicidad o relación?". `web` va aparte a propósito: era el valor por
-- defecto de la hoja histórica de los comerciales y mezcla orgánico con
-- publicidad, así que meterlo en cualquiera de los dos lados falsearía la
-- comparación. Que se vea grande y aparte es justamente la señal de que la
-- atribución hay que mejorarla.
create or replace function grupo_atribucion(p_via text)
returns text language sql immutable as $$
  select case
    when p_via in ('google_ads', 'meta_ads', 'facebook', 'instagram', 'publicidad', 'email_marketing') then 'publicidad'
    when p_via in ('referido', 'visita_ruta', 'punto_venta', 'cartera', 'showroom') then 'relacion'
    when p_via like 'contacto_%' then 'relacion'
    when p_via in ('web', 'sin_procedencia') then 'sin_atribucion'
    else 'otro'
  end
$$;

create or replace function finanzas_marketing(p_desde date, p_hasta date)
returns jsonb
language plpgsql
volatile -- usa tabla temporal (no permitido en stable); no escribe datos persistentes
security definer
set search_path = public
as $$
declare
  v_tc      numeric := coalesce((select valor from parametros where clave = 'tc_usd_pen'), 3.75);
  v_margen  numeric := coalesce((select valor from parametros where clave = 'margen_bruto_pct'), 11) / 100.0;
  v_ventas    numeric;
  v_n         integer;
  v_gasto     numeric;
  v_resultado jsonb;
  v_meses     jsonb;
  v_atrib     jsonb;
  v_recur     jsonb;
  v_cltv      jsonb;
  v_top       jsonb;
begin
  if not es_backoffice() then
    raise exception 'No autorizado';
  end if;

  create temp table if not exists _fm on commit drop as select * from v_ventas_detalle where false;
  truncate _fm;
  insert into _fm select * from v_ventas_detalle where fecha_venta between p_desde and p_hasta;

  select coalesce(sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end), 0), count(*)
    into v_ventas, v_n from _fm;
  -- El gasto publicitario se factura en soles; se pasa a USD para poder
  -- restarlo de una utilidad que está en dólares.
  select coalesce(sum(case when moneda = 'USD' then gasto else gasto / v_tc end), 0)
    into v_gasto from gasto_campania where fecha between p_desde and p_hasta;

  v_resultado := jsonb_build_object(
    'ventas_usd', v_ventas,
    'n_ventas', v_n,
    'costo_ventas_usd', v_ventas * (1 - v_margen),
    'utilidad_bruta_usd', v_ventas * v_margen,
    'inversion_publicitaria_usd', v_gasto,
    'utilidad_despues_mkt_usd', v_ventas * v_margen - v_gasto,
    'ticket_promedio_usd', case when v_n > 0 then v_ventas / v_n else 0 end
  );

  -- Serie mensual: la misma cuenta por mes. La UI la usa para el análisis
  -- horizontal (cuánto varió respecto al mes anterior).
  with meses as (
    select generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month')::date as mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ventas_usd', coalesce(v.usd, 0),
           'n_ventas', coalesce(v.n, 0),
           'utilidad_bruta_usd', coalesce(v.usd, 0) * v_margen,
           'gasto_ads_usd', coalesce(g.usd, 0),
           'utilidad_despues_mkt_usd', coalesce(v.usd, 0) * v_margen - coalesce(g.usd, 0)
         ) order by m.mes), '[]'::jsonb)
  into v_meses
  from meses m
  left join lateral (
    select sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end) as usd, count(*) as n
    from _fm where date_trunc('month', fecha_venta)::date = m.mes
  ) v on true
  left join lateral (
    select sum(case when moneda = 'USD' then gasto else gasto / v_tc end) as usd
    from gasto_campania where date_trunc('month', fecha)::date = m.mes
  ) g on true;

  -- Atribución: detalle por vía y agrupada en publicidad / relación / sin
  -- atribución clara.
  select jsonb_build_object(
    'por_via', coalesce((
      select jsonb_agg(jsonb_build_object('via', via, 'grupo', grupo_atribucion(via), 'n', n, 'monto_usd', usd) order by usd desc)
      from (
        select via_adquisicion as via, count(*) as n,
               sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end) as usd
        from _fm group by via_adquisicion
      ) x
    ), '[]'::jsonb),
    'por_grupo', coalesce((
      select jsonb_object_agg(g, jsonb_build_object('n', n, 'monto_usd', usd))
      from (
        select grupo_atribucion(via_adquisicion) as g, count(*) as n,
               sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end) as usd
        from _fm group by 1
      ) y
    ), '{}'::jsonb)
  ) into v_atrib;

  -- Recurrentes vs nuevos: recurrente = ya había comprado antes del período.
  with primera as (
    select cuenta_id, min(fecha_venta) as p from v_ventas_detalle group by cuenta_id
  )
  select jsonb_build_object(
    'recurrentes_usd', coalesce(sum(usd) filter (where recurrente), 0),
    'nuevos_usd', coalesce(sum(usd) filter (where not recurrente), 0),
    'n_recurrentes', count(*) filter (where recurrente),
    'n_nuevos', count(*) filter (where not recurrente)
  ) into v_recur
  from (
    select f.cuenta_id,
           sum(case when f.moneda = 'USD' then f.monto_total else f.monto_total / v_tc end) as usd,
           (pr.p < p_desde) as recurrente
    from _fm f join primera pr on pr.cuenta_id = f.cuenta_id
    group by f.cuenta_id, pr.p
  ) z;

  -- CLTV sobre TODO el historial (no solo el período): el valor de vida de un
  -- cliente no se mide en una ventana. Se devuelven promedio, mediana y p90
  -- porque la distribución está muy sesgada, y los deciles para dibujar el
  -- Pareto: hoy el 10 % de los clientes concentra la mitad del ingreso, y esa
  -- es la decisión de fondo (retener a esos pocos vale más que captar muchos).
  with cltv as (
    select cuenta_id, sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end) as total,
           count(*) as compras
    from v_ventas_detalle group by cuenta_id
  ),
  deciles as (
    select ntile(10) over (order by total desc) as decil, total from cltv
  )
  select jsonb_build_object(
    'clientes', (select count(*) from cltv),
    'promedio_usd', coalesce((select avg(total) from cltv), 0),
    'mediana_usd', coalesce((select percentile_cont(0.5) within group (order by total) from cltv), 0),
    'p90_usd', coalesce((select percentile_cont(0.9) within group (order by total) from cltv), 0),
    'maximo_usd', coalesce((select max(total) from cltv), 0),
    'total_usd', coalesce((select sum(total) from cltv), 0),
    'con_2_o_mas', (select count(*) from cltv where compras >= 2),
    'compras_promedio', coalesce((select avg(compras) from cltv), 0),
    'deciles', coalesce((
      select jsonb_agg(jsonb_build_object('decil', decil, 'clientes', n, 'monto_usd', usd) order by decil)
      from (select decil, count(*) as n, sum(total) as usd from deciles group by decil) d
    ), '[]'::jsonb)
  ) into v_cltv;

  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', cuenta_id, 'razon_social', razon_social, 'compras', n, 'total_usd', usd
         ) order by usd desc), '[]'::jsonb)
  into v_top
  from (
    select cuenta_id, min(razon_social) as razon_social, count(*) as n,
           sum(case when moneda = 'USD' then monto_total else monto_total / v_tc end) as usd
    from v_ventas_detalle group by cuenta_id order by usd desc limit 12
  ) t;

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'tc_usd_pen', v_tc,
    'margen_pct', v_margen * 100,
    'resultado', v_resultado,
    'meses', v_meses,
    'atribucion', v_atrib,
    'recurrencia', v_recur,
    'cltv', v_cltv,
    'top_clientes', v_top
  );
end $$;

revoke all on function finanzas_marketing(date, date) from public;
grant execute on function finanzas_marketing(date, date) to authenticated;

comment on function finanzas_marketing(date, date) is
  'Finanzas de marketing para gerencia: estado de resultados estimado (el margen sale de parametros.margen_bruto_pct, el CRM no conoce costos reales), evolución mensual, atribución agrupada en publicidad/relación/sin atribución, recurrencia y CLTV con deciles para el Pareto.';
