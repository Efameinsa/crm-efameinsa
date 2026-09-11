-- ============================================================
-- CRM EFAMEINSA · Migración 0228 · gbraid y wbraid: el clic de Google Ads en iPhone
-- ============================================================
-- Desde iOS 14 Google no siempre entrega el gclid: en Safari de iPhone
-- llega `gbraid` (o `wbraid`), que sirve igual para atribuir la conversión
-- —el importador de conversiones offline de Google Ads acepta las tres
-- columnas—. La web (11-09) ya los captura y los manda a /api/leads; el CRM
-- los tiraba porque no tenía dónde ponerlos, y un contacto de campaña desde
-- iPhone salía como orgánico.
-- ============================================================

alter table leads
  add column if not exists gbraid text,
  add column if not exists wbraid text;

comment on column leads.gbraid is 'Identificador de clic de Google Ads en iOS (reemplaza al gclid cuando Safari no lo entrega).';
comment on column leads.wbraid is 'Identificador de clic de Google Ads en iOS para conversiones web.';

-- Las conversiones de campaña (0226) también cuentan estos clics como Google.
-- Cambia la firma de vuelta (dos columnas más): hay que soltarla antes.
drop function if exists public.conversiones_de_campana(date, date);
create or replace function public.conversiones_de_campana(p_desde date, p_hasta date)
returns table (
  lead_id       uuid,
  codigo        text,
  recibido_at   timestamptz,
  plataforma    text,
  gclid         text,
  fbclid        text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  fuente        text,
  nombre        text,
  razon_social  text,
  email         text,
  telefono      text,
  comercial     text,
  estado        text,
  detalle       text,
  valor         numeric,
  moneda        text,
  fecha_estado  timestamptz,
  gbraid        text,
  wbraid        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(es_backoffice(), false) then
    raise exception 'No autorizado: la lista de contactos de campaña es de gerencia';
  end if;

  return query
  with base as (
    select l.*,
           coalesce(l.oportunidad_id,
                    (select o.id from oportunidades o where o.lead_id = l.id order by o.created_at desc limit 1)) as op_id
      from leads l
     where l.es_prueba = false
       and (l.recibido_at at time zone 'America/Lima')::date between p_desde and p_hasta
       and (
            l.gclid is not null or l.gbraid is not null or l.wbraid is not null
         or l.fbclid is not null
         or lower(coalesce(l.utm_medium, '')) in ('cpc', 'ppc', 'paid', 'paidsocial', 'paid_social')
         or l.fuente in ('google_ads', 'meta_ads')
         or lower(coalesce(l.fuente, '')) ~ '^web · (campaña|landing)'
       )
  ),
  con_op as (
    select b.*,
           o.etapa        as op_etapa,
           o.cerrada_at   as op_cerrada_at,
           o.created_at   as op_created_at,
           o.comercial_id as op_comercial,
           m.nombre       as motivo,
           v.monto_total  as venta_monto,
           v.moneda::text as venta_moneda,
           v.fecha_venta  as venta_fecha,
           c.total        as cot_total,
           c.moneda::text as cot_moneda,
           c.enviada_at   as cot_enviada_at
      from base b
      left join oportunidades o on o.id = b.op_id
      left join catalogo_motivos_rechazo m on m.id = o.motivo_rechazo_id
      left join lateral (
        select v.monto_total, v.moneda, v.fecha_venta
          from ventas v
         where v.oportunidad_id = b.op_id and v.anulada_at is null
         order by v.fecha_venta desc limit 1
      ) v on true
      left join lateral (
        select c.total, c.moneda, c.enviada_at
          from cotizaciones c
         where c.oportunidad_id = b.op_id and c.enviada_at is not null
         order by c.enviada_at desc limit 1
      ) c on true
  )
  select
    x.id,
    x.codigo,
    x.recibido_at,
    case when x.gclid is not null or x.gbraid is not null or x.wbraid is not null
              or lower(coalesce(x.utm_source, '')) = 'google' or x.fuente = 'google_ads' then 'google'
         when x.fbclid is not null or lower(coalesce(x.utm_source, '')) in ('facebook', 'meta', 'instagram', 'fb', 'ig') or x.fuente = 'meta_ads' then 'meta'
         else 'otra' end,
    x.gclid, x.fbclid, x.utm_source, x.utm_medium, x.utm_campaign, x.utm_content, x.fuente,
    x.nombre_contacto, x.razon_social, x.email, x.telefono,
    (select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = coalesce(x.op_comercial, x.asignado_a)),
    case when x.venta_monto is not null then 'ganado'
         when x.estado = 'duplicado' then 'repetido'
         when x.estado = 'descartado' or x.op_etapa = 'rechazada' then 'descartado'
         when x.cot_enviada_at is not null then 'cotizado'
         when x.op_id is not null or x.estado = 'asignado' then 'calificado'
         else 'nuevo' end,
    case when x.op_etapa = 'rechazada' then x.motivo
         when x.op_etapa = 'derivada' then 'pasó a otra área'
         else null end,
    case when x.venta_monto is not null then x.venta_monto
         when x.cot_enviada_at is not null then x.cot_total
         else null end,
    case when x.venta_monto is not null then x.venta_moneda
         when x.cot_enviada_at is not null then x.cot_moneda
         else null end,
    case when x.venta_monto is not null then (x.venta_fecha::timestamp at time zone 'America/Lima')
         when x.estado = 'duplicado' or x.estado = 'descartado' then x.updated_at
         when x.op_etapa = 'rechazada' then coalesce(x.op_cerrada_at, x.updated_at)
         when x.cot_enviada_at is not null then x.cot_enviada_at
         when x.op_id is not null then coalesce(x.asignado_at, x.op_created_at)
         else x.recibido_at end,
    x.gbraid,
    x.wbraid
  from con_op x
  order by x.recibido_at desc;
end $$;

-- Y el conteo por origen del panel de marketing (0227).
create or replace function leads_por_origen(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not coalesce(es_backoffice(), false) and coalesce(rol_actual() <> 'central', true) then
    raise exception 'No autorizado';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', clave, 'n', n, 'asignados', asignados,
           'descartados', descartados, 'duplicados', duplicados
         ) order by n desc), '[]'::jsonb)
  into v
  from (
    select case
             when fuente in ('google_ads', 'meta_ads') then fuente
             when lower(coalesce(fuente, '')) ~ '^web · (landing|campaña)' then 'web_landing'
             when (gclid is not null or gbraid is not null or wbraid is not null or fbclid is not null
                   or lower(coalesce(utm_medium, '')) in ('cpc', 'ppc', 'paid', 'paidsocial', 'paid_social'))
                  and (lower(coalesce(fuente, '')) like 'web%' or canal = 'formulario_web') then 'web_campana'
             when lower(coalesce(fuente, '')) like 'web%' or canal = 'formulario_web' then 'web_organico'
             else 'contacto_' || canal::text
           end as clave,
           count(*) as n,
           count(*) filter (where estado = 'asignado' or asignado_a is not null) as asignados,
           count(*) filter (where estado = 'descartado') as descartados,
           count(*) filter (where estado = 'duplicado') as duplicados
    from leads
    where recibido_at::date between p_desde and p_hasta
      and es_prueba = false
    group by 1
  ) x;

  return v;
end $$;
