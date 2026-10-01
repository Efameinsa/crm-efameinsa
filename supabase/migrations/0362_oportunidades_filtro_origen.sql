-- ============================================================
-- «Mis oportunidades»: ¿me la derivó Central o entró sola por campaña?
-- ============================================================
-- Desiré (C9), reunión del 01-10 11:05, aprobado por Carlos («es algo muy
-- necesario»): «¿cómo yo defino que llegó de campaña o llegó de una
-- derivación de Central? … tengo que entrar uno por uno … quisiera que se
-- vea: viene de WhatsApp, o viene por derivación de Central … solamente
-- faltaría un filtro ahí arriba: Derivaciones o campaña … para saber si ya
-- atendí mis derivaciones».
--
-- El dato ya estaba, solo no se mostraba. Una oportunidad nace de un lead
-- (`oportunidades.lead_id`) y a veces otro lead se le suma después
-- (`leads.oportunidad_id`: Central deriva otra vez a alguien que ya tenía
-- una abierta). Con eso:
--
--   · 'central'  → algún lead de la oportunidad lo registró Central
--                  (`leads.recibido_por` no nulo): llamada, WhatsApp o
--                  correo que Central atendió y asignó. Gana sobre campaña:
--                  si Central la derivó, es una derivación que hay que
--                  atender, aunque el primer contacto haya sido un anuncio.
--   · 'campana'  → solo leads que entraron solos (`recibido_por` nulo):
--                  chat de anuncio (meta_ads/whatsapp), formulario web
--                  (google_ads, «web · …»), WhatsApp directo.
--   · 'propia'   → sin lead: la abrió el comercial o vino de los Excel.
--
-- Comprobado en la nube el 01-10 (fuera del Histórico): 405 de Central, 810
-- de campaña/web y 5.256 propias. Hay 56 oportunidades con un segundo lead,
-- y 10 empezaron por campaña y después Central las volvió a derivar — por
-- eso no basta con mirar `lead_id`. A Desiré, por ejemplo, la única
-- derivación de Central que tiene abierta está enganchada así.
--
-- Cambio de firma (`p_origen` al final, con default): se borra la vieja
-- para no dejar dos sobrecargas — PostgREST no sabría a cuál llamar. Las
-- definiciones parten de las VIVAS (pg_get_functiondef, 01-10), no de la
-- 0054/0152; lo único nuevo es el CTE `via_lead`, el filtro y las dos
-- columnas que devuelve `listar_oportunidades` (`origen_lead`, `via`).
--
-- El CTE se arma una vez sobre los ~1.300 leads enganchados a una
-- oportunidad, no con un subselect por fila (Katerine tiene miles). Medido
-- en la nube: listar + contar sin filtros, 458 ms antes y 471 ms después.

drop function if exists public.listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer, text);
drop function if exists public.contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean, text);

create function public.listar_oportunidades(
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
      and (v_q is null or c.razon_social ilike '%' || v_q || '%')
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

create function public.contar_oportunidades_por_etapa(
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
      and (v_q is null or c.razon_social ilike '%' || v_q || '%')
    group by o.etapa
  ) t;

  return v_resultado;
end $function$;

-- Los mismos permisos que tenían: authenticated y service_role, nunca anon
-- (una función nueva en public nace ejecutable por PUBLIC y por anon).
revoke all on function public.listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer, text, text) from public, anon;
grant execute on function public.listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer, text, text) to authenticated, service_role;
revoke all on function public.contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean, text, text) from public, anon;
grant execute on function public.contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
