-- 0593 · El chat del caso es un canal de coordinación: se agrega gente, no se elige «para»
--
-- Santos, 23-10-2026: «no entiendo por qué pones un “para:” si ahí están
-- todos; es como un pequeño chat de Slack. Lo que podrías poner es un
-- “agregar a” para que agregues a alguien fuera del caso para poder destrabar,
-- como al admin, al gerente o a Central… el canal se cierra cuando se termina
-- todo y el historial queda siempre guardado». Y: «cada mensaje con nombre de
-- usuario, hora, minuto, el visto también de quiénes lo van leyendo».
--
--   · chat_miembros: quienes se agregaron a mano (quién los agregó y cuándo).
--     Un agregado entra al canal aunque por su rol no lo viera (por ejemplo,
--     un comercial en un caso de postventa).
--   · agregar_al_chat: solo un miembro puede agregar, solo mientras el caso /
--     pedido siga abierto; deja la línea «X agregó a Y» (clase 'sistema').
--   · Los «vistos» salen de chat_lecturas (hasta dónde leyó cada uno).

alter table chat_mensajes drop constraint if exists chat_mensajes_clase_check;
alter table chat_mensajes add constraint chat_mensajes_clase_check check (clase in ('mensaje', 'apuro', 'sistema'));

create table if not exists chat_miembros (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('caso', 'pedido')),
  objeto_id    uuid not null,
  user_id      uuid not null references perfiles (id) on delete cascade,
  agregado_por uuid not null references perfiles (id),
  es_prueba    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (tipo, objeto_id, user_id)
);
create index if not exists ix_chat_miembros_objeto on chat_miembros (tipo, objeto_id);

alter table chat_miembros enable row level security;
revoke all on public.chat_miembros from anon;
grant select on public.chat_miembros to authenticated;
grant all on public.chat_miembros to service_role;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.chat_miembros';
    execute 'create trigger zz_sync after insert or update or delete on public.chat_miembros for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- Entra al canal quien por su rol ve el caso / pedido (0592) o quien fue agregado.
create or replace function chat_puede_ver(p_tipo text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from chat_miembros where tipo = p_tipo and objeto_id = p_id and user_id = auth.uid() and es_prueba = v_prueba) then
    return true;
  end if;
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

drop policy if exists chat_miembros_select on chat_miembros;
create policy chat_miembros_select on chat_miembros for select to authenticated
  using (es_prueba = coalesce(es_cuenta_prueba(), false) and chat_puede_ver(tipo, objeto_id));

-- Los vistos: cada miembro ve hasta dónde leyeron los demás de ese canal.
drop policy if exists chat_lecturas_select on chat_lecturas;
create policy chat_lecturas_select on chat_lecturas for select to authenticated
  using (user_id = auth.uid() or chat_puede_ver(tipo, objeto_id));

create or replace function agregar_al_chat(p_tipo text, p_id uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
  v_cerrado timestamptz;
  v_nombre text;
  v_quien text;
  v_nuevo boolean;
begin
  if not chat_puede_ver(p_tipo, p_id) then raise exception 'No tiene acceso a este chat'; end if;
  if p_tipo = 'caso' then
    select cerrado_at into v_cerrado from atenciones where id = p_id;
  else
    select coalesce(cerrado_at, case when completado then now() end) into v_cerrado from servicios_postventa where id = p_id;
  end if;
  if v_cerrado is not null then raise exception 'Este chat ya se cerró: no se puede agregar a nadie'; end if;

  select nombre into v_nombre from perfiles where id = p_user and activo and es_prueba = v_prueba;
  if v_nombre is null then raise exception 'Esa persona no está activa en el CRM'; end if;
  select nombre into v_quien from perfiles where id = auth.uid();

  insert into chat_miembros (tipo, objeto_id, user_id, agregado_por, es_prueba)
  values (p_tipo, p_id, p_user, auth.uid(), v_prueba)
  on conflict (tipo, objeto_id, user_id) do nothing;
  v_nuevo := found;

  if v_nuevo then
    insert into chat_mensajes (tipo, atencion_id, servicio_id, autor_id, texto, clase, es_prueba)
    values (p_tipo, case when p_tipo = 'caso' then p_id end, case when p_tipo = 'pedido' then p_id end,
            auth.uid(), format('%s agregó a %s', coalesce(v_quien, 'Alguien'), v_nombre), 'sistema', v_prueba);
  end if;

  return jsonb_build_object('nombre', v_nombre, 'nuevo', v_nuevo);
end;
$$;

revoke all on function agregar_al_chat(text, uuid, uuid) from public, anon;
grant execute on function agregar_al_chat(text, uuid, uuid) to authenticated;
