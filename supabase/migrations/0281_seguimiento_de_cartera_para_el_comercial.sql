-- ============================================================
-- 0281 · Seguimiento de cartera para el comercial (23-09-2026)
-- ============================================================
--
-- Ariana (C4), 23-09 12:39: «¿por qué ya no aparece el filtro de hacer
-- seguimiento en toda la cartera que tengo? ¿cómo voy a gestionar si se le
-- llamó o no?». Esa mañana gerencia le había quitado a C4 la llave de
-- postventa (decisiones del 23-09, punto 7): Ariana vende lavadoras como
-- cualquier comercial, nada de repuestos ni mantenimiento. Con la llave se
-- fueron la Ruta —su cartera con el filtro «llamado / no llamado»— y el botón
-- «Registrar seguimiento».
--
-- Y la llave escondía un error de conteo: ese botón es de postventa y abría un
-- expediente DE POSTVENTA aunque el cliente fuera de su cartera comercial.
-- Del 17 al 23-09 Ariana registró 137 llamadas en 110 expedientes así, todos
-- de clientes suyos. El reporte diario las listaba; la meta comercial (el
-- pulso de la semana) descarta todo lo que es de postventa, así que «en el PDF
-- figuran bastantes pero en sus acciones no suman» (gerencia, 23-09).
--
-- Tres piezas, ninguna de postventa:
--   1. expediente_comercial_para_seguimiento(): el expediente COMERCIAL del
--      comercial para anotar la llamada — el abierto, el histórico reactivado
--      o uno comercial nuevo. Nunca uno de postventa.
--   2. listar_clientes(): filtro por gestión — clientes con o sin gestión
--      desde una fecha — para toda la cartera, en la base (la lista es
--      paginada: Katerine tiene 8.775 clientes).
--   3. Los 109 expedientes de «seguimiento» de postventa de C4 sobre su propia
--      cartera pasan a ser comerciales, para que sus llamadas cuenten.

-- ------------------------------------------------------------
-- 1. El expediente comercial para registrar un seguimiento
-- ------------------------------------------------------------
create or replace function expediente_comercial_para_seguimiento(p_cuenta uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_quien uuid := auth.uid();
  v_dueno uuid;
  v_id uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  select comercial_id into v_dueno from cuentas where id = p_cuenta;
  if not found then raise exception 'Ese cliente no existe'; end if;
  -- Como cualquier gestión comercial: el dueño de la cartera o gerencia. Un
  -- cliente de otra cartera se pide con PIN (0202), no se toma desde acá.
  if v_dueno is distinct from v_quien and not coalesce(es_backoffice(), false) then
    raise exception 'Este cliente no está en su cartera: pídalo desde su ficha.';
  end if;

  -- 1. El mío abierto con este cliente, comercial (la regla de un expediente
  --    por cliente, 0141: se acumula ahí).
  select o.id into v_id
    from oportunidades o
   where o.cuenta_id = p_cuenta
     and o.comercial_id = v_quien
     and o.tipo_postventa is null
     and o.cerrada_at is null
     and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
   order by o.updated_at desc
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 2. Mi oportunidad del archivo más reciente: se retoma, igual que el botón
  --    «Retomar» (deja la nota de quién la reactivó).
  select o.id into v_id
    from oportunidades o
   where o.cuenta_id = p_cuenta
     and o.comercial_id = v_quien
     and o.tipo_postventa is null
     and o.etapa = 'historico'
     and o.cerrada_at is null
   order by o.created_at desc
   limit 1;
  if v_id is not null then
    perform trabajar_oportunidad_historica(v_id);
    return v_id;
  end if;

  -- 3. Uno comercial nuevo, en seguimiento.
  insert into oportunidades (cuenta_id, comercial_id, etapa, origen, intencion, proxima_accion, proxima_accion_at)
  values (p_cuenta, v_quien, 'seguimiento', 'crm', 'sin_definir', 'Seguimiento de cartera', (now() at time zone 'America/Lima')::date)
  returning id into v_id;
  return v_id;
end $fn$;

comment on function expediente_comercial_para_seguimiento is
  'El expediente comercial donde el dueño de la cartera anota una llamada de seguimiento: el abierto, el histórico retomado o uno nuevo. Nunca de postventa (0281).';

revoke all on function expediente_comercial_para_seguimiento(uuid) from public;
grant execute on function expediente_comercial_para_seguimiento(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. listar_clientes con filtro de gestión
-- ------------------------------------------------------------
-- Dos parámetros nuevos con valor por defecto: quien no los pasa (gerencia,
-- Central, el selector de rubro) recibe exactamente lo mismo que antes. Se
-- cambia la firma, así que se reemplaza la función vieja en vez de dejar dos
-- versiones que PostgREST no sabría distinguir. El cuerpo es la definición
-- viva al 23-09 más el bloque `agg_gestion` y su condición.
drop function if exists listar_clientes(text, uuid, boolean, boolean, text, integer, integer, text);

create or replace function listar_clientes(
  p_q text default null,
  p_comercial uuid default null,
  p_solo_con_venta boolean default false,
  p_solo_sin_doc boolean default false,
  p_orden text default 'recientes',
  p_limite integer default 50,
  p_offset integer default 0,
  p_rubro text default null,
  -- 'con' = clientes gestionados desde p_gestion_desde; 'sin' = sin gestión.
  p_gestion text default null,
  p_gestion_desde date default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $function$
declare
  v_total bigint;
  v_postventa boolean := false;
  v_filas jsonb;
  v_q     text := nullif(trim(coalesce(p_q, '')), '');
  v_tel   text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
  v_gestion text := case when p_gestion in ('con', 'sin') and p_gestion_desde is not null then p_gestion end;
begin
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
    v_postventa := es_postventa();
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
      and (a.realizada_at at time zone 'America/Lima')::date >= p_gestion_desde
  ),
  base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.distrito, c.departamento, c.comercial_id,
           c.ultima_venta_at, c.created_at, c.rubro_id,
           (c.carpetas_servidor is not null) as con_servidor,
           p.nombre as comercial_nombre, p.codigo_comercial,
           coalesce(ab.abiertas, 0) as abiertas,
           coalesce(av.n_ventas, 0) as n_ventas,
           coalesce(av.total_usd, 0) as total_usd,
           ah.historica_id,
           (select ct.telefono from contactos ct
             where ct.cuenta_id = c.id and ct.telefono is not null and btrim(ct.telefono) <> ''
             order by ct.es_principal desc, ct.created_at limit 1) as telefono
    from cuentas c
    left join perfiles p on p.id = c.comercial_id
    left join agg_ventas av on av.cuenta_id = c.id
    left join agg_abiertas ab on ab.cuenta_id = c.id
    left join agg_historica ah on ah.cuenta_id = c.id
    where (
        p_comercial is null
        or c.comercial_id = p_comercial
        or (v_postventa
            -- La cuenta de práctica no ve la cartera real: solo lo que RLS
            -- la deja abrir. Si no, la lista ofrece filas que dan «esto ya no
            -- se puede mostrar» (Santos, 08-09).
            and (not es_cuenta_prueba() or postventa_tiene_caso(c.id)) and (
             exists (select 1 from oportunidades o2
                      where o2.cuenta_id = c.id and o2.tipo_postventa is not null)
          or exists (select 1 from equipos_instalados e2 where e2.cuenta_id = c.id)
          or exists (select 1 from servicios_postventa s2 where s2.cuenta_id = c.id)
        ))
      )
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
  pagina as (
    select * from base
    order by
      con_servidor desc,
      case when p_orden = 'nombre' then razon_social end asc,
      case when p_orden = 'ultima_venta' then ultima_venta_at end desc nulls last,
      case when p_orden = 'valor' then total_usd end desc,
      created_at desc
    limit p_limite offset p_offset
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(to_jsonb(pagina)) from pagina), '[]'::jsonb)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end $function$;

grant execute on function listar_clientes(text, uuid, boolean, boolean, text, integer, integer, text, text, date) to authenticated;

-- ------------------------------------------------------------
-- 3. Las llamadas de Ariana vuelven a ser comerciales
-- ------------------------------------------------------------
-- Solo los de «seguimiento» de postventa abiertos por C4 sobre clientes de
-- SU cartera comercial, y no los derivados (ya se mandaron a Central). Se
-- revisó antes de escribir esto: ninguno tiene cotización, venta, atención,
-- servicio ni informe colgando; ninguno choca con otro expediente comercial
-- abierto del mismo cliente; todo lo que cuelga son sus 137 llamadas.
update oportunidades o
   set tipo_postventa = null
  from cuentas cu
 where cu.id = o.cuenta_id
   and o.comercial_id = 'eaf777d9-280f-4d71-98c1-b98db80bf3d7'   -- Ariana Flores (C4)
   and cu.comercial_id = o.comercial_id
   and o.tipo_postventa = 'seguimiento'
   and o.etapa <> 'derivada';
