-- ============================================================
-- CRM EFAMEINSA · Migración 0556 · Fichas repetidas del mismo cliente
-- ============================================================
-- Reunión de gerencia 20-10-2026, Family Farm / Valle Pampa: dos fichas del
-- mismo cliente, una con RUC y otra con el nombre que tipeó la comercial; la
-- cotización en una y el historial en la otra. «Hay varios casos así, que uno
-- sale con RUC y otro no… el comercial tendría que apoyar y comenzar a unir.»
--
-- El RUC ya es único (uq_cuentas_doc), así que el duplicado es siempre por
-- NOMBRE: una ficha con documento y otra sin él, o dos sin él. Esta función
-- arma los grupos por nombre normalizado (sin tildes, puntuación ni forma
-- societaria), solo cuando al menos una ficha del grupo tiene movimiento
-- (expediente, caso, pedido o cierre), sin archivadas, fusionadas ni sedes de
-- una misma institución. «No son el mismo» queda guardado para no volver a
-- mostrarse (fichas_no_repetidas).
-- ============================================================

create table if not exists fichas_no_repetidas (
  clave text primary key,
  decidido_por uuid references perfiles(id) default auth.uid(),
  decidido_at timestamptz not null default now(),
  motivo text
);
alter table fichas_no_repetidas enable row level security;
drop policy if exists fichas_no_repetidas_lee on fichas_no_repetidas;
create policy fichas_no_repetidas_lee on fichas_no_repetidas for select to authenticated using (true);
drop policy if exists fichas_no_repetidas_escribe on fichas_no_repetidas;
create policy fichas_no_repetidas_escribe on fichas_no_repetidas for insert to authenticated
  with check ((select es_backoffice()) or (select es_operaciones()) or (select rol_actual()) = 'central');

create or replace function public.nombre_normalizado(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
           regexp_replace(
             translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'),
             '\m(s\.?a\.?c\.?|s\.?a\.?a\.?|s\.?a\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|s\.?c\.?r\.?l\.?|sociedad anonima cerrada|sociedad comercial de responsabilidad limitada)\M', ' ', 'g'),
           '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.fichas_repetidas(p_solo_comercial uuid default null)
returns table (clave text, cuentas jsonb)
language sql stable security definer set search_path = public as $$
  with base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.comercial_id, c.created_at,
           nombre_normalizado(c.razon_social) as clave,
           (select count(*) from oportunidades o where o.cuenta_id = c.id) as expedientes,
           (select count(*) from servicios_postventa s where s.cuenta_id = c.id) as pedidos,
           (select count(*) from atenciones a where a.cuenta_id = c.id) as casos,
           (select count(*) from informes_cierre i where i.cuenta_id = c.id) as cierres
      from cuentas c
     where c.archivada_at is null and c.fusionada_en is null and c.cuenta_padre_id is null
       and length(nombre_normalizado(c.razon_social)) >= 6
  ), grupos as (
    select b.clave
      from base b
     group by b.clave
    having count(*) > 1
       and sum(b.expedientes + b.pedidos + b.casos + b.cierres) > 0
       and count(*) filter (where b.tipo_doc <> 'SIN_DOC' and b.num_doc is not null) <= 1
  )
  select g.clave,
         jsonb_agg(jsonb_build_object(
           'id', b.id, 'razon_social', b.razon_social, 'documento', case when b.tipo_doc <> 'SIN_DOC' then b.num_doc end,
           'comercial', (select coalesce(p.codigo_comercial || ' ', '') || p.nombre from perfiles p where p.id = b.comercial_id),
           'comercial_id', b.comercial_id,
           'expedientes', b.expedientes, 'pedidos', b.pedidos, 'casos', b.casos, 'cierres', b.cierres,
           'creada', b.created_at
         ) order by (b.tipo_doc <> 'SIN_DOC') desc, (b.expedientes + b.pedidos + b.casos + b.cierres) desc)
    from grupos g
    join base b on b.clave = g.clave
   where not exists (select 1 from fichas_no_repetidas n where n.clave = g.clave)
     and (p_solo_comercial is null or exists (select 1 from base x where x.clave = g.clave and x.comercial_id = p_solo_comercial))
   group by g.clave
   order by g.clave
$$;
revoke all on function public.fichas_repetidas(uuid) from public;
grant execute on function public.fichas_repetidas(uuid) to authenticated;

-- Permisos explícitos (en la base local las tablas nuevas no los heredan).
grant select, insert on public.fichas_no_repetidas to authenticated;
grant all on public.fichas_no_repetidas to service_role;
