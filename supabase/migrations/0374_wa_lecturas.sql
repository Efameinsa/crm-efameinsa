-- 0374 · Chats de WhatsApp «no leídos», por persona
--
-- 02-10-2026, comercial: «no hay filtro de no leídos y tengo que estar
-- buscando en cada chat». La bandeja sabía en qué estado está cada chat
-- (sin atender / en gestión / cerrada) pero no si UNO ya lo abrió desde el
-- último mensaje del cliente, que es lo que muestra WhatsApp.
--
-- Una fila por chat y persona con la última vez que lo abrió. El chat está
-- no leído para esa persona si el cliente escribió después (o si nunca lo
-- abrió). Es por persona a propósito: que Central abra un chat no lo da por
-- leído para el comercial que lo atiende.

create table if not exists public.wa_lecturas (
  conversacion_id uuid not null references public.wa_conversaciones(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  leido_at timestamptz not null default now(),
  primary key (conversacion_id, user_id)
);

create index if not exists ix_wa_lecturas_usuario on public.wa_lecturas (user_id);

alter table public.wa_lecturas enable row level security;

-- Cada uno ve y escribe solo sus propias lecturas.
drop policy if exists wa_lecturas_propias on public.wa_lecturas;
create policy wa_lecturas_propias on public.wa_lecturas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.wa_lecturas to authenticated;

-- Abrir el chat lo marca leído. Lo llama la conversación abierta (al entrar y
-- cuando llega un mensaje con la pestaña a la vista), nunca la lista: un
-- enlace precargado no puede dar por leído un chat que nadie abrió.
create or replace function public.marcar_chat_leido(p_conversacion uuid)
returns void
language sql
security invoker
set search_path to 'public'
as $$
  insert into wa_lecturas (conversacion_id, user_id, leido_at)
  values (p_conversacion, auth.uid(), now())
  on conflict (conversacion_id, user_id) do update set leido_at = excluded.leido_at;
$$;

grant execute on function public.marcar_chat_leido(uuid) to authenticated;

-- Punto de partida: lo que una PERSONA ya respondió cuenta como leído para
-- quien lo atiende y para Central, gerencia y admin (que ven todos los
-- chats). El acuse automático no cuenta (`enviado_por` vacío): un chat que
-- solo respondió el número no lo leyó nadie. Lo que el cliente escribió
-- último sin respuesta queda no leído: es lo pendiente.
insert into public.wa_lecturas (conversacion_id, user_id, leido_at)
select r.conversacion_id, p.id, r.respondido_at
from (
  select m.conversacion_id, max(m.timestamp_meta) as respondido_at
  from public.wa_mensajes m
  where m.direccion = 'saliente' and m.enviado_por is not null
  group by m.conversacion_id
) r
join public.wa_conversaciones c on c.id = r.conversacion_id
join public.perfiles p
  on p.activo and (p.id = c.asignado_a or p.rol in ('central', 'gerencia', 'admin'))
where c.ultimo_mensaje_cliente_at is null or r.respondido_at >= c.ultimo_mensaje_cliente_at
on conflict do nothing;
