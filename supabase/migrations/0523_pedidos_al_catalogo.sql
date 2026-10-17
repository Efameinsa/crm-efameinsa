-- ═══════════════════════════════════════════════════════════════════════════
-- 0523 · PEDIDOS AL CATÁLOGO: LO QUE SE LE PIDE A LESLY, A LESLY
-- ═══════════════════════════════════════════════════════════════════════════
-- Santos, 17-10: «crea un buzón para pedir productos o que Lesly actualice y
-- que le llegue a Lesly, que eso no pidan en el buzón porque no tiene que ver
-- con el CRM sino con operaciones».
--
-- En el buzón del CRM (06–16/10) hubo 7 pedidos de este tipo: un producto
-- que no está, un precio, una ficha técnica o una foto. Llegaban a quien
-- arregla el sistema, que se los reenviaba a Lesly; ella ya puede hacerlo
-- todo desde «El catálogo» (10-09). Ahora el pedido le llega directo.
--
-- Los rubros NO pasan por acá: cualquier usuario los agrega solo desde
-- «Cambiar rubro» (0163).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pedidos_catalogo (
  id             uuid primary key default gen_random_uuid(),
  autor_id       uuid not null references public.perfiles(id),
  tipo           text not null check (tipo in ('producto_nuevo', 'corregir_producto', 'precio', 'stock', 'otro')),
  -- El producto como lo escribió quien pide (código o nombre). Texto libre a
  -- propósito: muchas veces lo que se pide es justamente lo que no existe.
  producto       text,
  titulo         text not null check (length(btrim(titulo)) between 3 and 140),
  detalle        text not null default '',
  adjuntos       jsonb not null default '[]'::jsonb,
  -- El cliente para el que se necesita, si lo hay: Lesly ve si es urgente.
  para_cliente   text,
  estado         text not null default 'nuevo' check (estado in ('nuevo', 'en_proceso', 'hecho', 'no_procede')),
  respuesta      text,
  respondida_por uuid references public.perfiles(id),
  respondida_at  timestamptz,
  -- Si llegó primero al buzón del CRM y se lo pasaron a Lesly.
  sugerencia_id  uuid references public.sugerencias(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists pedidos_catalogo_abiertos_idx on public.pedidos_catalogo (created_at desc) where estado in ('nuevo', 'en_proceso');
create index if not exists pedidos_catalogo_autor_idx on public.pedidos_catalogo (autor_id, created_at desc);

-- Quién atiende: operaciones (Lesly), gerencia y administración.
create or replace function public.atiende_catalogo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
     where id = auth.uid() and activo
       and (rol in ('operaciones', 'gerencia', 'admin') or es_operaciones)
  );
$$;

alter table public.pedidos_catalogo enable row level security;

drop policy if exists pedidos_catalogo_lectura on public.pedidos_catalogo;
create policy pedidos_catalogo_lectura on public.pedidos_catalogo for select to authenticated
  using (autor_id = auth.uid() or public.atiende_catalogo());

drop policy if exists pedidos_catalogo_alta on public.pedidos_catalogo;
create policy pedidos_catalogo_alta on public.pedidos_catalogo for insert to authenticated
  with check (autor_id = auth.uid() and estado = 'nuevo' and respuesta is null and tiene_perfil_activo());

revoke all on public.pedidos_catalogo from anon;
grant select, insert on public.pedidos_catalogo to authenticated;
grant all on public.pedidos_catalogo to service_role;

-- ── Lesly contesta ───────────────────────────────────────────────────────
create or replace function public.responder_pedido_catalogo(p_pedido uuid, p_estado text, p_respuesta text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not atiende_catalogo() then
    raise exception 'Los pedidos al catálogo los contesta operaciones (Lesly)';
  end if;
  if p_estado not in ('en_proceso', 'hecho', 'no_procede') then raise exception 'Estado no válido'; end if;
  if p_estado in ('hecho', 'no_procede') and length(btrim(coalesce(p_respuesta, ''))) < 3 then
    raise exception 'Escriba la respuesta: le llega a quien lo pidió';
  end if;

  update pedidos_catalogo
     set estado = p_estado,
         respuesta = coalesce(nullif(btrim(coalesce(p_respuesta, '')), ''), respuesta),
         respondida_por = auth.uid(),
         respondida_at = now(),
         updated_at = now()
   where id = p_pedido
  returning autor_id into v_autor;
  if v_autor is null then raise exception 'Ese pedido no existe'; end if;
  return v_autor;
end $$;

revoke all on function public.responder_pedido_catalogo(uuid, text, text) from public;
grant execute on function public.responder_pedido_catalogo(uuid, text, text) to authenticated;
revoke all on function public.atiende_catalogo() from public;
grant execute on function public.atiende_catalogo() to authenticated;
