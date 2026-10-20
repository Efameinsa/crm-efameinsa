-- 0539 · Llamadas hechas desde el CRM, con su audio y transcripción en la VM
--
-- Santos (19-10-2026): que el comercial llame desde la ficha del cliente, que la
-- llamada se grabe y que el audio, su transcripción y un resumen queden
-- guardados EN LA VM, ordenados por cliente y por día, para que gerencia haga
-- el seguimiento de la gestión de cada vendedor. Plan: Downloads/Plan-llamadas-
-- grabadas-CRM.md. Lo que se grabó y dónde queda lo decide src/lib/llamadas.ts.
--
-- Esta tabla guarda la llamada y las RUTAS de sus archivos; el audio y el
-- .txt no viven en la base sino en el disco de la VM (/srv/llamadas, o lo que
-- diga LLAMADAS_DIR), igual que los informes en el servidor de archivos.
--
-- Quién la escribe: SOLO la API (llave de servicio), con el token del celular
-- (dispositivos_campo, 0367) o con la sesión de la persona (la PWA).
-- Quién la lee: cada comercial, las suyas; gerencia y admin, todas.

create table if not exists llamadas (
  -- El MISMO uuid que genera el celular al marcar: si la subida se corta y
  -- reintenta, la llamada no se duplica.
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references perfiles (id),
  -- Puede faltar: se llamó a un número que no está en ninguna ficha.
  cuenta_id           uuid references cuentas (id) on delete set null,
  contacto_id         uuid references contactos (id) on delete set null,
  oportunidad_id      uuid references oportunidades (id) on delete set null,
  -- La gestión «llamada» que se anota sola en el expediente.
  actividad_id        uuid references actividades (id) on delete set null,
  -- Normalizado: +51987654321 (lib/llamadas.ts).
  numero              text not null,
  direccion           text not null default 'saliente' check (direccion in ('saliente', 'entrante')),
  -- 'app' = botón Llamar de la app Android (puede grabar); 'pwa' = navegador (solo se anota).
  origen              text not null default 'app' check (origen in ('app', 'pwa')),
  iniciada_at         timestamptz not null,
  duracion_s          integer not null default 0 check (duracion_s >= 0),
  -- Duración > 0 = alguien contestó.
  contestada          boolean not null default false,

  -- El audio. 'no_encontrado': la app no halló el archivo; 'no_disponible': ese
  -- celular no graba; 'sin_audio_pwa': se llamó desde el navegador.
  estado_audio        text not null default 'pendiente'
                      check (estado_audio in ('pendiente', 'subido', 'no_encontrado', 'no_disponible', 'sin_audio_pwa')),
  -- Rutas RELATIVAS a la raíz de las llamadas: por-dia/2026/10/2026-10-19/….ogg
  ruta_audio          text,
  ruta_transcripcion  text,
  audio_bytes         bigint,

  -- Lo que sale de la IA (servicio llamadas-ia en la VM).
  estado_ia           text not null default 'pendiente'
                      check (estado_ia in ('pendiente', 'procesando', 'listo', 'error', 'no_aplica')),
  intentos_ia         smallint not null default 0,
  error_ia            text,
  transcripcion       text,
  resumen             text,
  -- {interes: alto|medio|bajo|ninguno, proxima_accion, fecha_proxima, productos[], objeciones[]}
  ia                  jsonb,
  ia_at               timestamptz,

  dispositivo_id      uuid references dispositivos_campo (id) on delete set null,
  creada_at           timestamptz not null default now()
);

create index if not exists ix_llamadas_iniciada on llamadas (iniciada_at desc);
create index if not exists ix_llamadas_cuenta on llamadas (cuenta_id, iniciada_at desc);
create index if not exists ix_llamadas_user on llamadas (user_id, iniciada_at desc);
-- El servicio de transcripción busca solo lo que espera: índice chico.
create index if not exists ix_llamadas_ia_pendiente on llamadas (creada_at)
  where estado_ia = 'pendiente' and estado_audio = 'subido';

comment on table llamadas is
  'Llamadas hechas desde el CRM (Santos, 19-10-2026). Guarda la llamada y las rutas de su audio y transcripción, que viven en el disco de la VM (LLAMADAS_DIR). Escribe solo la API; cada comercial lee las suyas, gerencia y admin todas (0539).';
comment on column llamadas.ruta_audio is
  'Relativa a la raíz de las llamadas: por-dia/AAAA/MM/AAAA-MM-DD/<nombre>.ogg. El nombre lo arma lib/llamadas.ts (hora de Lima).';
comment on column llamadas.estado_audio is
  'pendiente | subido | no_encontrado (la app no halló el archivo) | no_disponible (ese celular no graba) | sin_audio_pwa (llamó desde el navegador).';

alter table llamadas enable row level security;
revoke all on public.llamadas from anon;
grant select on public.llamadas to authenticated;
grant all on public.llamadas to service_role;

drop policy if exists llamadas_propias on llamadas;
create policy llamadas_propias on llamadas for select to authenticated
  using (user_id = auth.uid());

drop policy if exists llamadas_backoffice on llamadas;
create policy llamadas_backoffice on llamadas for select to authenticated
  using (coalesce(es_backoffice(), false));
