-- 0334 · Files (archivadores físicos): pedirlos a Central y el cuaderno de cargos
--
-- Pedido del ing. Carlos (reunión 24-09 12:30, y audio del 04-09): hoy se pide
-- el file de un cliente por correo, Central lo entrega con su cuaderno de
-- cargos y «cero control»: nadie sabe quién lo tiene. «Fecha, hora, quién
-- recibe, quién devuelve, y el reporte: quién lo tiene… una pequeña vista que
-- es solicitar, que pueda jalar clientes: cliente 1, 2, 3, 4».
--
-- Cada fila es el préstamo de UN file. Una solicitud con varios clientes
-- comparte `grupo`. Estados por fechas: pedido → entregado (Central) →
-- recibido (la firma de quien lo pidió) → devuelto (Central lo tacha).

create table if not exists public.prestamos_file (
  id uuid primary key default gen_random_uuid(),
  grupo uuid not null,
  cuenta_id uuid not null references public.cuentas(id),
  solicitado_por uuid not null references public.perfiles(id),
  solicitado_at timestamptz not null default now(),
  nota text,
  entregado_at timestamptz,
  entregado_por uuid references public.perfiles(id),
  recibido_at timestamptz,
  devuelto_at timestamptz,
  devuelto_recibido_por uuid references public.perfiles(id),
  anulado_at timestamptz,
  anulado_por uuid references public.perfiles(id),
  motivo_anulacion text,
  es_prueba boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ix_prestamos_file_cuenta on public.prestamos_file (cuenta_id);
create index if not exists ix_prestamos_file_solicitante on public.prestamos_file (solicitado_por, solicitado_at desc);
create index if not exists ix_prestamos_file_abiertos on public.prestamos_file (solicitado_at) where devuelto_at is null and anulado_at is null;

alter table public.prestamos_file enable row level security;

-- Quién lleva el cuaderno: Central, y quien supervisa (operaciones, gerencia, admin).
create or replace function public.lleva_los_files()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select rol::text in ('central', 'gerencia', 'admin', 'operaciones') or coalesce(es_operaciones, false)
                     from perfiles where id = auth.uid() and activo), false);
$$;

drop policy if exists prestamos_file_lectura on public.prestamos_file;
create policy prestamos_file_lectura on public.prestamos_file
  for select to authenticated
  using (
    ((select auth.uid()) = solicitado_por or (select lleva_los_files()))
    and es_prueba = (select coalesce(es_cuenta_prueba(), false))
  );

-- Pedir uno o varios files.
create or replace function public.files_solicitar(p_cuentas uuid[], p_nota text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo perfiles%rowtype;
  v_grupo uuid := gen_random_uuid();
  v_n integer;
  v_nombres text;
begin
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if v_yo.id is null then raise exception 'Sesión no válida'; end if;
  if coalesce(array_length(p_cuentas, 1), 0) = 0 then raise exception 'Agregue al menos un cliente'; end if;
  if array_length(p_cuentas, 1) > 20 then raise exception 'Máximo 20 files por pedido'; end if;

  insert into prestamos_file (grupo, cuenta_id, solicitado_por, nota, es_prueba)
  select v_grupo, c.id, v_yo.id, nullif(btrim(coalesce(p_nota, '')), ''), coalesce(v_yo.es_prueba, false)
    from cuentas c where c.id = any (p_cuentas) and c.fusionada_en is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ninguno de esos clientes existe'; end if;

  select string_agg(c.razon_social, ' · ' order by c.razon_social) into v_nombres
    from cuentas c where c.id = any (p_cuentas);
  perform crear_notificacion(null, 'central', 'otro',
    format('Pedido de %s file%s · %s', v_n, case when v_n = 1 then '' else 's' end, coalesce(v_yo.codigo_comercial || ' ' , '') || v_yo.nombre),
    left(v_nombres, 300) || coalesce(' — ' || nullif(btrim(coalesce(p_nota, '')), ''), ''),
    '/files');
  return v_n;
end $$;

-- Central lo entrega (sale del archivador).
create or replace function public.files_entregar(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_p prestamos_file%rowtype; v_cliente text;
begin
  if not lleva_los_files() then raise exception 'Los files los entrega Central'; end if;
  select * into v_p from prestamos_file where id = p_id for update;
  if v_p.id is null or v_p.anulado_at is not null then raise exception 'Ese pedido no existe o fue anulado'; end if;
  if v_p.entregado_at is not null then raise exception 'Ese file ya se entregó'; end if;
  update prestamos_file set entregado_at = now(), entregado_por = auth.uid() where id = p_id;
  select razon_social into v_cliente from cuentas where id = v_p.cuenta_id;
  perform crear_notificacion(v_p.solicitado_por, null, 'otro',
    'Central le entregó un file · ' || coalesce(v_cliente, 'cliente'),
    'Cuando lo tenga en la mano, confírmelo con «Recibí el file». Devuélvalo a Central al terminar.', '/files');
end $$;

-- Quien lo pidió firma que lo recibió.
create or replace function public.files_confirmar_recibido(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_p prestamos_file%rowtype;
begin
  select * into v_p from prestamos_file where id = p_id for update;
  if v_p.id is null or v_p.solicitado_por <> auth.uid() then raise exception 'Ese file no está a su nombre'; end if;
  if v_p.entregado_at is null then raise exception 'Central todavía no lo entregó'; end if;
  if v_p.recibido_at is null then update prestamos_file set recibido_at = now() where id = p_id; end if;
end $$;

-- Central lo recibe de vuelta y lo tacha.
create or replace function public.files_devolver(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_p prestamos_file%rowtype;
begin
  if not lleva_los_files() then raise exception 'La devolución la registra Central'; end if;
  select * into v_p from prestamos_file where id = p_id for update;
  if v_p.id is null or v_p.entregado_at is null then raise exception 'Ese file no está prestado'; end if;
  if v_p.devuelto_at is not null then raise exception 'Ese file ya se devolvió'; end if;
  update prestamos_file
     set devuelto_at = now(), devuelto_recibido_por = auth.uid(), recibido_at = coalesce(recibido_at, entregado_at)
   where id = p_id;
end $$;

-- Anular un pedido que todavía no se entregó (quien lo pidió o Central).
create or replace function public.files_anular(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_p prestamos_file%rowtype;
begin
  select * into v_p from prestamos_file where id = p_id for update;
  if v_p.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_p.solicitado_por <> auth.uid() and not lleva_los_files() then raise exception 'Ese pedido no es suyo'; end if;
  if v_p.entregado_at is not null then raise exception 'Ya se entregó: se registra como devuelto, no se anula'; end if;
  update prestamos_file set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_id and anulado_at is null;
end $$;

revoke all on function public.lleva_los_files() from public, anon;
revoke all on function public.files_solicitar(uuid[], text) from public, anon;
revoke all on function public.files_entregar(uuid) from public, anon;
revoke all on function public.files_confirmar_recibido(uuid) from public, anon;
revoke all on function public.files_devolver(uuid) from public, anon;
revoke all on function public.files_anular(uuid, text) from public, anon;
grant execute on function public.lleva_los_files(), public.files_solicitar(uuid[], text), public.files_entregar(uuid),
  public.files_confirmar_recibido(uuid), public.files_devolver(uuid), public.files_anular(uuid, text) to authenticated, service_role;
revoke all on public.prestamos_file from anon;
grant select on public.prestamos_file to authenticated;
grant all on public.prestamos_file to service_role;

-- Piloto local (29-09): la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.prestamos_file';
    execute 'create trigger zz_sync after insert or update or delete on public.prestamos_file for each row execute function sync.capturar(''id'')';
  end if;
end $$;
