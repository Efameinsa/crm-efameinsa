-- 0367 · GPS del celular para el piloto de trabajo de campo
--
-- Ing. Carlos (vía Santos, 01-10-2026), sobre el piloto de Brenda (C1): que se
-- rastree «lo más preciso posible, como Uber o inDrive». La 0363 guarda lo que
-- da el NAVEGADOR, y eso tiene dos techos que no se suben con código:
--   · una laptop no tiene GPS: Windows se ubica por las redes wifi cercanas
--     (20-100 m en ciudad, peor en una carretera);
--   · un navegador no lee la ubicación con la pestaña de fondo ni con la
--     pantalla apagada: si cierra la laptop, el recorrido se corta.
-- Uber e inDrive usan el GPS del CELULAR con una app que sigue en segundo
-- plano. Acá se hace lo mismo con Traccar Client (gratuita, Android/iOS): la
-- app manda cada posición a /api/campo/osmand (protocolo OsmAnd) con un
-- identificador secreto, que es el token de `dispositivos_campo`.
--
-- La 0363 deja la ubicación del navegador como está; las de la app entran a la
-- MISMA tabla con origen 'app', para que el recorrido del día sea uno solo.

-- 1. Los celulares vinculados. El token es la única llave de la ruta pública:
--    quien lo tiene puede anotar posiciones a nombre de esa persona, así que
--    lo ven solo gerencia y admin, y se puede desactivar en un clic.
create table if not exists dispositivos_campo (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references perfiles (id) on delete cascade,
  token           text not null unique check (length(token) >= 20),
  nombre          text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  -- La última vez que la app mandó algo (se actualiza a lo más una vez por
  -- minuto): «el celular dejó de reportar a las 15:40» se lee de acá.
  ultimo_envio_at timestamptz
);
create index if not exists ix_dispositivos_campo_user on dispositivos_campo (user_id, created_at desc);

comment on table dispositivos_campo is
  'Celulares con Traccar Client vinculados al piloto de trabajo de campo (0367; Carlos 01-10-2026). El token es el «identificador del dispositivo» de la app.';

alter table dispositivos_campo enable row level security;
revoke all on public.dispositivos_campo from anon;
grant select, insert, update on public.dispositivos_campo to authenticated;
grant all on public.dispositivos_campo to service_role;

drop policy if exists dispositivos_campo_backoffice on dispositivos_campo;
create policy dispositivos_campo_backoffice on dispositivos_campo for all to authenticated
  using (coalesce(es_backoffice(), false))
  with check (coalesce(es_backoffice(), false));

-- 2. Las posiciones de la app, en la misma tabla que las del navegador.
alter table ubicaciones_campo drop constraint if exists ubicaciones_campo_origen_check;
alter table ubicaciones_campo add constraint ubicaciones_campo_origen_check
  check (origen in ('ingreso', 'periodica', 'manual', 'app'));

alter table ubicaciones_campo
  add column if not exists velocidad_mps real,
  add column if not exists rumbo         real,
  -- 0-100 %.
  add column if not exists bateria       real,
  -- La hora del GPS. NO es created_at (la hora en que llegó al CRM): sin señal
  -- la app junta las posiciones y las manda todas juntas al volver la
  -- cobertura; el recorrido se ordena por esta. En el navegador son la misma.
  add column if not exists registrada_at timestamptz,
  add column if not exists dispositivo_id uuid references dispositivos_campo (id) on delete set null;

comment on column ubicaciones_campo.registrada_at is
  'Hora de la lectura (GPS del celular o navegador). created_at es la hora de llegada: la app manda en cola lo que juntó sin señal.';

-- Las filas de la 0363 (navegador): la lectura es la hora de llegada.
update ubicaciones_campo set registrada_at = created_at where registrada_at is null;
-- Y en adelante el navegador no la manda: vale la hora de llegada.
alter table ubicaciones_campo alter column registrada_at set default now();

-- La app reintenta lo que no recibió respuesta: la misma posición del mismo
-- celular entra una sola vez. Las del navegador (dispositivo_id null) no
-- chocan entre sí: en un índice único los null son distintos.
create unique index if not exists ux_ubicaciones_campo_dispositivo_hora
  on ubicaciones_campo (dispositivo_id, registrada_at);
create index if not exists ix_ubicaciones_campo_user_registrada
  on ubicaciones_campo (user_id, registrada_at desc);

-- Piloto local (29-09): la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.dispositivos_campo';
    execute 'create trigger zz_sync after insert or update or delete on public.dispositivos_campo for each row execute function sync.capturar(''id'')';
  end if;
end $$;
