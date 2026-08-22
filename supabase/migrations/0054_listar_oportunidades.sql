-- ============================================================
-- CRM EFAMEINSA · Migración 0054 · Oportunidades paginadas + filtros reales
-- ============================================================
-- Reunión 21-08 (docs/10-plan-ajustes-reunion-21-08.md, Bloque A): Carlos
-- probó "Mis oportunidades" como comercial nuevo y no encontró forma de
-- identificar SUS oportunidades. Su flujo real con el Excel: primero filtra
-- EMPRESAS (no personas naturales), después mira el ESTADO, y para retomar
-- filtra por la fecha en que quedó pendiente ("me dijo llámame en agosto").
--
-- Con la importación de scripts/importar-oportunidades-historicas.mjs, un
-- comercial como Katerine pasa a tener miles de oportunidades. La página
-- traía TODAS las abiertas sin límite (bug ya conocido: supabase-js corta en
-- 1.000 filas sin avisar, mismo problema que tenía /comercial/cartera antes
-- del commit 37e1919). Esta función pagina en Postgres, exactamente como
-- listar_clientes (migración 0021), y agrega los filtros que Carlos pidió.
--
-- EMPRESA VS PERSONA NATURAL: tipo_doc=RUC es siempre empresa, DNI/CE
-- siempre persona. Para las cuentas SIN_DOC (sin documento todavía) se
-- infiere por la razón social: si trae una marca societaria (SAC, SA, EIRL,
-- SRL, "SOCIEDAD", "EMPRESA"...) se cuenta como empresa. Es un criterio
-- best-effort — mismo espíritu que ya se usa en
-- scripts/fusionar-cuentas-mismo-nombre.mjs para decidir qué nombres son
-- de una empresa real.

create or replace function es_razon_social_empresa(p_razon text)
returns boolean language sql immutable as $$
  select p_razon ~* '\mS\.?A\.?C?\.?\M|\mE\.?I\.?R\.?L\.?\M|\mS\.?R\.?L\.?\M|\mSOCIEDAD\M|\mEMPRESA\M|\mCORPORACION\M|\mCONSORCIO\M|\mASOCIACION\M|\mGRUPO\M|\mINVERSIONES\M|\mSERVICIOS\M|\mHOTEL\M|\mHOSTAL\M|\mCLINICA\M|\mUNIVERSIDAD\M|\mMUNICIPALIDAD\M|\mAGRICOLA\M|\mAGROINDUSTRIAL\M|\mINDUSTRIA\M|\mINDUSTRIAS\M|\mTEXTIL\M|\mTEXTILES\M|\mMINERA\M|\mLAVANDERIA\M|\mRESTAURANT\M|\mCOMPANIA\M|\mCIA\M|\mNEGOCIOS\M|\mCOMERCIAL\M|\mDISTRIBUIDORA\M|\mIMPORTACIONES\M|\mTRANSPORTES\M'
$$;

create or replace function listar_oportunidades(
  p_q text default null,
  p_comercial uuid default null,
  p_etapa text default null,           -- null = todas las etapas
  p_tipo_cliente text default null,    -- 'empresa' | 'persona' | null = ambos
  p_desde date default null,           -- "para retomar": proxima_accion_at >=
  p_hasta date default null,           -- proxima_accion_at <=
  p_solo_crm boolean default false,    -- true = esconder el histórico Excel
  p_orden text default 'reciente',     -- 'reciente' | 'monto' | 'proxima_accion' | 'cuenta'
  p_limite integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
    -- Última cotización del CRM de cada oportunidad, para el badge de
    -- pendiente/rechazada por gerencia — solo existe para las nacidas en el
    -- CRM, las históricas de Excel no tienen fila en `cotizaciones`.
    select distinct on (c.oportunidad_id)
           c.oportunidad_id, c.estado_aprobacion
    from cotizaciones c
    order by c.oportunidad_id, c.created_at desc
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
           cu.estado_aprobacion as cotizacion_estado
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join cotiz_ultima cu on cu.oportunidad_id = o.id
    where (p_comercial is null or o.comercial_id = p_comercial)
      and (p_etapa is null or o.etapa = p_etapa::etapa_oportunidad)
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
end $$;

revoke all on function listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer) from public;
grant execute on function listar_oportunidades(text, uuid, text, text, date, date, boolean, text, integer, integer) to authenticated;

-- Conteo por etapa, para las pestañas de filtro (sin traer las filas). Mismos
-- filtros de comercial/tipo_cliente/rango de fecha que listar_oportunidades,
-- para que los números de las pestañas coincidan con lo que se ve al hacer
-- clic en cada una.
create or replace function contar_oportunidades_por_etapa(
  p_q text default null,
  p_comercial uuid default null,
  p_tipo_cliente text default null,
  p_desde date default null,
  p_hasta date default null,
  p_solo_crm boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_resultado jsonb;
begin
  if not es_backoffice() and rol_actual() <> 'central' then
    p_comercial := auth.uid();
  end if;

  select coalesce(jsonb_object_agg(etapa::text, n), '{}'::jsonb) into v_resultado
  from (
    select o.etapa, count(*) as n
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
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
      and (v_q is null or c.razon_social ilike '%' || v_q || '%')
    group by o.etapa
  ) t;

  return v_resultado;
end $$;

revoke all on function contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean) from public;
grant execute on function contar_oportunidades_por_etapa(text, uuid, text, date, date, boolean) to authenticated;
