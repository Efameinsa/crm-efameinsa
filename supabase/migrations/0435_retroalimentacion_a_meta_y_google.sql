-- 0435 · Retroalimentación automática del CRM a Meta y Google
--
-- 10-10-2026, Santos: «toda la información que tenemos dale feedback a meta y
-- google… corrige todo… las conversiones deben guiar las pujas de google ya».
--
-- Hasta hoy la Conversions API (0257) solo salía en tres caminos (WhatsApp de
-- anuncio, tipificación de campaña WA y cierre emitido): emitir una cotización
-- o calificar un formulario de Meta nunca le llegaba a Meta (17 cotizaciones
-- en tres semanas). Ahora una tarea cada hora (`/api/cron/retroalimentacion`)
-- lee de aquí lo que pasó y lo manda, sin depender de qué pantalla se usó.
--
-- `retroalimentacion_candidatos(dias)` devuelve un evento por hecho:
--   Lead              → el expediente se calificó con interés medio o más
--   SubmitApplication → primera cotización enviada del lead
--   Purchase          → venta viva (clave = informe de cierre o la venta)
-- Meta acepta 7 días hacia atrás; Google, 90 desde el clic.

create table if not exists public.eventos_google (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  conversion text not null,
  clave text not null unique,
  gclid text,
  valor numeric,
  moneda text,
  conversion_at timestamptz not null,
  enviado_at timestamptz not null default now(),
  respuesta jsonb,
  error text
);
alter table public.eventos_google enable row level security;
comment on table public.eventos_google is
  '0435: conversiones offline subidas a Google Ads (o el error). La clave evita repetir.';

create or replace function public.retroalimentacion_candidatos(p_dias integer)
returns table (
  lead_id uuid, evento text, clave text, ocurrio_at timestamptz, valor numeric, moneda text,
  gclid text, recibido_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with l as (
    select l.id, l.gclid, l.recibido_at,
           coalesce(l.oportunidad_id, (select o.id from oportunidades o where o.lead_id = l.id order by o.created_at desc limit 1)) as op
      from leads l
     where not coalesce(l.es_prueba, false) and l.anulado_at is null
       and l.recibido_at > now() - interval '120 days'
  )
  select l.id, 'Lead', l.id || ':Lead', o.updated_at, null::numeric, null::text, l.gclid, l.recibido_at
    from l join oportunidades o on o.id = l.op
   where o.intencion::text in ('medio', 'medio_alto', 'alto_potencial')
     and o.updated_at > now() - make_interval(days => p_dias)
  union all
  select * from (
    select distinct on (l.id) l.id, 'SubmitApplication', l.id || ':SubmitApplication', c.enviada_at, null::numeric, null::text, l.gclid, l.recibido_at
      from l join cotizaciones c on c.oportunidad_id = l.op
     where c.enviada_at is not null and c.estado <> 'anulada' and c.codigo not like 'PRUEBA%'
     order by l.id, c.enviada_at
  ) primera where enviada_at > now() - make_interval(days => p_dias)
  union all
  select l.id, 'Purchase', l.id || ':Purchase:' || coalesce(i.id::text, 'venta-' || v.id),
         greatest(v.created_at, v.fecha_venta::timestamptz), v.monto_total,
         case when v.moneda = 'PEN' then 'PEN' else 'USD' end, l.gclid, l.recibido_at
    from l join ventas v on v.oportunidad_id = l.op
    left join informes_cierre i on i.venta_id = v.id and i.anulado_at is null
   where v.anulada_at is null and v.created_at > now() - make_interval(days => p_dias)
$$;

revoke all on function public.retroalimentacion_candidatos(integer) from public, anon, authenticated;
grant execute on function public.retroalimentacion_candidatos(integer) to service_role;
