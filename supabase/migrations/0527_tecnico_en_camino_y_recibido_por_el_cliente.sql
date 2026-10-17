-- ═══════════════════════════════════════════════════════════════════════════
-- 0527 · EL TÉCNICO VA EN CAMINO, EL TÉCNICO LLEGÓ, Y «YA LO RECIBÍ»
-- ═══════════════════════════════════════════════════════════════════════════
-- Santos, 17-10 (contrato «Experiencia del cliente»): el cliente ve en Mi
-- cuenta de efameinsa.com todo su historial del CRM, recibe un aviso en cada
-- cambio y confirma él mismo que recibió su equipo.
--
-- 1. El pedido (servicios_postventa) gana:
--    · recibido_cliente_at / _nota / _fotos: lo marca el CLIENTE desde la web
--      (POST /api/portal/recibido, con la llave de servicio). No hay `_por`:
--      no es nadie de la casa.
--    · tecnico_salio_at / tecnico_llego_at (+ `_por`): «El técnico salió hacia
--      el cliente» y «El técnico llegó al local», que marcan postventa, el
--      almacén o gerencia. Es lo que dispara el WhatsApp «El técnico va en
--      camino» del motor de avisos.
--    · recibe_telefono_normalizado: para reconocer al que recibe el equipo
--      aunque no sea un contacto de la ficha (el portal también lo busca así).
-- 2. El caso técnico (atenciones) gana los mismos dos pasos del técnico.
-- 3. Quién lo hizo se sella con la sesión, como en la 0473: un trigger aparte
--    (`sellar_tecnico_en_camino`) para no reescribir el de la 0473. Al
--    deshacer, el nombre se borra con la hora.
-- 4. Dos funciones para marcar y deshacer con las reglas de quién puede, que
--    sirven igual al almacén (que no edita el pedido directo). Cada clic queda
--    en el registro de acciones (0513), así que admin también lo puede
--    deshacer desde ahí.
--
-- NO SE APLICA SOLA: va con el resto de la rama feat/portal-cliente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.servicios_postventa
  add column if not exists recibido_cliente_at timestamptz,
  add column if not exists recibido_cliente_nota text,
  add column if not exists recibido_cliente_fotos jsonb not null default '[]'::jsonb,
  add column if not exists tecnico_salio_at timestamptz,
  add column if not exists tecnico_salio_por uuid references public.perfiles(id),
  add column if not exists tecnico_llego_at timestamptz,
  add column if not exists tecnico_llego_por uuid references public.perfiles(id);

alter table public.servicios_postventa
  add column if not exists recibe_telefono_normalizado text
  generated always as (public.normalizar_telefono(recibe_telefono)) stored;
create index if not exists ix_servicios_pv_recibe_tel
  on public.servicios_postventa (recibe_telefono_normalizado)
  where recibe_telefono_normalizado is not null;

comment on column public.servicios_postventa.recibido_cliente_at is
  'El cliente confirmó en Mi cuenta (efameinsa.com) que recibió el pedido (0527).';
comment on column public.servicios_postventa.recibido_cliente_fotos is
  'Fotos que subió el cliente al confirmar la recepción: [{path, nombre, tipo, etiqueta:"recibido"}] en el bucket adjuntos (0527).';
comment on column public.servicios_postventa.tecnico_salio_at is
  '«El técnico salió hacia el cliente» (0527): dispara el aviso «El técnico va en camino».';
comment on column public.servicios_postventa.tecnico_llego_at is
  '«El técnico llegó al local» (0527).';

alter table public.atenciones
  add column if not exists tecnico_salio_at timestamptz,
  add column if not exists tecnico_salio_por uuid references public.perfiles(id),
  add column if not exists tecnico_llego_at timestamptz,
  add column if not exists tecnico_llego_por uuid references public.perfiles(id);

-- ── Quién lo hizo, sellado con la sesión (mismo criterio que la 0473) ──────
create or replace function public.sellar_tecnico_en_camino()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if new.tecnico_salio_at is null then
    new.tecnico_salio_por := null;
  elsif v_uid is not null and old.tecnico_salio_at is distinct from new.tecnico_salio_at then
    new.tecnico_salio_por := v_uid;
  end if;
  if new.tecnico_llego_at is null then
    new.tecnico_llego_por := null;
  elsif v_uid is not null and old.tecnico_llego_at is distinct from new.tecnico_llego_at then
    new.tecnico_llego_por := v_uid;
  end if;
  return new;
end $$;

drop trigger if exists sellar_tecnico_en_camino on public.servicios_postventa;
create trigger sellar_tecnico_en_camino
  before update of tecnico_salio_at, tecnico_llego_at on public.servicios_postventa
  for each row execute function public.sellar_tecnico_en_camino();

drop trigger if exists sellar_tecnico_en_camino on public.atenciones;
create trigger sellar_tecnico_en_camino
  before update of tecnico_salio_at, tecnico_llego_at on public.atenciones
  for each row execute function public.sellar_tecnico_en_camino();

-- ── Quién puede marcar los pasos del técnico ───────────────────────────────
-- Postventa (no la cuenta que solo vende preventivo), el almacén, operaciones,
-- gerencia y admin.
create or replace function public.puede_marcar_tecnico()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
     where p.id = auth.uid()
       and p.activo
       and p.espejo_de is null
       and (
         (coalesce(p.es_postventa, false) and not coalesce(p.solo_preventivo, false))
         or coalesce(p.es_almacen, false)
         or coalesce(p.es_operaciones, false)
         or p.rol in ('gerencia', 'admin', 'operaciones')
       )
  )
$$;

-- p_paso: 'salio' | 'llego'. p_deshacer: true borra la hora (y el nombre).
create or replace function public.marcar_tecnico_pedido(p_servicio uuid, p_paso text, p_deshacer boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.servicios_postventa;
  v_ahora timestamptz := now();
begin
  if not puede_marcar_tecnico() then
    raise exception 'Esto lo marcan postventa, el almacén o gerencia.';
  end if;
  if p_paso not in ('salio', 'llego') then
    raise exception 'Paso desconocido: %', p_paso;
  end if;
  select * into v from servicios_postventa where id = p_servicio for update;
  if not found then raise exception 'No se encontró el pedido.'; end if;

  if p_deshacer then
    if p_paso = 'salio' and v.tecnico_llego_at is not null then
      raise exception 'Primero deshaga «El técnico llegó al local».';
    end if;
    if p_paso = 'salio' then
      update servicios_postventa set tecnico_salio_at = null where id = p_servicio;
    else
      update servicios_postventa set tecnico_llego_at = null where id = p_servicio;
    end if;
    return null;
  end if;

  if v.cerrado_at is not null or v.completado then
    raise exception 'El pedido ya está cerrado.';
  end if;
  if p_paso = 'salio' then
    if v.tecnico_salio_at is not null then return v.tecnico_salio_at; end if;
    update servicios_postventa set tecnico_salio_at = v_ahora, tecnico_salio_por = auth.uid() where id = p_servicio;
  else
    if v.tecnico_llego_at is not null then return v.tecnico_llego_at; end if;
    update servicios_postventa set tecnico_llego_at = v_ahora, tecnico_llego_por = auth.uid() where id = p_servicio;
  end if;
  return v_ahora;
end $$;

create or replace function public.marcar_tecnico_caso(p_atencion uuid, p_paso text, p_deshacer boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.atenciones;
  v_ahora timestamptz := now();
begin
  if not puede_marcar_tecnico() then
    raise exception 'Esto lo marcan postventa, el almacén o gerencia.';
  end if;
  if p_paso not in ('salio', 'llego') then
    raise exception 'Paso desconocido: %', p_paso;
  end if;
  select * into v from atenciones where id = p_atencion for update;
  if not found then raise exception 'No se encontró el caso.'; end if;

  if p_deshacer then
    if p_paso = 'salio' and v.tecnico_llego_at is not null then
      raise exception 'Primero deshaga «El técnico llegó al local».';
    end if;
    if p_paso = 'salio' then
      update atenciones set tecnico_salio_at = null where id = p_atencion;
    else
      update atenciones set tecnico_llego_at = null where id = p_atencion;
    end if;
    return null;
  end if;

  if v.cerrado_at is not null then
    raise exception 'El caso ya está cerrado.';
  end if;
  if p_paso = 'salio' then
    if v.tecnico_salio_at is not null then return v.tecnico_salio_at; end if;
    update atenciones set tecnico_salio_at = v_ahora, tecnico_salio_por = auth.uid() where id = p_atencion;
  else
    if v.tecnico_llego_at is not null then return v.tecnico_llego_at; end if;
    update atenciones set tecnico_llego_at = v_ahora, tecnico_llego_por = auth.uid() where id = p_atencion;
  end if;
  return v_ahora;
end $$;

revoke all on function public.marcar_tecnico_pedido(uuid, text, boolean) from public, anon;
revoke all on function public.marcar_tecnico_caso(uuid, text, boolean) from public, anon;
revoke all on function public.puede_marcar_tecnico() from public, anon;
grant execute on function public.marcar_tecnico_pedido(uuid, text, boolean) to authenticated;
grant execute on function public.marcar_tecnico_caso(uuid, text, boolean) to authenticated;
grant execute on function public.puede_marcar_tecnico() to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0525_tecnico_en_camino_y_recibido_por_el_cliente.sql')
on conflict do nothing;
