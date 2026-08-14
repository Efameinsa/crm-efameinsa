-- ============================================================
-- CRM EFAMEINSA · Migración 0008 · Notificaciones (B6)
-- ============================================================
-- Centro de notificaciones in-app + suscripciones de Web Push.
-- Ver docs/05-diseno-ux-notificaciones.md para la arquitectura completa.

create table notificaciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references perfiles (id) on delete cascade,
  tipo       text not null,          -- 'lead_asignado' | 'cotizacion_pendiente' | 'cotizacion_aprobada' | 'cotizacion_rechazada'
  titulo     text not null,
  cuerpo     text,
  url        text,                   -- destino al hacer click, ej. /comercial/oportunidades/<id>
  leida_at   timestamptz,
  created_at timestamptz not null default now()
);
create index ix_notif_usuario on notificaciones (user_id, created_at desc);
create index ix_notif_no_leidas on notificaciones (user_id) where leida_at is null;

create table push_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references perfiles (id) on delete cascade,
  endpoint   text not null unique,
  claves     jsonb not null,         -- { p256dh, auth }
  user_agent text,
  created_at timestamptz not null default now()
);
create index ix_push_usuario on push_suscripciones (user_id);

-- El insert de notificaciones SOLO vía esta función: nadie fabrica avisos a
-- nombre de otro por la API pública. Permite destinatario por user_id o por
-- rol completo (ej. avisar a TODA gerencia de una cotización pendiente).
create or replace function crear_notificacion(
  p_user_id uuid,
  p_rol rol_usuario,
  p_tipo text,
  p_titulo text,
  p_cuerpo text default null,
  p_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is not null then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (p_user_id, p_tipo, p_titulo, p_cuerpo, p_url);
  elsif p_rol is not null then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    select id, p_tipo, p_titulo, p_cuerpo, p_url
    from perfiles where rol = p_rol and activo = true;
  else
    raise exception 'crear_notificacion requiere p_user_id o p_rol';
  end if;
end;
$$;

revoke all on function crear_notificacion(uuid, rol_usuario, text, text, text, text) from public;
grant execute on function crear_notificacion(uuid, rol_usuario, text, text, text, text) to authenticated;

alter table notificaciones enable row level security;
alter table push_suscripciones enable row level security;

create policy notificaciones_select on notificaciones for select to authenticated
  using (user_id = auth.uid());
-- Solo se permite marcar como leída (no editar título/cuerpo/url): el check
-- compara el resto de columnas contra sí mismas para bloquear cualquier otro cambio.
create policy notificaciones_marcar_leida on notificaciones for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_suscripciones_propias on push_suscripciones for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table notificaciones;
