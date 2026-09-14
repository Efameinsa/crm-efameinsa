-- ============================================================
-- CRM EFAMEINSA · Migración 0232 · Comunicados de gerencia al entrar al CRM
-- ============================================================
-- Reunión del 14-09 (Carlos, Karen, Santos), sobre el lanzamiento de la
-- web nueva: «nadie conoce nuestra página web (…) hoy han llegado 20
-- formularios del sábado al lunes y el gestor no sabe de dónde provienen».
-- Carlos: «el CRM lo abre todos los días, entonces ni bien entra, un pop-up,
-- una ventana emergente, que pase las 4 láminas y un link, y una disposición
-- de gerencia (…) obligarlos a que vayan a la web y se registren. Cada uno
-- con su usuario y contraseña. Eso es mandatorio».
--
-- Un comunicado tiene láminas (texto o imagen), un enlace, y una disposición
-- opcional que cada persona confirma haber cumplido. Se muestra al entrar
-- hasta que la persona lo lee; si trae disposición, vuelve a recordárselo
-- cada día hasta que la marque cumplida. Gerencia ve quién lo leyó y quién
-- cumplió. La tabla queda genérica: la campaña de reseñas de Google que
-- viene después («una disposición y un QR») entra por acá mismo.
-- ============================================================

create table if not exists public.comunicados (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null unique,             -- 'web-2026-09', 'resenas-google'
  titulo          text not null,
  laminas         jsonb not null default '[]'::jsonb,-- [{titulo, texto, imagen?}]
  enlace          text,                             -- a dónde lleva el botón
  enlace_texto    text,
  disposicion     text,                             -- lo que gerencia manda hacer (null = solo informativo)
  disposicion_boton text,                           -- «Ya me registré en la web»
  vigente_desde   timestamptz not null default now(),
  vigente_hasta   timestamptz,
  activo          boolean not null default true,
  creado_por      uuid references perfiles (id),
  created_at      timestamptz not null default now()
);

create table if not exists public.comunicados_acuses (
  comunicado_id   uuid not null references comunicados (id) on delete cascade,
  perfil_id       uuid not null references perfiles (id) on delete cascade,
  leido_at        timestamptz not null default now(),
  cumplido_at     timestamptz,
  recordar_desde  timestamptz,                      -- «lo veo luego»: no antes de esta hora
  primary key (comunicado_id, perfil_id)
);

alter table public.comunicados enable row level security;
alter table public.comunicados_acuses enable row level security;

drop policy if exists comunicados_lectura on public.comunicados;
create policy comunicados_lectura on public.comunicados for select to authenticated using (true);
drop policy if exists comunicados_gerencia on public.comunicados;
create policy comunicados_gerencia on public.comunicados for all to authenticated
  using (coalesce(es_backoffice(), false)) with check (coalesce(es_backoffice(), false));

drop policy if exists acuses_propios on public.comunicados_acuses;
create policy acuses_propios on public.comunicados_acuses for all to authenticated
  using (perfil_id = (select auth.uid()) or coalesce(es_backoffice(), false))
  with check (perfil_id = (select auth.uid()));

-- El que toca mostrar ahora a quien está entrando: el activo y vigente que no
-- ha leído, o que leyó pero tiene una disposición sin cumplir y ya pasó su
-- «lo veo luego». Uno por vez.
create or replace function public.comunicado_pendiente()
returns table (
  id uuid, clave text, titulo text, laminas jsonb, enlace text, enlace_texto text,
  disposicion text, disposicion_boton text, leido_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.clave, c.titulo, c.laminas, c.enlace, c.enlace_texto, c.disposicion, c.disposicion_boton, a.leido_at
    from comunicados c
    left join comunicados_acuses a on a.comunicado_id = c.id and a.perfil_id = auth.uid()
   where c.activo
     and c.vigente_desde <= now()
     and (c.vigente_hasta is null or c.vigente_hasta > now())
     and (
       a.perfil_id is null
       or (c.disposicion is not null and a.cumplido_at is null and coalesce(a.recordar_desde, a.leido_at) <= now())
     )
   order by c.vigente_desde
   limit 1;
$$;
revoke all on function public.comunicado_pendiente() from public;
grant execute on function public.comunicado_pendiente() to authenticated;

-- Leído / cumplido / lo veo luego (mañana).
create or replace function public.acusar_comunicado(p_comunicado uuid, p_accion text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if p_accion not in ('leido', 'cumplido', 'luego') then raise exception 'Acción desconocida'; end if;
  insert into comunicados_acuses (comunicado_id, perfil_id, leido_at, cumplido_at, recordar_desde)
  values (
    p_comunicado, auth.uid(), now(),
    case when p_accion = 'cumplido' then now() end,
    case when p_accion = 'luego' then now() + interval '20 hours' end
  )
  on conflict (comunicado_id, perfil_id) do update
    set cumplido_at    = coalesce(comunicados_acuses.cumplido_at, excluded.cumplido_at),
        recordar_desde = case when p_accion = 'luego' then now() + interval '20 hours' else comunicados_acuses.recordar_desde end;
end $$;
revoke all on function public.acusar_comunicado(uuid, text) from public;
grant execute on function public.acusar_comunicado(uuid, text) to authenticated;

-- ── El primero: la web nueva ────────────────────────────────────────────────
insert into comunicados (clave, titulo, laminas, enlace, enlace_texto, disposicion, disposicion_boton)
values (
  'web-2026-09',
  'Nuestra nueva web ya está en línea',
  '[
    {"titulo": "Nuestra nueva web ya está en línea",
     "texto": "www.efameinsa.com tiene una imagen más técnica y moderna, hecha para mostrar nuestra ingeniería, diferenciarnos y atraer clientes. Los contactos que hoy llegan a la bandeja y a sus expedientes con el chip «Web» salen de ahí."},
    {"titulo": "Entra, explora y descubre",
     "texto": "Equipos, soluciones por sector, servicio técnico y la calculadora que dimensiona una lavandería. Tres equipos ya se ven en 3D y realidad aumentada, y los que tienen stock dicen «Entrega inmediata»."},
    {"titulo": "Tú aportas: juntos mejoramos",
     "texto": "¿Viste algo para mejorar? Envíanos el enlace, una captura y tu sugerencia. Nos ayuda a afinar la web y a avanzar hacia los objetivos comerciales."},
    {"titulo": "Hagamos crecer nuestro alcance",
     "texto": "Comparte la web con tus clientes y contactos interesados. Más confianza, más oportunidades."}
  ]'::jsonb,
  'https://www.efameinsa.com',
  'Entrar a la web',
  'Disposición de gerencia: cada persona entra a www.efameinsa.com y se registra con su usuario y contraseña. Quien vende los equipos tiene que conocer la web por la que hoy llegan los clientes.',
  'Ya me registré en la web'
)
on conflict (clave) do nothing;
