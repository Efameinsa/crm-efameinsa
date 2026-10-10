-- ============================================================
-- Oportunidades: el buscador también encuentra por teléfono y correo
-- ============================================================
-- Brenda (C1), buzón 10-10 «MEJORAR BUSCADOR CON NUMERO DE TELEFONO O
-- CORREO»: buscó 934020288 en «Mis oportunidades» y salió «Nada coincide»,
-- aunque es el celular de CLUB CENTRO DEPORTIVO MUNICIPAL, que está en su
-- seguimiento. listar_oportunidades / contar_oportunidades_por_etapa solo
-- miraban la razón social (el aviso decía «RUC y DNI», pero no los miraba).
--
-- Ahora lo escrito se busca en:
--   · la ficha: razón social, nombre comercial y RUC/DNI;
--   · sus contactos: teléfono (normalizado, sin espacios ni +51), correo y
--     nombre de la persona;
--   · los leads de la oportunidad (el que la abrió y los que se le sumaron)
--     y los del cliente: teléfono, correo y nombre que anotó Central o que
--     llegó por la campaña.
-- El teléfono solo se busca si lo escrito no tiene letras y tiene 6 cifras o
-- más (igual que listar_clientes).
--
-- Misma firma: create or replace, los permisos quedan como estaban (0362).
-- Lo demás es copia de la 0362 (igual a la definición viva del 10-10).

create or replace function public.listar_oportunidades(
  p_q text default null::text,
  p_comercial uuid default null::uuid,
  p_etapa text default null::text,
  p_tipo_cliente text default null::text,
  p_desde date default null::date,
  p_hasta date default null::date,
  p_solo_crm boolean default false,
  p_orden text default 'reciente'::text,
  p_limite integer default 50,
  p_offset integer default 0,
  p_rubro text default null::text,
  p_origen text default null::text
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_total bigint;
  v_filas jsonb;
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  -- 0430: «934 020 288», «+51 934020288» o «934-020-288» buscan lo mismo.
  v_tel text := case when nullif(trim(coalesce(p_q, '')), '') !~ '[[:alpha:]]'
                     then nullif(normalizar_telefono(p_q), '') end;
begin
  -- Misma regla que el resto del CRM: backoffice y central ven todo; un
  -- comercial solo su cartera.
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
  end if;

  with cotiz_ultima as (
    select distinct on (c.oportunidad_id)
           c.oportunidad_id, c.estado_aprobacion
    from cotizaciones c
    order by c.oportunidad_id, c.created_at desc
  ),
  -- Por dónde llegó (0362, Desiré 01-10): el lead que la abrió y los que se
  -- le sumaron después; si alguno lo registró Central, ese manda.
  via_lead as (
    select distinct on (x.oportunidad_id)
           x.oportunidad_id,
           (l.recibido_por is not null) as de_central,
           l.canal::text as canal,
           l.fuente
    from (
      select o2.id as oportunidad_id, o2.lead_id, true as la_abrio
      from oportunidades o2
      where o2.lead_id is not null
      union all
      select l2.oportunidad_id, l2.id, false
      from leads l2
      where l2.oportunidad_id is not null and l2.anulado_at is null
    ) x
    join leads l on l.id = x.lead_id
    order by x.oportunidad_id, (l.recibido_por is not null) desc, x.la_abrio desc, l.created_at desc
  ),
  -- 0430 (Brenda, buzón 10-10): lo buscado también se busca en los
  -- contactos del cliente (teléfono, correo, nombre de la persona) y en los
  -- leads de la oportunidad (lo que Central o la campaña anotó al derivar).
  -- Se arma una sola vez, y solo si hay algo escrito.
  coincide_cuenta as (
    select ct.cuenta_id from contactos ct
    where v_q is not null
      and ((v_tel is not null and length(v_tel) >= 6 and ct.telefono_normalizado like '%' || v_tel || '%')
           or ct.email ilike '%' || v_q || '%'
           or ct.nombre ilike '%' || v_q || '%')
  ),
  coincide_lead as (
    select l.id, l.oportunidad_id, l.cuenta_id from leads l
    where v_q is not null and l.anulado_at is null
      and ((v_tel is not null and length(v_tel) >= 6 and l.telefono_normalizado like '%' || v_tel || '%')
           or l.email ilike '%' || v_q || '%'
           or l.nombre_contacto ilike '%' || v_q || '%')
  ),
  base as (
    select o.id, o.etapa, o.intencion, o.monto_estimado, o.moneda,
           o.proxima_accion, o.proxima_accion_at, o.updated_at, o.origen,
           c.id as cuenta_id, c.razon_social, c.tipo_doc,
           case
             when c.tipo_doc = 'RUC' then true
             when c.tipo_doc in ('DNI', 'CE') then false
             else es_razon_social_empresa(c.razon_social)
           end as es_empresa,
           cu.estado_aprobacion as cotizacion_estado,
           case
             when v.oportunidad_id is null then 'propia'
             when v.de_central then 'central'
             else 'campana'
           end as origen_lead,
           -- «whatsapp · meta_ads», «formulario_web · google_ads», «llamada»…
           -- para el title de la pastilla: el detalle sin tener que entrar.
           nullif(concat_ws(' · ', v.canal, v.fuente), '') as via
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join cotiz_ultima cu on cu.oportunidad_id = o.id
    left join via_lead v on v.oportunidad_id = o.id
    where (p_comercial is null or o.comercial_id = p_comercial)
      and (p_etapa is null or o.etapa = p_etapa::etapa_oportunidad)
      and (coalesce(p_etapa, '') = 'historico' or o.etapa <> 'historico')
      and (not p_solo_crm or o.origen = 'crm')
      and (p_desde is null or o.proxima_accion_at >= p_desde)
      and (p_hasta is null or o.proxima_accion_at <= p_hasta)
      and (
        p_tipo_cliente is null
        or (p_tipo_cliente = 'empresa' and (
              c.tipo_doc = 'RUC' or (c.tipo_doc = 'SIN_DOC' and es_razon_social_empresa(c.razon_social))
            ))
        or (p_tipo_cliente = 'persona' and (
              c.tipo_doc in ('DNI', 'CE')
              or (c.tipo_doc = 'SIN_DOC' and not es_razon_social_empresa(c.razon_social))
            ))
      )
      -- El rubro de la cuenta: un id del catálogo, o «sin» para las que no tienen.
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      -- Origen (0362): derivada por Central, campaña/web, o propia.
      and (
        p_origen is null
        or (p_origen = 'central' and v.de_central)
        or (p_origen = 'campana' and v.oportunidad_id is not null and not v.de_central)
        or (p_origen = 'propia' and v.oportunidad_id is null)
      )
      and (
        v_q is null
        or c.razon_social ilike '%' || v_q || '%'
        or c.nombre_comercial ilike '%' || v_q || '%'
        or c.num_doc ilike '%' || v_q || '%'
        or c.id in (select cuenta_id from coincide_cuenta)
        or c.id in (select cuenta_id from coincide_lead where cuenta_id is not null)
        or o.id in (select oportunidad_id from coincide_lead where oportunidad_id is not null)
        or o.lead_id in (select id from coincide_lead)
      )
  ),
  pagina as (
    select * from base
    order by
      case when p_orden = 'monto' then coalesce(monto_estimado, 0) end desc,
      case when p_orden = 'proxima_accion' then proxima_accion_at end asc nulls last,
      case when p_orden = 'cuenta' then razon_social end asc,
      updated_at desc
    limit p_limite offset p_offset
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(to_jsonb(pagina)) from pagina), '[]'::jsonb)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end $function$;

create or replace function public.contar_oportunidades_por_etapa(
  p_q text default null::text,
  p_comercial uuid default null::uuid,
  p_tipo_cliente text default null::text,
  p_desde date default null::date,
  p_hasta date default null::date,
  p_solo_crm boolean default false,
  p_rubro text default null::text,
  p_origen text default null::text
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  -- 0430: «934 020 288», «+51 934020288» o «934-020-288» buscan lo mismo.
  v_tel text := case when nullif(trim(coalesce(p_q, '')), '') !~ '[[:alpha:]]'
                     then nullif(normalizar_telefono(p_q), '') end;
  v_resultado jsonb;
begin
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
  end if;

  -- Mismo `via_lead` que listar_oportunidades (0362): si no, el número de la
  -- pestaña «Asignada» no coincide con las filas al filtrar por origen.
  with via_lead as (
    select distinct on (x.oportunidad_id)
           x.oportunidad_id,
           (l.recibido_por is not null) as de_central
    from (
      select o2.id as oportunidad_id, o2.lead_id, true as la_abrio
      from oportunidades o2
      where o2.lead_id is not null
      union all
      select l2.oportunidad_id, l2.id, false
      from leads l2
      where l2.oportunidad_id is not null and l2.anulado_at is null
    ) x
    join leads l on l.id = x.lead_id
    order by x.oportunidad_id, (l.recibido_por is not null) desc, x.la_abrio desc, l.created_at desc
  ),
  -- 0430 (Brenda, buzón 10-10): lo buscado también se busca en los
  -- contactos del cliente (teléfono, correo, nombre de la persona) y en los
  -- leads de la oportunidad (lo que Central o la campaña anotó al derivar).
  -- Se arma una sola vez, y solo si hay algo escrito.
  coincide_cuenta as (
    select ct.cuenta_id from contactos ct
    where v_q is not null
      and ((v_tel is not null and length(v_tel) >= 6 and ct.telefono_normalizado like '%' || v_tel || '%')
           or ct.email ilike '%' || v_q || '%'
           or ct.nombre ilike '%' || v_q || '%')
  ),
  coincide_lead as (
    select l.id, l.oportunidad_id, l.cuenta_id from leads l
    where v_q is not null and l.anulado_at is null
      and ((v_tel is not null and length(v_tel) >= 6 and l.telefono_normalizado like '%' || v_tel || '%')
           or l.email ilike '%' || v_q || '%'
           or l.nombre_contacto ilike '%' || v_q || '%')
  )
  select coalesce(jsonb_object_agg(etapa::text, n), '{}'::jsonb) into v_resultado
  from (
    select o.etapa, count(*) as n
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join via_lead v on v.oportunidad_id = o.id
    where (p_comercial is null or o.comercial_id = p_comercial)
      and (not p_solo_crm or o.origen = 'crm')
      and (p_desde is null or o.proxima_accion_at >= p_desde)
      and (p_hasta is null or o.proxima_accion_at <= p_hasta)
      and (
        p_tipo_cliente is null
        or (p_tipo_cliente = 'empresa' and (
              c.tipo_doc = 'RUC' or (c.tipo_doc = 'SIN_DOC' and es_razon_social_empresa(c.razon_social))
            ))
        or (p_tipo_cliente = 'persona' and (
              c.tipo_doc in ('DNI', 'CE')
              or (c.tipo_doc = 'SIN_DOC' and not es_razon_social_empresa(c.razon_social))
            ))
      )
      and (
        p_rubro is null
        or (p_rubro = 'sin' and c.rubro_id is null)
        or (p_rubro <> 'sin' and c.rubro_id::text = p_rubro)
      )
      and (
        p_origen is null
        or (p_origen = 'central' and v.de_central)
        or (p_origen = 'campana' and v.oportunidad_id is not null and not v.de_central)
        or (p_origen = 'propia' and v.oportunidad_id is null)
      )
      and (
        v_q is null
        or c.razon_social ilike '%' || v_q || '%'
        or c.nombre_comercial ilike '%' || v_q || '%'
        or c.num_doc ilike '%' || v_q || '%'
        or c.id in (select cuenta_id from coincide_cuenta)
        or c.id in (select cuenta_id from coincide_lead where cuenta_id is not null)
        or o.id in (select oportunidad_id from coincide_lead where oportunidad_id is not null)
        or o.lead_id in (select id from coincide_lead)
      )
    group by o.etapa
  ) t;

  return v_resultado;
end $function$;

notify pgrst, 'reload schema';
