-- 0592 · El chat de cada caso (y de cada pedido) entre las áreas involucradas
--
-- Santos, 23-10-2026: «hazlo para que cada caso tenga su propio canal de chat
-- con los involucrados hasta que se cierre el caso». Nace junto al mapa del
-- recorrido y su «Apurar» (0591): el apuro dice QUÉ paso falta; el chat dice
-- QUÉ se necesita y deja la conversación pegada al caso, no en WhatsApp.
--
-- Reglas:
--   · Un canal por caso (atenciones) y por pedido (servicios_postventa).
--   · Lo leen y escriben las áreas del recorrido (postventa, operaciones,
--     almacén, Central, Finanzas, Facturación, gerencia). El comercial puro,
--     solo en los pedidos de sus ventas (como el mapa).
--   · Se escribe hasta que el caso / pedido se cierra; después queda como
--     constancia, de solo lectura. Los mensajes no se editan ni se borran.
--   · Un mensaje puede ir «para» un área (le llega el aviso) o para todos.
--   · `chat_lecturas` guarda hasta dónde leyó cada persona (los no leídos).

create table if not exists chat_mensajes (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('caso', 'pedido')),
  atencion_id  uuid references atenciones (id) on delete cascade,
  servicio_id  uuid references servicios_postventa (id) on delete cascade,
  autor_id     uuid not null references perfiles (id),
  texto        text not null check (length(trim(texto)) between 1 and 2000),
  para_area    text check (para_area in ('central', 'almacen', 'finanzas', 'contabilidad', 'postventa', 'comercial')),
  -- 'mensaje' lo escribe una persona; 'apuro' lo deja el «Apurar» del mapa.
  clase        text not null default 'mensaje' check (clase in ('mensaje', 'apuro')),
  es_prueba    boolean not null default false,
  created_at   timestamptz not null default now(),
  check ((tipo = 'caso' and atencion_id is not null and servicio_id is null) or (tipo = 'pedido' and servicio_id is not null and atencion_id is null))
);
create index if not exists ix_chat_mensajes_atencion on chat_mensajes (atencion_id, created_at) where atencion_id is not null;
create index if not exists ix_chat_mensajes_servicio on chat_mensajes (servicio_id, created_at) where servicio_id is not null;

create table if not exists chat_lecturas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references perfiles (id) on delete cascade,
  tipo        text not null check (tipo in ('caso', 'pedido')),
  objeto_id   uuid not null,
  leido_hasta timestamptz not null default now(),
  unique (user_id, tipo, objeto_id)
);

alter table chat_mensajes enable row level security;
alter table chat_lecturas enable row level security;
revoke all on public.chat_mensajes, public.chat_lecturas from anon;
grant select on public.chat_mensajes to authenticated;
grant select on public.chat_lecturas to authenticated;
grant all on public.chat_mensajes, public.chat_lecturas to service_role;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.chat_mensajes';
    execute 'create trigger zz_sync after insert or update or delete on public.chat_mensajes for each row execute function sync.capturar(''id'')';
    execute 'drop trigger if exists zz_sync on public.chat_lecturas';
    execute 'create trigger zz_sync after insert or update or delete on public.chat_lecturas for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- ¿Quien mira es comercial «puro» (no postventa, almacén ni soporte)?
create or replace function chat_solo_comercial() returns boolean
language sql stable security definer set search_path = public as $$
  select rol_actual() = 'comercial'::rol_usuario
     and not coalesce(es_postventa(), false) and not coalesce(es_almacen(), false) and not coalesce(es_soporte(), false)
$$;

-- ¿Puede quien mira entrar a ese canal? Misma regla que el mapa.
create or replace function chat_puede_ver(p_tipo text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
begin
  if auth.uid() is null then return false; end if;
  if p_tipo = 'caso' then
    if chat_solo_comercial() then return false; end if;
    return exists (select 1 from atenciones where id = p_id and coalesce(es_prueba, false) = v_prueba);
  elsif p_tipo = 'pedido' then
    return exists (
      select 1 from servicios_postventa s left join informes_cierre i on i.id = s.informe_cierre_id
       where s.id = p_id and s.es_prueba = v_prueba
         and (not chat_solo_comercial() or i.creado_por = auth.uid())
    );
  end if;
  return false;
end;
$$;

drop policy if exists chat_mensajes_select on chat_mensajes;
create policy chat_mensajes_select on chat_mensajes for select to authenticated
  using (es_prueba = coalesce(es_cuenta_prueba(), false) and chat_puede_ver(tipo, coalesce(atencion_id, servicio_id)));

drop policy if exists chat_lecturas_select on chat_lecturas;
create policy chat_lecturas_select on chat_lecturas for select to authenticated using (user_id = auth.uid());

-- Escribir: solo por aquí, mientras el caso / pedido siga abierto.
create or replace function enviar_mensaje_chat(p_tipo text, p_id uuid, p_texto text, p_para text default null, p_clase text default 'mensaje')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerrado timestamptz;
  v_id uuid;
  v_texto text := trim(coalesce(p_texto, ''));
begin
  if not chat_puede_ver(p_tipo, p_id) then raise exception 'No tiene acceso a este chat'; end if;
  if v_texto = '' then raise exception 'Escriba el mensaje'; end if;
  if length(v_texto) > 2000 then raise exception 'El mensaje es muy largo (máximo 2000 caracteres)'; end if;
  if p_para is not null and p_para not in ('central', 'almacen', 'finanzas', 'contabilidad', 'postventa', 'comercial') then
    raise exception 'Área no válida';
  end if;
  if p_clase not in ('mensaje', 'apuro') then raise exception 'Clase no válida'; end if;

  if p_tipo = 'caso' then
    select cerrado_at into v_cerrado from atenciones where id = p_id;
  else
    select coalesce(cerrado_at, case when completado then now() end) into v_cerrado from servicios_postventa where id = p_id;
  end if;
  if v_cerrado is not null then
    raise exception 'Este % ya se cerró: el chat queda como constancia, de solo lectura', case when p_tipo = 'caso' then 'caso' else 'pedido' end;
  end if;

  insert into chat_mensajes (tipo, atencion_id, servicio_id, autor_id, texto, para_area, clase, es_prueba)
  values (p_tipo, case when p_tipo = 'caso' then p_id end, case when p_tipo = 'pedido' then p_id end,
          auth.uid(), v_texto, p_para, p_clase, coalesce(es_cuenta_prueba(), false))
  returning id into v_id;

  -- Quien escribe ya leyó hasta aquí.
  insert into chat_lecturas (user_id, tipo, objeto_id, leido_hasta) values (auth.uid(), p_tipo, p_id, now())
  on conflict (user_id, tipo, objeto_id) do update set leido_hasta = excluded.leido_hasta;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function marcar_chat_leido(p_tipo text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not chat_puede_ver(p_tipo, p_id) then return; end if;
  insert into chat_lecturas (user_id, tipo, objeto_id, leido_hasta) values (auth.uid(), p_tipo, p_id, now())
  on conflict (user_id, tipo, objeto_id) do update set leido_hasta = excluded.leido_hasta;
end;
$$;

revoke all on function enviar_mensaje_chat(text, uuid, text, text, text), marcar_chat_leido(text, uuid), chat_puede_ver(text, uuid), chat_solo_comercial() from public, anon;
grant execute on function enviar_mensaje_chat(text, uuid, text, text, text), marcar_chat_leido(text, uuid), chat_puede_ver(text, uuid), chat_solo_comercial() to authenticated;

-- Al instante: el canal en vivo del CRM local escucha los mensajes nuevos.
-- Solo donde la campana ya va en vivo (la base local); en la nube el tiempo
-- real se apagó por costo (0309) y el chat se pone al día cada pocos segundos.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notificaciones')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_mensajes') then
    execute 'alter publication supabase_realtime add table public.chat_mensajes';
  end if;
end $$;
