-- 0368 · App de Android: el celular se vincula solo y el consentimiento queda escrito
--
-- Santos (01-10-2026): en vez de pagar la licencia de Transistorsoft ni depender de
-- Traccar Client, el GPS en segundo plano lo hace la propia app de Android del CRM
-- (servicio nativo propio, repo Efameinsa/crm-app-movil). Esa app manda sus
-- posiciones al mismo receptor de la 0367 (/api/campo/osmand), así que lo que falta
-- en la base es:
--
-- 1. Saber QUÉ celular es cada fila de `dispositivos_campo`. La app se vincula sola
--    al iniciar sesión (ya no hay token que tipear): cada instalación trae su
--    `instalacion_id` y el CRM le entrega su token. Un celular por persona: vincular
--    uno nuevo desactiva el anterior (ver /api/campo/dispositivo).
-- 2. Dejar escrito que la persona ACEPTÓ ser rastreada. La Ley 29733 de protección
--    de datos personales exige informar qué se registra y para qué; sin
--    aceptación la app no rastrea. Se guarda la versión del texto que se le
--    mostró, para poder demostrar qué aceptó. El rastreo es 24/7 por regla de
--    gerencia (celular de la empresa), así que no hay horario que guardar.

-- 1. Qué celular es.
alter table dispositivos_campo
  add column if not exists plataforma    text,
  add column if not exists instalacion_id text,
  add column if not exists version_app   text;

alter table dispositivos_campo drop constraint if exists dispositivos_campo_plataforma_check;
alter table dispositivos_campo
  add constraint dispositivos_campo_plataforma_check
  check (plataforma is null or plataforma in ('android', 'traccar'));

-- Los que ya existen son de Traccar Client (0367).
update dispositivos_campo set plataforma = 'traccar' where plataforma is null;

-- Una instalación de la app tiene a lo más UN registro vivo por persona.
create unique index if not exists ux_dispositivos_campo_instalacion
  on dispositivos_campo (user_id, instalacion_id)
  where instalacion_id is not null and activo;

comment on column dispositivos_campo.instalacion_id is
  'Identificador que genera la app de Android al instalarse (0368). Null en los celulares con Traccar Client.';

-- 2. El consentimiento.
create table if not exists consentimientos_rastreo (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references perfiles (id) on delete cascade,
  -- Versión del texto que se le mostró (ver VERSION_CONSENTIMIENTO en src/lib/campo-consentimiento.ts).
  version_texto  text not null,
  aceptado       boolean not null,
  instalacion_id text,
  user_agent     text,
  created_at     timestamptz not null default now()
);
create index if not exists ix_consentimientos_rastreo_user on consentimientos_rastreo (user_id, created_at desc);

comment on table consentimientos_rastreo is
  'Quién aceptó (o rechazó) que la app de Android registre su ubicación durante la jornada (0368; Ley 29733). Solo se agrega: no se edita ni se borra.';

alter table consentimientos_rastreo enable row level security;
revoke all on public.consentimientos_rastreo from anon;
grant select, insert on public.consentimientos_rastreo to authenticated;
grant all on public.consentimientos_rastreo to service_role;

-- Cada persona ve y anota SOLO el suyo; gerencia y admin ven todos.
drop policy if exists consentimientos_rastreo_propio on consentimientos_rastreo;
create policy consentimientos_rastreo_propio on consentimientos_rastreo for select to authenticated
  using (user_id = auth.uid() or coalesce(es_backoffice(), false));

drop policy if exists consentimientos_rastreo_insert on consentimientos_rastreo;
create policy consentimientos_rastreo_insert on consentimientos_rastreo for insert to authenticated
  with check (user_id = auth.uid());

-- Piloto local (29-09): la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.consentimientos_rastreo';
    execute 'create trigger zz_sync after insert or update or delete on public.consentimientos_rastreo for each row execute function sync.capturar(''id'')';
  end if;
end $$;

notify pgrst, 'reload schema';
