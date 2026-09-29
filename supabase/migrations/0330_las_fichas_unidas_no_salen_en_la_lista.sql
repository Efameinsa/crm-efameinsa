-- 0330 · Las fichas unidas ya no salen en la lista de clientes
--
-- 29-09-2026. Brenda buscó «bazan» y le salieron dos fichas de WALTER DONATO
-- BAZAN MARTEL, y pidió unirlas: ya estaban unidas desde el 28-09 a las 10:40.
-- listar_clientes() —la lista y la búsqueda de clientes de gerencia, Central y
-- la cartera de cada comercial— no miraba `fusionada_en`, así que las 13
-- fichas unidas seguían apareciendo como clientes aparte.
--
-- Definición tomada de la base viva (no de la migración anterior: se parcha en
-- caliente), con una sola línea nueva: `and c.fusionada_en is null`.

CREATE OR REPLACE FUNCTION public.listar_clientes(p_q text DEFAULT NULL::text, p_comercial uuid DEFAULT NULL::uuid, p_solo_con_venta boolean DEFAULT false, p_solo_sin_doc boolean DEFAULT false, p_orden text DEFAULT 'recientes'::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0, p_rubro text DEFAULT NULL::text, p_gestion text DEFAULT NULL::text, p_gestion_desde date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total bigint;
  v_postventa boolean := false;
  v_prueba boolean := false;
  v_filas jsonb;
  v_q     text := nullif(trim(coalesce(p_q, '')), '');
  v_tel   text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
  v_gestion text := case when p_gestion in ('con', 'sin') and p_gestion_desde is not null then p_gestion end;
begin
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
    v_postventa := es_postventa();
    -- Una sola vez, no por fila (0299): cada llamada relee el token de sesión.
    if v_postventa then v_prueba := es_cuenta_prueba(); end if;
  end if;

  with agg_ventas as (
    select o.cuenta_id, count(*) as n_ventas,
           coalesce(sum(v.monto_total) filter (where v.moneda = 'USD'), 0) as total_usd
    from ventas v join oportunidades o on o.id = v.oportunidad_id
    where v.anulada_at is null
    group by o.cuenta_id
  ),
  agg_abiertas as (
    select cuenta_id, count(*) as abiertas
    from oportunidades where etapa not in ('venta', 'rechazada', 'derivada', 'historico')
    group by cuenta_id
  ),
  -- 0155: la archivada más reciente de cada cliente, para el botón «Retomar»
  -- de la lista. `created_at` es la fecha del Excel, la que dice cuál es la
  -- última gestión que se le hizo.
  agg_historica as (
    select distinct on (cuenta_id) cuenta_id, id as historica_id
    from oportunidades where etapa = 'historico' and cerrada_at is null
    order by cuenta_id, created_at desc
  ),
  -- 0281: clientes con alguna gestión de contacto (llamada, WhatsApp, correo,
  -- visita, visita a planta, reunión) desde la fecha pedida, en cualquiera de
  -- sus expedientes. Las mismas que cuenta el reporte diario; las notas no.
  agg_gestion as (
    select distinct o.cuenta_id
    from actividades a join oportunidades o on o.id = a.oportunidad_id
    where v_gestion is not null
      and a.tipo in ('llamada', 'whatsapp', 'email', 'visita', 'showroom', 'reunion_online')
      and (a.realizada_at >= (p_gestion_desde)::timestamp at time zone 'America/Lima')
  ),
  -- 0299: LOS CLIENTES QUE ATIENDE POSTVENTA, calculados una vez. Antes eran
  -- tres «exists» + es_cuenta_prueba() por cada una de las ~16.000 fichas, y
  -- cada es_cuenta_prueba() relee el token de sesión: por PostgREST, 4 s por
  -- lista (Santos, 24-09: «me fui a clientes y se demora»).
  pv_cuentas as (
    select u.cuenta_id
      from (select o.cuenta_id from oportunidades o where v_postventa and o.tipo_postventa is not null
            union
            select e.cuenta_id from equipos_instalados e where v_postventa
            union
            select s.cuenta_id from servicios_postventa s where v_postventa) u
     where u.cuenta_id is not null
       -- La cuenta de práctica no ve la cartera real: solo lo que RLS la deja
       -- abrir (Santos, 08-09).
       and (not v_prueba or postventa_tiene_caso(u.cuenta_id))
  ),
  base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.distrito, c.departamento, c.comercial_id,
           c.ultima_venta_at, c.created_at, c.rubro_id,
           (c.carpetas_servidor is not null) as con_servidor,
           p.nombre as comercial_nombre, p.codigo_comercial,
           coalesce(ab.abiertas, 0) as abiertas,
           coalesce(av.n_ventas, 0) as n_ventas,
           coalesce(av.total_usd, 0) as total_usd,
           ah.historica_id
    from cuentas c
    left join perfiles p on p.id = c.comercial_id
    left join agg_ventas av on av.cuenta_id = c.id
    left join agg_abiertas ab on ab.cuenta_id = c.id
    left join agg_historica ah on ah.cuenta_id = c.id
    where (
        p_comercial is null
        or c.comercial_id = p_comercial
        or (v_postventa and c.id in (select cuenta_id from pv_cuentas))
      )
      -- 0330: una ficha unida a otra ya no es un cliente aparte.
      and c.fusionada_en is null
      and (not p_solo_con_venta or c.ultima_venta_at is not null)
      and (not p_solo_sin_doc or c.tipo_doc = 'SIN_DOC')
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      and (
        v_gestion is null
        or (v_gestion = 'con' and c.id in (select cuenta_id from agg_gestion))
        or (v_gestion = 'sin' and c.id not in (select cuenta_id from agg_gestion))
      )
      and (
        v_q is null
        or c.razon_social ilike '%' || v_q || '%'
        or c.nombre_comercial ilike '%' || v_q || '%'
        or c.num_doc ilike '%' || v_q || '%'
        or (v_tel is not null and length(v_tel) >= 6 and exists (
              select 1 from contactos ct where ct.cuenta_id = c.id and ct.telefono_normalizado like '%' || v_tel || '%'))
      )
  ),
  -- El teléfono se busca solo para las filas de la página (antes, para las
  -- ~16.000 fichas de la base en cada llamada: 600 MB de páginas por lista).
  pagina_base as (
    select b.*, row_number() over () as _rn
      from (select * from base
    order by
      con_servidor desc,
      case when p_orden = 'nombre' then razon_social end asc,
      case when p_orden = 'ultima_venta' then ultima_venta_at end desc nulls last,
      case when p_orden = 'valor' then total_usd end desc,
      created_at desc,
      -- 0299: desempate. Cientos de fichas comparten created_at (el import
      -- del 29-08) y sin esto el orden entre ellas era al azar: al pasar de
      -- página un cliente podía repetirse o no salir nunca.
      id
    limit p_limite offset p_offset) b
  ),
  pagina as (
    select pb.*,
           (select ct.telefono from contactos ct
             where ct.cuenta_id = pb.id and ct.telefono is not null and btrim(ct.telefono) <> ''
             order by ct.es_principal desc, ct.created_at limit 1) as telefono
      from pagina_base pb
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(to_jsonb(pagina) - '_rn' order by pagina._rn) from pagina), '[]'::jsonb)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end $function$;
