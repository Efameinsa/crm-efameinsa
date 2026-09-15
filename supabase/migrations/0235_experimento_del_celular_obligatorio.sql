-- ============================================================
-- CRM EFAMEINSA · Migración 0235 · El experimento A/B de la web se mide en el CRM
-- ============================================================
-- Reunión del 14-09, punto del celular obligatorio. Carlos: «yo diría de
-- entrada que lo obliguemos a que se registre su teléfono»; Santos: «hay una
-- versión de la web que pida celular obligatorio y otra que no, y mandamos
-- tráfico a ambas»; quedó en probar en paralelo un mes. Santos, 15-09:
-- «adelante».
--
-- La web asigna la variante (cookie) y la manda en cada lead como
-- `experimento` («tel-a» = como hoy, «tel-b» = celular obligatorio). Lo que
-- decide el test no es cuántos se registran —eso lo mide GA4— sino cuántos
-- de esos leads se pudieron trabajar: con teléfono, contactados, calificados,
-- cotizados. Eso solo lo sabe el CRM, y lo cuenta `experimento_web()` por
-- variante para el panel de marketing.
-- ============================================================

alter table public.leads add column if not exists experimento text;
create index if not exists ix_leads_experimento on public.leads (experimento) where experimento is not null;
comment on column public.leads.experimento is
  'Variante del experimento de la web con que entró el contacto («tel-a» / «tel-b», 0235). Null = fuera del experimento.';

create or replace function public.experimento_web(p_desde date, p_hasta date)
returns table (
  variante      text,
  leads         integer,
  con_telefono  integer,
  contactados   integer,
  calificados   integer,
  cotizados     integer,
  ganados       integer,
  descartados   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(es_backoffice(), false) then
    raise exception 'No autorizado';
  end if;
  return query
  with base as (
    select l.id, l.experimento,
           length(coalesce(l.telefono_normalizado, '')) >= 6 as tiene_tel,
           l.estado,
           coalesce(l.oportunidad_id, (select o.id from oportunidades o where o.lead_id = l.id order by o.created_at desc limit 1)) as op_id
      from leads l
     where l.es_prueba = false
       and l.experimento is not null
       and (l.recibido_at at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  x as (
    select b.*,
           o.etapa as op_etapa,
           exists (select 1 from actividades a where a.oportunidad_id = b.op_id
                     and a.tipo in ('llamada', 'whatsapp', 'email', 'visita', 'showroom', 'reunion_online')) as contactado,
           exists (select 1 from cotizaciones c where c.oportunidad_id = b.op_id and c.enviada_at is not null) as cotizado,
           exists (select 1 from ventas v where v.oportunidad_id = b.op_id and v.anulada_at is null) as ganado
      from base b
      left join oportunidades o on o.id = b.op_id
  )
  select x.experimento,
         count(*)::int,
         count(*) filter (where x.tiene_tel)::int,
         count(*) filter (where x.contactado)::int,
         count(*) filter (where x.op_id is not null and x.op_etapa is distinct from 'rechazada' and x.estado <> 'descartado')::int,
         count(*) filter (where x.cotizado)::int,
         count(*) filter (where x.ganado)::int,
         count(*) filter (where x.estado = 'descartado' or x.op_etapa = 'rechazada')::int
    from x
   group by x.experimento
   order by x.experimento;
end $$;
revoke all on function public.experimento_web(date, date) from public;
grant execute on function public.experimento_web(date, date) to authenticated;
