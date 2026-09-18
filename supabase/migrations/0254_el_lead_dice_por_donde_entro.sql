-- ============================================================
-- CRM EFAMEINSA · Migración 0254 · El lead dice por dónde entró
-- ============================================================
-- Santos, 18-09: «quiero un detalle fino de las mediciones y rastreo del
-- contacto de cada lead de punta a punta». Lo que faltaba en el CRM:
--
--   1. La web guardaba por dónde entró la persona (página de entrada,
--      referente, página desde la que escribió) pero solo mandaba el gclid.
--      Ahora viajan los tres y se guardan en el lead.
--   2. Los WhatsApp que nacen del botón de la web llegaban sin fuente (241
--      de 244 en el último mes). El botón lleva ahora un código corto al
--      final del mensaje —[W-FICHA], [G-CALC], [M-CATEG]…— con la
--      plataforma que trajo el clic (W web orgánica, G Google Ads, M Meta)
--      y la página desde la que se escribió. Son códigos del mismo catálogo
--      que los de los anuncios (0231), así que el webhook los resuelve solo.
--   3. `leads_por_origen` separa el WhatsApp de la web del de campaña.
-- ============================================================

alter table leads
  add column if not exists pagina_entrada text,
  add column if not exists pagina_envio   text,
  add column if not exists referente      text;

comment on column leads.pagina_entrada is 'Página de efameinsa.com por la que entró la visita que dejó el contacto (última entrada con origen conocido).';
comment on column leads.pagina_envio   is 'Página desde la que se envió el formulario (o se tocó el botón de WhatsApp).';
comment on column leads.referente      is 'Sitio del que venía (google.com, chatgpt.com, facebook…), cuando el navegador lo dijo.';

-- Los códigos del botón de WhatsApp de la web: prefijo por plataforma, sufijo
-- por página. `plataforma = 'otro'` para lo orgánico: el chip lo distingue
-- por el prefijo W- (ver origenDe en src/lib/campana.ts).
insert into campanias_whatsapp (codigo, nombre, plataforma, mensaje_prellenado, activa)
select p.pref || '-' || g.suf,
       'Web · ' || g.nombre || ' (' || p.nombre || ')',
       p.plataforma,
       null,
       true
  from (values
    ('W', 'orgánico', 'otro'),
    ('G', 'vino de Google Ads', 'google'),
    ('M', 'vino de Meta', 'meta')
  ) as p(pref, nombre, plataforma)
 cross join (values
    ('INICIO',  'portada'),
    ('CATEG',   'categoría o listado'),
    ('FICHA',   'ficha de equipo'),
    ('CALC',    'calculadora'),
    ('LANDING', 'landing de campaña'),
    ('SERV',    'servicio técnico'),
    ('OTRA',    'otra página')
  ) as g(suf, nombre)
on conflict do nothing;

-- El informe de marketing: el WhatsApp con código de la web se cuenta aparte
-- del de campaña y del que Central registra a mano sin origen.
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
             when canal = 'whatsapp' and codigo_campania_wa ~* '^W-' then 'whatsapp_web'
             when canal = 'whatsapp' and codigo_campania_wa is not null then 'whatsapp_campana'
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
