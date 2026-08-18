-- ============================================================
-- CRM EFAMEINSA · Migración 0022 · Procedencia histórica de las ventas
-- ============================================================
-- Hallazgo 2026-08-18 (pregunta de Darwin: "¿en todo el historial no hay
-- ninguna venta atribuida a la publicidad?"): las hojas PROSP/COTIZ de cada
-- comercial traen en la fila de cabecera del prospecto la columna
-- PROV_PROSP (procedencia declarada: O_FB, O_FB_MK, CAMPAÑA FB, GOOGLE,
-- O_PAGWEB, F_CLIEREF, F_VRUTA, PTO_VENTA…) y COD_MKT (código PRO#### de
-- Central). La primera extracción de ventas leía solo la fila de venta y
-- perdía ambas (y el RUC/DNI en el 93 % de los casos).
--
-- Se guardan en la oportunidad para que "De dónde vienen las ventas" tenga
-- historia real y no solo "histórico Excel".

alter table oportunidades add column if not exists procedencia text;      -- PROV_PROSP crudo, ej. 'O_FB'
alter table oportunidades add column if not exists codigo_central text;   -- 'PRO4394' (COD_MKT normalizado)
create index if not exists ix_oportunidades_procedencia on oportunidades (procedencia) where procedencia is not null;

-- Mapa PROV_PROSP → vía legible. Lo que no está acá cae en 'otro'.
create or replace function via_de_procedencia(p text)
returns text language sql immutable as $$
  select case upper(trim(coalesce(p, '')))
    when 'O_FB' then 'facebook'
    when 'O_FB_MK' then 'meta_ads'
    when 'CAMPAÑA FB' then 'meta_ads'
    when 'CAMPANA FB' then 'meta_ads'
    when 'GOOGLE' then 'google_ads'
    when 'CAMPAÑA' then 'publicidad'
    when 'CAMPANA' then 'publicidad'
    when 'O_PAGWEB' then 'web'
    when 'O_PAGWE B' then 'web'
    when 'F_CLIEREF' then 'referido'
    when 'F_PROSREF' then 'referido'
    when 'F_VRUTA' then 'visita_ruta'
    when 'PTO_VENTA' then 'punto_venta'
    when 'O_WH' then 'contacto_whatsapp'
    when 'O_EMAILING' then 'email_marketing'
    when 'O_LI' then 'linkedin'
    when 'O_OLX' then 'olx'
    when 'CANAL2' then 'canal2'
    when 'ND' then 'sin_procedencia'
    when 'NO_DEF' then 'sin_procedencia'
    when '' then 'sin_procedencia'
    else 'otro'
  end
$$;

-- La vista prioriza el lead real del CRM (atribución exacta por campaña);
-- si no hay lead, usa la procedencia declarada por el comercial; si tampoco,
-- cartera propia (CRM) o histórico sin procedencia (Excel).
-- Postgres no permite reordenar/renombrar columnas con CREATE OR REPLACE VIEW:
-- se recrea. resumen_gerencia() la lee con select *, no le afecta.
drop view if exists v_ventas_detalle;
create view v_ventas_detalle with (security_invoker = on) as
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
       o.procedencia,
       o.codigo_central,
       l.canal,
       l.fuente,
       l.utm_campaign,
       case
         when l.id is not null and l.fuente in ('google_ads', 'meta_ads') then l.fuente
         when l.id is not null then 'contacto_' || l.canal::text
         when o.procedencia is not null then via_de_procedencia(o.procedencia)
         when v.origen = 'historico_excel' then 'sin_procedencia'
         else 'cartera'
       end                 as via_adquisicion
from ventas v
join oportunidades o on o.id = v.oportunidad_id
join perfiles p      on p.id = o.comercial_id
join cuentas c       on c.id = o.cuenta_id
left join leads l    on l.id = o.lead_id;
