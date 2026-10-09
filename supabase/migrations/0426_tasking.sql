-- 0426 · TASKING dentro del CRM (Santos, 09-10-2026).
--
-- «Este sistema llamado Tasking quiero que haga muchas cosas»: al grabar una
-- reunión se transcribe, al terminar la IA arma el acta y a cada persona le
-- llegan por WhatsApp sus acuerdos pendientes, con recordatorios. Y «una de sus
-- funcionalidades también, que sea un mensaje de que su sugerencia haya sido
-- atendida». Viene del proyecto libre soyhank/tasking, pasado al CRM como un
-- módulo SOLO DEL ADMIN (sidebar «Tasking»).
--
-- WhatsApp: NO es la API de Meta. Sale de un WhatsApp vinculado por QR (como
-- WhatsApp Web) desde un programa en la VM (servicio tasking-whatsapp), que
-- toma la cola `tasking_mensajes`. Santos eligió esta vía gratis sabiendo que
-- WhatsApp puede bloquear números que envían mensajes automáticos (09-10).
--
-- Todo con RLS: el admin lo ve por su sesión; el servidor (worker, cron) entra
-- con service_role.

create table if not exists public.tasking_personas (
  id uuid primary key default gen_random_uuid(),
  -- La cuenta del CRM de esa persona, si tiene (para avisarle de sus sugerencias).
  perfil_id uuid unique references public.perfiles(id) on delete set null,
  nombre text not null,
  -- Cómo la llaman en las reuniones, para que la IA la reconozca («Lesly», «la inge»).
  apodos text not null default '',
  cargo text not null default '',
  correo text,
  whatsapp text,
  es_gerencia boolean not null default false,
  activo boolean not null default true,
  -- Enlace personal sin contraseña para marcar sus compromisos (/t/<token>).
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  creado_en timestamptz not null default now()
);

create table if not exists public.tasking_reuniones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Reunión',
  inicio timestamptz not null default now(),
  fin timestamptz,
  estado text not null default 'grabando' check (estado in ('grabando', 'procesando', 'lista', 'error')),
  participantes uuid[] not null default '{}',
  transcripcion text not null default '',
  audio_partes int not null default 0,
  resumen text,
  temas jsonb not null default '[]',
  acuerdos_generales jsonb not null default '[]',
  modelo text,
  fuente text,
  error text,
  intentos int not null default 0,
  procesado_en timestamptz,
  creado_en timestamptz not null default now()
);

create table if not exists public.tasking_compromisos (
  id uuid primary key default gen_random_uuid(),
  numero bigserial unique,
  reunion_id uuid references public.tasking_reuniones(id) on delete set null,
  persona_id uuid references public.tasking_personas(id) on delete set null,
  responsable_texto text,
  descripcion text not null,
  vence_en timestamptz,
  hora_definida boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecho', 'anulado')),
  cita text,
  hecho_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists tasking_compromisos_persona_idx on public.tasking_compromisos (persona_id, estado);
create index if not exists tasking_compromisos_vence_idx on public.tasking_compromisos (estado, vence_en);

create table if not exists public.tasking_mensajes (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('whatsapp', 'correo')),
  tipo text not null default 'aviso',
  persona_id uuid references public.tasking_personas(id) on delete cascade,
  compromiso_id uuid references public.tasking_compromisos(id) on delete cascade,
  reunion_id uuid references public.tasking_reuniones(id) on delete cascade,
  sugerencia_id uuid references public.sugerencias(id) on delete set null,
  destino text not null,
  asunto text,
  cuerpo text not null,
  html text,
  enviar_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'cancelado')),
  intentos int not null default 0,
  error text,
  enviado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists tasking_mensajes_cola_idx on public.tasking_mensajes (canal, estado, enviar_en);

-- Estado del WhatsApp vinculado (QR, número), órdenes al programa y tareas diarias ya hechas.
create table if not exists public.tasking_ajustes (
  clave text primary key,
  valor jsonb not null default '{}',
  actualizado_en timestamptz not null default now()
);

alter table public.tasking_personas enable row level security;
alter table public.tasking_reuniones enable row level security;
alter table public.tasking_compromisos enable row level security;
alter table public.tasking_mensajes enable row level security;
alter table public.tasking_ajustes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tasking_personas', 'tasking_reuniones', 'tasking_compromisos', 'tasking_mensajes', 'tasking_ajustes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (rol_actual() = ''admin'') with check (rol_actual() = ''admin'')', t || '_admin', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.tasking_compromisos_numero_seq to authenticated, service_role;

create or replace function public.tasking_agregar_texto(p_reunion uuid, p_texto text)
returns void language sql security definer set search_path = public as $$
  update public.tasking_reuniones
     set transcripcion = case when transcripcion = '' then p_texto else transcripcion || ' ' || p_texto end
   where id = p_reunion and estado = 'grabando';
$$;

-- El programa de WhatsApp (y el cron, para los correos) toma lo que ya toca enviar.
create or replace function public.tasking_tomar_mensajes(p_canal text, p_limite int default 10)
returns setof public.tasking_mensajes language sql security definer set search_path = public as $$
  update public.tasking_mensajes m
     set estado = 'enviando', intentos = intentos + 1
   where m.id in (
     select id from public.tasking_mensajes
      where canal = p_canal
        and (estado = 'pendiente' or (estado = 'enviando' and enviar_en < now() - interval '10 minutes'))
        and enviar_en <= now()
        and intentos < 5
      order by enviar_en
      limit p_limite
      for update skip locked)
  returning m.*;
$$;

revoke all on function public.tasking_agregar_texto(uuid, text) from public, anon, authenticated;
revoke all on function public.tasking_tomar_mensajes(text, int) from public, anon, authenticated;
grant execute on function public.tasking_agregar_texto(uuid, text) to service_role;
grant execute on function public.tasking_tomar_mensajes(text, int) to service_role;

-- Audio de las reuniones (respaldo para transcribir si fallan los subtítulos en vivo).
insert into storage.buckets (id, name, public)
values ('tasking-audio', 'tasking-audio', false)
on conflict (id) do nothing;

-- «SU SUGERENCIA YA ESTÁ LISTA» POR WHATSAPP. Cuando el admin marca una
-- sugerencia «Hecha» (desde /observaciones o el script del vigilante del buzón),
-- se encola un WhatsApp para quien la dejó. Va en un trigger para que ningún
-- camino se lo salte. El número sale de Tasking → Equipo (persona enlazada a su
-- cuenta del CRM) y, si no está ahí, del celular de su perfil. Sin número no se
-- encola nada: el correo y la campana ya salen por su lado.
create or replace function public.tasking_avisar_sugerencia_hecha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona public.tasking_personas;
  v_perfil public.perfiles;
  v_numero text;
  v_nombre text;
  v_respuesta text;
begin
  if not (new.estado = 'hecha' and old.estado is distinct from 'hecha') then
    return new;
  end if;

  select * into v_persona from public.tasking_personas where perfil_id = new.autor_id and activo limit 1;
  select * into v_perfil from public.perfiles where id = new.autor_id;

  v_numero := regexp_replace(coalesce(nullif(v_persona.whatsapp, ''), v_perfil.celular, ''), '\D', '', 'g');
  if length(v_numero) = 9 and left(v_numero, 1) = '9' then
    v_numero := '51' || v_numero;
  end if;
  if length(v_numero) < 11 then
    return new;
  end if;

  v_nombre := split_part(split_part(coalesce(nullif(v_persona.nombre, ''), v_perfil.nombre, ''), ' (', 1), ' ', 1);
  v_respuesta := left(btrim(coalesce(new.respuesta, '')), 600);

  insert into public.tasking_mensajes (canal, tipo, persona_id, sugerencia_id, destino, cuerpo)
  values (
    'whatsapp',
    'sugerencia',
    v_persona.id,
    new.id,
    v_numero,
    '✅ *Tu sugerencia ya está lista*' || E'\n\n'
      || 'Hola' || case when v_nombre <> '' then ' ' || v_nombre else '' end
      || ', gracias por tu sugerencia y por sumar a construir algo nuevo.' || E'\n\n'
      || '💡 *' || left(new.titulo, 160) || '*'
      || case when v_respuesta <> '' then E'\n' || v_respuesta else '' end || E'\n\n'
      || 'Revísala aquí:' || E'\n' || 'https://crm.efameinsa.com/sugerencias?ver=' || new.id || E'\n\n'
      || '¿Quedó como esperabas? Si falta algo, deja una nueva sugerencia con el botón 💡. Quedamos atentos.'
  );
  return new;
end;
$$;

drop trigger if exists tasking_avisar_sugerencia_hecha on public.sugerencias;
create trigger tasking_avisar_sugerencia_hecha
  after update of estado on public.sugerencias
  for each row execute function public.tasking_avisar_sugerencia_hecha();

notify pgrst, 'reload schema';
