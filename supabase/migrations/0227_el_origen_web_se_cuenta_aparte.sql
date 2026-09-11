-- ============================================================
-- CRM EFAMEINSA · Migración 0227 · El origen web se cuenta aparte en marketing
-- ============================================================
-- Santos, 11-09: «hay que distinguir: campañas pagadas de Google Ads llegan
-- por formulario de Google Ads […]; cuando vienen por la campaña de tráfico
-- a la landing page […] debería salir que es por landing; y cuando se
-- registran por la web de manera orgánica, un chip que diga orgánico».
--
-- `leads_por_origen` (0025/0073) juntaba todo lo de la web bajo el canal
-- «formulario_web». Ahora separa:
--   google_ads / meta_ads → el formulario nativo del anuncio (webhook)
--   web_landing           → se registró en una landing de campaña
--   web_campana           → entró a la web normal viniendo de un anuncio
--                           (trae gclid/fbclid o medio pagado)
--   web_organico          → se registró en efameinsa.com sin anuncio
-- Misma regla que origenDe() en src/lib/campana.ts.
-- ============================================================

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
             when (gclid is not null or fbclid is not null
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

revoke all on function leads_por_origen(date, date) from public;
grant execute on function leads_por_origen(date, date) to authenticated;
