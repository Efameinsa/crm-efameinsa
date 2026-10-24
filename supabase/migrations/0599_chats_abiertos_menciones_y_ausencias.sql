-- 0599 · Los chats abiertos en el menú, «@» a un participante y quién no entra al CRM
--
-- Santos, 23-10-2026 (15:30): «abrí un chat pero nadie me contesta, ¿a nadie
-- le aparece en ningún lado?». Brenda escribió en el chat del pedido de
-- SONESTA y el aviso les llegó solo a Rubí y a Jhon, que no habían entrado al
-- CRM ese día. El chat vivía dentro del pedido, en la campana y en el push:
-- quien no recibía el aviso no se enteraba de que existía. Pidió: «debería
-- quedarse en su sidebar como chats abiertos… y debe estar el visto de las
-- personas que lo vieron con nombre… y señalar a un participante con un arroba».
--
--   · chat_participantes: quiénes están en cada canal, guardado (hasta hoy se
--     calculaba al vuelo en el servidor —involucrados()— y no había cómo listar
--     «mis chats»). `chat_sincronizar_participantes` lo rehace con la misma
--     regla: quien lleva el caso, quien movió un paso del caso o del pedido,
--     quien apuró, quien escribió, el comercial de la venta y los agregados.
--   · chat_mensajes.menciones: a quiénes se señaló con «@». Un mencionado que
--     no estaba entra al canal (como «Agregar a…») para poder leer y contestar.
--   · mis_chats(): los canales con conversación donde está quien mira, con el
--     último mensaje y sus no leídos, para el menú y la pantalla /chats.
--   · ultimo_acceso_de(): cuándo entró por última vez cada persona, para decir
--     en el chat «Jhon no entra al CRM desde el 21-10» y que quien escribe
--     sepa que hoy toca llamarlo.

alter table chat_mensajes add column if not exists menciones uuid[] not null default '{}';

create table if not exists chat_participantes (
  tipo       text not null check (tipo in ('caso', 'pedido')),
  objeto_id  uuid not null,
  user_id    uuid not null references perfiles (id) on delete cascade,
  es_prueba  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tipo, objeto_id, user_id)
);
create index if not exists ix_chat_participantes_user on chat_participantes (user_id);

alter table chat_participantes enable row level security;
revoke all on public.chat_participantes from anon;
grant select on public.chat_participantes to authenticated;
grant all on public.chat_participantes to service_role;
drop policy if exists chat_participantes_select on chat_participantes;
create policy chat_participantes_select on chat_participantes for select to authenticated
  using (user_id = auth.uid() or chat_puede_ver(tipo, objeto_id));

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.chat_participantes';
    execute 'create trigger zz_sync after insert or update or delete on public.chat_participantes for each row execute function sync.capturar(''tipo'', ''objeto_id'', ''user_id'')';
  end if;
end $$;

-- QUIÉNES ESTÁN EN EL CANAL, guardado. Misma regla que tenía el servidor:
-- solo personas activas del mismo mundo (real / práctica) y sin cuentas espejo.
create or replace function chat_sincronizar_participantes(p_tipo text, p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prueba boolean;
  v_servicio uuid;
  v_ids uuid[] := '{}';
  v_cols text;
  v_del_pedido uuid[];
  v_n int;
begin
  if p_tipo = 'caso' then
    select es_prueba, servicio_id into v_prueba, v_servicio from atenciones where id = p_id;
    if not found then return 0; end if;
    select v_ids || array_remove(array[asignado_a, tomada_por, recibido_por], null) into v_ids from atenciones where id = p_id;
    select v_ids || coalesce(array_agg(quien), '{}') into v_ids from (select quien from registro_acciones where tabla = 'atenciones' and fila_id = p_id and quien is not null limit 300) r;
  else
    v_servicio := p_id;
    select es_prueba into v_prueba from servicios_postventa where id = p_id;
    if not found then return 0; end if;
  end if;
  v_prueba := coalesce(v_prueba, false);

  if v_servicio is not null then
    -- Todas las columnas «_por» del pedido (quien movió cada paso), más el responsable.
    select string_agg(format('%I', column_name), ', ') into v_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = 'servicios_postventa' and column_name like '%\_por' and data_type = 'uuid';
    execute format('select array_remove(array[%s, responsable_id], null) from servicios_postventa where id = $1', v_cols) into v_del_pedido using v_servicio;
    v_ids := v_ids || coalesce(v_del_pedido, '{}');
    select v_ids || coalesce(array_agg(quien), '{}') into v_ids from (select quien from registro_acciones where tabla = 'servicios_postventa' and fila_id = v_servicio and quien is not null limit 300) r;
    if p_tipo = 'pedido' then
      select v_ids || array_remove(array[i.creado_por], null) into v_ids
        from servicios_postventa s left join informes_cierre i on i.id = s.informe_cierre_id where s.id = v_servicio;
    end if;
  end if;

  select v_ids || coalesce(array_agg(autor_id), '{}') into v_ids from (select distinct autor_id from chat_mensajes where coalesce(atencion_id, servicio_id) = p_id and tipo = p_tipo) r;
  select v_ids || coalesce(array_agg(u), '{}') into v_ids from (select distinct unnest(menciones) as u from chat_mensajes where coalesce(atencion_id, servicio_id) = p_id and tipo = p_tipo) r;
  select v_ids || coalesce(array_agg(enviado_por), '{}') into v_ids from (select distinct enviado_por from apuros_del_mapa where coalesce(atencion_id, servicio_id) = p_id) r;
  select v_ids || coalesce(array_agg(user_id), '{}') into v_ids from chat_miembros where tipo = p_tipo and objeto_id = p_id;

  insert into chat_participantes (tipo, objeto_id, user_id, es_prueba)
  select p_tipo, p_id, p.id, v_prueba
    from perfiles p
   where p.id = any (v_ids) and p.activo and coalesce(p.es_prueba, false) = v_prueba and p.espejo_de is null
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function chat_sincronizar_participantes(text, uuid) from public, anon;
grant execute on function chat_sincronizar_participantes(text, uuid) to service_role;

-- ENVIAR, ahora con «@»: los mencionados que no estaban entran al canal.
drop function if exists enviar_mensaje_chat(text, uuid, text, text, text);
create or replace function enviar_mensaje_chat(p_tipo text, p_id uuid, p_texto text, p_para text default null, p_clase text default 'mensaje', p_menciones uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerrado timestamptz;
  v_id uuid;
  v_texto text := trim(coalesce(p_texto, ''));
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
  v_menciones uuid[];
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

  -- Solo se señala a personas activas del mismo mundo; quien escribe no se señala a sí mismo.
  select coalesce(array_agg(distinct p.id), '{}') into v_menciones
    from perfiles p
   where p.id = any (coalesce(p_menciones, '{}')) and p.id <> auth.uid() and p.activo and coalesce(p.es_prueba, false) = v_prueba and p.espejo_de is null;

  insert into chat_mensajes (tipo, atencion_id, servicio_id, autor_id, texto, para_area, clase, es_prueba, menciones)
  values (p_tipo, case when p_tipo = 'caso' then p_id end, case when p_tipo = 'pedido' then p_id end,
          auth.uid(), v_texto, p_para, p_clase, v_prueba, v_menciones)
  returning id into v_id;

  -- El mencionado que no estaba entra al canal, como si lo hubieran agregado.
  insert into chat_miembros (tipo, objeto_id, user_id, agregado_por, es_prueba)
  select p_tipo, p_id, u, auth.uid(), v_prueba
    from unnest(v_menciones) u
   where not exists (select 1 from chat_participantes cp where cp.tipo = p_tipo and cp.objeto_id = p_id and cp.user_id = u)
  on conflict (tipo, objeto_id, user_id) do nothing;

  -- Quien escribe ya leyó hasta aquí.
  insert into chat_lecturas (user_id, tipo, objeto_id, leido_hasta) values (auth.uid(), p_tipo, p_id, now())
  on conflict (user_id, tipo, objeto_id) do update set leido_hasta = excluded.leido_hasta;

  perform chat_sincronizar_participantes(p_tipo, p_id);
  return jsonb_build_object('id', v_id, 'menciones', v_menciones);
end;
$$;
revoke all on function enviar_mensaje_chat(text, uuid, text, text, text, uuid[]) from public, anon;
grant execute on function enviar_mensaje_chat(text, uuid, text, text, text, uuid[]) to authenticated;

-- MIS CHATS: los canales con conversación donde está quien mira (participante,
-- agregado, autor o lector), con el último mensaje y cuántos no leyó.
create or replace function mis_chats()
returns table (
  tipo text, objeto_id uuid, codigo text, cliente text, cerrado_at timestamptz,
  ultimo_texto text, ultimo_autor uuid, ultimo_clase text, ultimo_at timestamptz,
  no_leidos int, participantes int
)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select auth.uid() as id, coalesce(es_cuenta_prueba(), false) as prueba),
  canales as (
    select p.tipo, p.objeto_id from chat_participantes p, yo where p.user_id = yo.id and p.es_prueba = yo.prueba
    union select m.tipo, m.objeto_id from chat_miembros m, yo where m.user_id = yo.id and m.es_prueba = yo.prueba
    union select x.tipo, coalesce(x.atencion_id, x.servicio_id) from chat_mensajes x, yo where x.autor_id = yo.id and x.es_prueba = yo.prueba
    union select l.tipo, l.objeto_id from chat_lecturas l, yo where l.user_id = yo.id
  ),
  ult as (
    select c.tipo, c.objeto_id, m.texto, m.autor_id, m.clase, m.created_at,
      (select count(*) from chat_mensajes x
        where x.tipo = c.tipo and coalesce(x.atencion_id, x.servicio_id) = c.objeto_id and x.autor_id <> yo.id
          and x.created_at > coalesce((select l.leido_hasta from chat_lecturas l where l.user_id = yo.id and l.tipo = c.tipo and l.objeto_id = c.objeto_id), '-infinity'::timestamptz)) as no_leidos
    from canales c, yo
    left join lateral (
      select x.texto, x.autor_id, x.clase, x.created_at from chat_mensajes x
       where x.tipo = c.tipo and coalesce(x.atencion_id, x.servicio_id) = c.objeto_id
       order by x.created_at desc limit 1
    ) m on true
  )
  select u.tipo, u.objeto_id,
    case when u.tipo = 'caso' then a.codigo else s.numero_pedido_erp end,
    case when u.tipo = 'caso' then coalesce(nullif(trim(a.cliente_texto), ''), cu.razon_social, 'Cliente') else coalesce(nullif(trim(s.cliente_texto), ''), 'Cliente') end,
    case when u.tipo = 'caso' then a.cerrado_at else coalesce(s.cerrado_at, case when s.completado then now() end) end,
    u.texto, u.autor_id, u.clase, u.created_at, u.no_leidos::int,
    (select count(*) from chat_participantes p where p.tipo = u.tipo and p.objeto_id = u.objeto_id)::int
  from ult u
  left join atenciones a on u.tipo = 'caso' and a.id = u.objeto_id
  left join cuentas cu on cu.id = a.cuenta_id
  left join servicios_postventa s on u.tipo = 'pedido' and s.id = u.objeto_id
  where u.created_at is not null
  order by u.created_at desc
  limit 200;
$$;
revoke all on function mis_chats() from public, anon;
grant execute on function mis_chats() to authenticated;

-- CUÁNDO ENTRÓ POR ÚLTIMA VEZ CADA UNO (solo el servidor lo pide, para el chat).
create or replace function ultimo_acceso_de(p_ids uuid[])
returns table (user_id uuid, ultimo timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, max(a.created_at) from accesos a where a.user_id = any (p_ids) group by a.user_id;
$$;
revoke all on function ultimo_acceso_de(uuid[]) from public, anon, authenticated;
grant execute on function ultimo_acceso_de(uuid[]) to service_role;

-- Los canales que ya existen reciben sus participantes.
do $$
declare r record;
begin
  for r in select distinct tipo, coalesce(atencion_id, servicio_id) as id from chat_mensajes loop
    perform chat_sincronizar_participantes(r.tipo, r.id);
  end loop;
end $$;
