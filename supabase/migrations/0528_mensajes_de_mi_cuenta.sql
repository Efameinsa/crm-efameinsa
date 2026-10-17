-- ═══════════════════════════════════════════════════════════════════════════
-- 0528 · MENSAJES DE MI CUENTA (el chat del cliente en efameinsa.com)
-- ═══════════════════════════════════════════════════════════════════════════
-- Santos, 17-10: el cliente tiene un chat en su perfil de la web. Lo que
-- escribe llega acá (POST /api/portal/mensaje, con la llave de servicio) y el
-- personal lo lee y responde desde la ficha del cliente y desde el pedido o
-- el caso de postventa.
--
-- Quién lo ve: el mismo que ya ve la ficha. La política no repite las reglas
-- de cartera, postventa, almacén o Finanzas: pregunta si la cuenta es visible
-- para quien consulta, y la RLS de `cuentas` decide (si mañana cambia quién
-- ve una ficha, cambia acá solo).
--
-- El cliente NUNCA entra a la base: no tiene usuario de Supabase en el CRM.
-- Sus filas (autor 'cliente') solo las inserta la API con la llave de
-- servicio. El personal solo inserta como 'empresa' y a su nombre, y de lo
-- demás solo puede tocar `leido_at`.
--
-- NO SE APLICA SOLA: va con el resto de la rama feat/portal-cliente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.portal_mensajes (
  id           uuid primary key default gen_random_uuid(),
  cuenta_id    uuid not null references public.cuentas(id) on delete cascade,
  autor        text not null check (autor in ('cliente', 'empresa')),
  autor_id     uuid references public.perfiles(id),
  autor_nombre text not null,
  texto        text not null check (char_length(btrim(texto)) between 1 and 2000),
  servicio_id  uuid references public.servicios_postventa(id) on delete set null,
  atencion_id  uuid references public.atenciones(id) on delete set null,
  created_at   timestamptz not null default now(),
  leido_at     timestamptz,
  constraint portal_mensajes_empresa_con_autor check (autor = 'cliente' or autor_id is not null)
);

create index if not exists ix_portal_mensajes_cuenta on public.portal_mensajes (cuenta_id, created_at desc);
create index if not exists ix_portal_mensajes_servicio on public.portal_mensajes (servicio_id) where servicio_id is not null;
create index if not exists ix_portal_mensajes_atencion on public.portal_mensajes (atencion_id) where atencion_id is not null;
create index if not exists ix_portal_mensajes_sin_leer on public.portal_mensajes (cuenta_id)
  where leido_at is null and autor = 'cliente';

comment on table public.portal_mensajes is
  'Chat de Mi cuenta (efameinsa.com) con el cliente (0528). El cliente escribe vía /api/portal/mensaje; el personal responde desde la ficha.';

alter table public.portal_mensajes enable row level security;

drop policy if exists portal_mensajes_ver on public.portal_mensajes;
create policy portal_mensajes_ver on public.portal_mensajes for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = portal_mensajes.cuenta_id));

drop policy if exists portal_mensajes_responder on public.portal_mensajes;
create policy portal_mensajes_responder on public.portal_mensajes for insert to authenticated
  with check (
    autor = 'empresa'
    and autor_id = (select auth.uid())
    and exists (select 1 from public.cuentas c where c.id = portal_mensajes.cuenta_id)
  );

drop policy if exists portal_mensajes_marcar_leido on public.portal_mensajes;
create policy portal_mensajes_marcar_leido on public.portal_mensajes for update to authenticated
  using (exists (select 1 from public.cuentas c where c.id = portal_mensajes.cuenta_id))
  with check (exists (select 1 from public.cuentas c where c.id = portal_mensajes.cuenta_id));

revoke all on public.portal_mensajes from anon, authenticated;
grant select on public.portal_mensajes to authenticated;
grant insert (cuenta_id, autor, autor_id, autor_nombre, texto, servicio_id, atencion_id) on public.portal_mensajes to authenticated;
grant update (leido_at) on public.portal_mensajes to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0526_mensajes_de_mi_cuenta.sql')
on conflict do nothing;
