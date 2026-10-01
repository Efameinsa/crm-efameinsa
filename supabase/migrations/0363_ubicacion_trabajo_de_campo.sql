-- 0363 · Ubicación precisa durante el piloto de trabajo de campo
--
-- Ing. Carlos a Santos, reunión 01-10-2026 11:05: desde el 02-10 Brenda (C1)
-- hace un piloto de 15 días de trabajo de campo (martes y viernes fuera), con
-- la laptop de la empresa y el wifi de su casa o el internet del celular.
-- «1, no va a ser que haya alguna restricción y 2, hacer que lo más preciso
-- sea posible … el tracking … creo que no era con precisión … no queremos 2
-- metros, pero menos de 10 metros … como se mide Uber». Después vendrá un
-- «vendedor de campo» con el mismo esquema.
--
-- Hasta hoy «Accesos y equipos» ubica por IP (0103): la central del
-- proveedor, no la persona. Acá se guarda lo que da el NAVEGADOR
-- (navigator.geolocation: wifi en la laptop, GPS en el celular), con la
-- precisión que el propio equipo declara, solo para quien gerencia marca con
-- `perfiles.trabajo_de_campo`.
--
-- Si la persona niega el permiso o el equipo no da ubicación, también queda
-- una fila (estado ≠ 'ok', sin coordenadas): gerencia tiene que poder ver
-- «no compartió» y no confundirlo con «no estuvo». Nunca frena el CRM.

alter table perfiles
  add column if not exists trabajo_de_campo boolean not null default false;

comment on column perfiles.trabajo_de_campo is
  'Piloto de trabajo de campo (Carlos, 01-10-2026): el CRM registra la ubicación del navegador al ingresar y cada 10 min. Lo marca admin.';

create table if not exists ubicaciones_campo (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references perfiles (id) on delete cascade,
  lat         double precision,
  lon         double precision,
  -- El radio en metros que declara el propio equipo (coords.accuracy).
  precision_m real,
  -- ingreso: la primera lectura de la pestaña; periodica: cada 10 min o al
  -- volver a la pestaña; manual: la persona tocó «Registrar ahora».
  origen      text not null check (origen in ('ingreso', 'periodica', 'manual')),
  -- ok: hay coordenadas. denegado: la persona no dio el permiso.
  -- no_disponible: el equipo no supo ubicarse (servicio de ubicación de
  -- Windows apagado, sin wifi cerca). tiempo_agotado: no respondió a tiempo.
  -- no_soportado: el navegador no tiene geolocalización.
  estado      text not null default 'ok'
              check (estado in ('ok', 'denegado', 'no_disponible', 'tiempo_agotado', 'no_soportado')),
  detalle     text,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now(),
  constraint ubicaciones_campo_ok_con_coordenadas check (
    estado <> 'ok' or (lat between -90 and 90 and lon between -180 and 180)
  )
);
create index if not exists ix_ubicaciones_campo_user on ubicaciones_campo (user_id, created_at desc);

alter table ubicaciones_campo enable row level security;
revoke all on public.ubicaciones_campo from anon;
grant select, insert on public.ubicaciones_campo to authenticated;
grant all on public.ubicaciones_campo to service_role;

-- Piloto local (29-09): la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.ubicaciones_campo';
    execute 'create trigger zz_sync after insert or update or delete on public.ubicaciones_campo for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- Cada uno anota SOLO las suyas, y solo si gerencia lo marcó para el piloto:
-- sin la marca no se guarda la ubicación de nadie, aunque el navegador la mande.
drop policy if exists ubicaciones_campo_insert on ubicaciones_campo;
create policy ubicaciones_campo_insert on ubicaciones_campo for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from perfiles p where p.id = auth.uid() and p.trabajo_de_campo)
  );

-- Las leen gerencia y admin (como `accesos`). Nadie edita ni borra.
drop policy if exists ubicaciones_campo_select on ubicaciones_campo;
create policy ubicaciones_campo_select on ubicaciones_campo for select to authenticated
  using (coalesce(es_backoffice(), false));
