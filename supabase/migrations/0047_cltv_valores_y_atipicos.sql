-- ============================================================
-- CRM EFAMEINSA · Migración 0047 · CLTV: los valores uno por uno
-- ============================================================
-- Los dos gráficos de la distribución del CLTV (histograma y caja y bigotes)
-- pasan a compartir un solo eje y a dibujarse juntos, y para eso hacen falta
-- los valores CLIENTE POR CLIENTE, no solo el resumen:
--
--  · la CURVA DE DENSIDAD que se superpone al histograma se estima sobre los
--    datos, no sobre las barras (una curva sacada de siete alturas sería un
--    dibujo, no una estimación);
--  · los BIGOTES DE TUKEY necesitan cuál es el último dato que cae dentro de
--    vez y media el rango intercuartílico;
--  · los ATÍPICOS se dibujan punto por punto: son la señal visual del sesgo
--    —no hay ninguno por abajo y hay decenas por arriba— y es justo lo que la
--    caja no estaba enseñando.
--
-- Son 500 números redondeados a dólares enteros, unos 4 KB: menos de lo que
-- ya pesa la muestra de clientes por decil que viaja en el mismo objeto. Van
-- ordenados de menor a mayor, que es como los quiere el cálculo de Tukey.
--
-- El resto de la función es idéntico a la 0046.

create or replace function finanzas_marketing(p_desde date, p_hasta date)
returns jsonb
language plpgsql
volatile
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

  with cltv as (
    select v.cuenta_id, min(v.razon_social) as razon_social,
           sum(case when v.moneda = 'USD' then v.monto_total else v.monto_total / v_tc end) as total,
           count(*) as compras
    from v_ventas_detalle v group by v.cuenta_id
  ),
  marcado as (
    select *, ntile(10) over (order by total desc) as decil from cltv
  ),
  -- Se numeran dentro del decil para poder mandar solo los primeros de cada
  -- uno: 500 clientes completos inflarían el payload sin que nadie lea el
  -- puesto 40 de un decil.
  ordenado as (
    select *, row_number() over (partition by decil order by total desc) as puesto from marcado
  )
  select jsonb_build_object(
    'clientes', (select count(*) from cltv),
    'promedio_usd', coalesce((select avg(total) from cltv), 0),
    'mediana_usd', coalesce((select percentile_cont(0.5) within group (order by total) from cltv), 0),
    'q1_usd', coalesce((select percentile_cont(0.25) within group (order by total) from cltv), 0),
    'q3_usd', coalesce((select percentile_cont(0.75) within group (order by total) from cltv), 0),
    'p90_usd', coalesce((select percentile_cont(0.9) within group (order by total) from cltv), 0),
    'minimo_usd', coalesce((select min(total) from cltv), 0),
    'maximo_usd', coalesce((select max(total) from cltv), 0),
    'total_usd', coalesce((select sum(total) from cltv), 0),
    'con_2_o_mas', (select count(*) from cltv where compras >= 2),
    'compras_promedio', coalesce((select avg(compras) from cltv), 0),
    -- Distribución por tramos: la "campana sesgada". Los cortes son fijos y
    -- no automáticos porque con una cola tan larga (mediana 3.790, máximo
    -- 194.400) unos cortes de ancho igual dejarían nueve barras vacías y una
    -- gigante. Estos tramos siguen la escala con que se habla del negocio.
    -- Los valores uno por uno, ordenados: la curva de densidad, los bigotes
    -- de Tukey y los puntos atípicos se calculan sobre los datos, no sobre
    -- las barras del histograma.
    'valores', coalesce((
      select jsonb_agg(round(total)::int order by total) from cltv
    ), '[]'::jsonb),
    'histograma', coalesce((
      select jsonb_agg(jsonb_build_object('tramo', tramo, 'desde', desde, 'hasta', hasta, 'clientes', n) order by desde)
      from (
        select t.tramo, t.desde, t.hasta, count(c.total)::int as n
        from (values
          ('Menos de 1k', 0, 1000), ('1k a 2,5k', 1000, 2500), ('2,5k a 5k', 2500, 5000),
          ('5k a 10k', 5000, 10000), ('10k a 20k', 10000, 20000), ('20k a 50k', 20000, 50000),
          ('Más de 50k', 50000, 1000000000)
        ) as t(tramo, desde, hasta)
        left join cltv c on c.total >= t.desde and c.total < t.hasta
        group by t.tramo, t.desde, t.hasta
      ) h
    ), '[]'::jsonb),
    'deciles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'decil', decil, 'clientes', n, 'monto_usd', usd, 'desde_usd', minimo, 'hasta_usd', maximo,
        'muestra', muestra
      ) order by decil)
      from (
        select decil, count(*) as n, sum(total) as usd, min(total) as minimo, max(total) as maximo,
               coalesce(jsonb_agg(jsonb_build_object(
                 'cuenta_id', cuenta_id, 'razon_social', razon_social, 'total_usd', total, 'compras', compras
               ) order by total desc) filter (where puesto <= 25), '[]'::jsonb) as muestra
        from ordenado group by decil
      ) d
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
