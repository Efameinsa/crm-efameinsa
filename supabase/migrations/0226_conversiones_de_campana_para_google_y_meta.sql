-- ============================================================
-- CRM EFAMEINSA · Migración 0226 · Conversiones de campaña para retroalimentar a Google y Meta
-- ============================================================
-- Santos, 11-09 (reunión de gerencia y pedido de la tarde, relevado por la
-- sesión de la web): desde hoy los formularios y las landings de campaña de
-- la web entran por /api/leads con gclid / fbclid / utm_*. Lo que falta es
-- el camino de vuelta: decirle a Google Ads y a Meta CUÁLES de esos clics
-- terminaron en un cliente de verdad —calificado, cotizado, vendido— para
-- que las campañas optimicen hacia el cliente bueno y no hacia el que solo
-- llenó el formulario.
--
-- QUÉ DEVUELVE: una fila por contacto que vino de campaña (tiene gclid o
-- fbclid, o el medio es pagado, o la fuente es «web · campaña…» /
-- google_ads / meta_ads), con su estado TIPIFICADO según lo que pasó en el
-- CRM después:
--   nuevo       → todavía en la bandeja de triaje
--   repetido    → era un cliente que ya estaba (duplicado)
--   descartado  → Central lo descartó, o el comercial rechazó el expediente
--                 (con el motivo)
--   calificado  → se derivó y tiene expediente abierto, sin cotización aún
--   cotizado    → tiene al menos una cotización enviada (con el último total)
--   ganado      → tiene venta viva (con el importe y la fecha)
-- `fecha_estado` es cuándo pasó eso: es la «Conversion Time» de Google.
--
-- Solo gerencia/admin: es la lista con correo y teléfono de los clientes.
-- ============================================================

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
  fecha_estado  timestamptz
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
       and (l.recibido_at at time zone 'America/Lima')::date between p_desde and p_hasta   -- el día en Lima, no en UTC
       and (
            l.gclid is not null
         or l.fbclid is not null
         or lower(coalesce(l.utm_medium, '')) in ('cpc', 'ppc', 'paid', 'paidsocial', 'paid_social')
         or l.fuente in ('google_ads', 'meta_ads')
         or lower(coalesce(l.fuente, '')) like 'web · campaña%'
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
           v.moneda::text as venta_moneda,   -- enum → texto: si no, «structure of query does not match»
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
    case when x.gclid is not null or lower(coalesce(x.utm_source, '')) = 'google' or x.fuente = 'google_ads' then 'google'
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
         else x.recibido_at end
  from con_op x
  order by x.recibido_at desc;
end $$;

comment on function public.conversiones_de_campana(date, date) is
  'Una fila por contacto que vino de campaña (gclid/fbclid/medio pagado/fuente de campaña) con su estado tipificado en el CRM (nuevo, repetido, descartado, calificado, cotizado, ganado), el valor y la fecha del estado. Solo gerencia/admin (0226).';

revoke all on function public.conversiones_de_campana(date, date) from public;
grant execute on function public.conversiones_de_campana(date, date) to authenticated;
