-- ============================================================
-- CRM EFAMEINSA · Migración 0160 · Auditoría de cuentas desde gerencia
-- ============================================================
-- Santos, 02-09: «desde la vista de gerencia se pueda auditar las cuentas de
-- cada comercial, central y logística; ver todas esas cuentas y con un click
-- ingresar en una ventana ya logueada, sin cambiar de navegador ni buscar el
-- usuario y contraseña de cada empleado».
--
-- CÓMO. Gerencia toca «Entrar como»; el servidor genera un acceso de un solo
-- uso para esa cuenta y lo abre en una de cinco direcciones aparte
-- (ver1…ver5.crm.efameinsa.com), porque el navegador guarda una sesión por
-- dirección: así la sesión de gerencia no se pisa y se pueden auditar tres
-- personas a la vez. En esas direcciones el CRM es SOLO LECTURA (el proxy
-- rechaza cualquier escritura) y lleva una franja que dice de quién es la
-- sesión. Auditar es mirar.
--
-- ESTA TABLA es el registro: quién de gerencia entró como quién, en qué
-- ranura y cuándo. Lo escribe el servidor (service_role) y lo lee solo
-- gerencia y admin.
-- ============================================================

create table if not exists auditorias_sesion (
  id            uuid primary key default gen_random_uuid(),
  auditor_id    uuid not null references perfiles (id),
  auditado_id   uuid not null references perfiles (id),
  ranura        smallint not null check (ranura between 1 and 5),
  abierta_at    timestamptz not null default now(),
  entrada_at    timestamptz,
  ultimo_visto_at timestamptz,
  host          text
);
alter table auditorias_sesion enable row level security;
create index if not exists ix_auditorias_ranura on auditorias_sesion (ranura, abierta_at desc);

drop policy if exists auditorias_lectura on auditorias_sesion;
create policy auditorias_lectura on auditorias_sesion
  for select using ((select rol_actual()) in ('gerencia', 'admin'));

comment on table auditorias_sesion is
  'Quién de gerencia entró como quién, en qué ranura (ver1…ver5) y cuándo (0160). Solo lectura para gerencia y admin; escribe el servidor.';
