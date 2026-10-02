-- 0372 · El buscador de «Pedir files» busca en el INVENTARIO físico
--
-- 02-10-2026, Santos: «INVETARIO_FILES EFAMEINSA Y OPEN 2026 subirlo al crm
-- que en la búsqueda de solicitud de files, solo tenga esta data de
-- Efameinsa y Open Investments». El Excel (inventario de Central al
-- 23-09-2026) tiene cuatro hojas: archivadores y files de EFAMEINSA,
-- archivadores («file grueso») y files de OPEN INVESTMENTS, cada uno con su
-- estante y cajón.
--
-- Hasta ahora se buscaba en las 16 mil fichas del CRM y se marcaba a mano
-- OPEN/EFAMEINSA (0341), aunque el file no existiera. Desde ahora se pide lo
-- que está en el archivo: cada fila del inventario ya dice de qué empresa es
-- y dónde está, y Central lo ve en el pedido.
--
-- El file puede no tener ficha en el CRM (personas, nombres compuestos
-- «A - B - C»): `cuenta_id` se anota cuando el nombre o el RUC coinciden con
-- una sola ficha, y en el préstamo deja de ser obligatorio.

create table if not exists public.inventario_files (
  id uuid primary key default gen_random_uuid(),
  empresa text not null check (empresa in ('efameinsa', 'open')),
  tipo text not null check (tipo in ('archivador', 'file')),
  estante text,
  cajon text,
  nombre text not null,
  anio integer,
  documento text,
  cuenta_id uuid references public.cuentas(id) on delete set null,
  activo boolean not null default true,
  fuente text,
  fila_fuente integer,
  created_at timestamptz not null default now()
);

create index if not exists ix_inventario_files_cuenta on public.inventario_files (cuenta_id);

alter table public.inventario_files enable row level security;

-- Lo lee cualquiera que pueda pedir un file; se carga por script, sin escritura desde la app.
drop policy if exists inventario_files_lectura on public.inventario_files;
create policy inventario_files_lectura on public.inventario_files
  for select to authenticated using (true);

grant select on public.inventario_files to authenticated;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.inventario_files';
    execute 'create trigger zz_sync after insert or update or delete on public.inventario_files for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- El préstamo apunta a la fila del inventario; la ficha pasa a ser opcional.
alter table public.prestamos_file
  add column if not exists inventario_id uuid references public.inventario_files(id) on delete set null,
  add column if not exists ubicacion text;
alter table public.prestamos_file alter column cuenta_id drop not null;
create index if not exists ix_prestamos_file_inventario on public.prestamos_file (inventario_id);

-- Dónde está el file, como lo lee Central: «Estante PRIMERO · SEGUNDO CAJÓN».
create or replace function public.inventario_files_ubicacion(p_estante text, p_cajon text)
returns text
language sql
immutable
as $$
  select nullif(concat_ws(' · ', 'Estante ' || nullif(btrim(p_estante), ''), nullif(btrim(p_cajon), '')), '');
$$;

-- Buscar en el inventario: cada palabra tiene que estar en el nombre o el RUC,
-- sin importar tildes, puntos ni mayúsculas («peru sac» encuentra «PERÚ S.A.C.»).
create or replace function public.buscar_inventario_files(p_q text)
returns setof public.inventario_files
language sql
stable
set search_path to 'public'
as $$
  with palabras as (
    select w from regexp_split_to_table(
      translate(lower(btrim(coalesce(p_q, ''))), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9&]+') as w
     where length(w) > 0
  )
  select i.*
    from inventario_files i
   where i.activo
     and length(btrim(coalesce(p_q, ''))) >= 3
     and not exists (
       select 1 from palabras p
        where position(p.w in regexp_replace(translate(lower(i.nombre || ' ' || coalesce(i.documento, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9&]', '', 'g')) = 0)
   order by i.nombre, i.empresa, i.tipo, i.anio nulls first
   limit 40;
$$;

revoke all on function public.buscar_inventario_files(text) from public, anon;
grant execute on function public.buscar_inventario_files(text) to authenticated, service_role;

-- Pedir files del inventario. Mismo aviso a Central que 0357.
create or replace function public.files_solicitar_inventario(p_items uuid[], p_nota text default null)
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
  if coalesce(array_length(p_items, 1), 0) = 0 then raise exception 'Agregue al menos un file'; end if;
  if array_length(p_items, 1) > 20 then raise exception 'Máximo 20 files por pedido'; end if;

  insert into prestamos_file (grupo, cuenta_id, inventario_id, cliente_texto, cliente_doc, empresa, ubicacion, solicitado_por, nota, es_prueba)
  select v_grupo, i.cuenta_id, i.id,
         i.nombre || case when i.tipo = 'archivador' then ' (archivador)' else '' end,
         i.documento, i.empresa, inventario_files_ubicacion(i.estante, i.cajon),
         v_yo.id, nullif(btrim(coalesce(p_nota, '')), ''), coalesce(v_yo.es_prueba, false)
    from inventario_files i
   where i.id = any (p_items) and i.activo;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ninguno de esos files está en el inventario'; end if;

  select string_agg(i.nombre || ' (' || case i.empresa when 'open' then 'OPEN' else 'EFAMEINSA' end
                    || coalesce(' · ' || inventario_files_ubicacion(i.estante, i.cajon), '') || ')',
                    ' · ' order by i.nombre) into v_nombres
    from inventario_files i where i.id = any (p_items) and i.activo;

  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select id, 'file_pedido',
         format('Pedido de %s file%s · %s', v_n, case when v_n = 1 then '' else 's' end, coalesce(v_yo.codigo_comercial || ' ' , '') || v_yo.nombre),
         left(v_nombres, 300) || coalesce(' — ' || nullif(btrim(coalesce(p_nota, '')), ''), ''),
         '/files'
    from perfiles
   where rol = 'central' and activo and coalesce(es_prueba, false) = coalesce(v_yo.es_prueba, false);
  return v_n;
end $$;

revoke all on function public.files_solicitar_inventario(uuid[], text) from public, anon;
grant execute on function public.files_solicitar_inventario(uuid[], text) to authenticated, service_role;

-- Al entregar, el aviso usa el nombre anotado en el pedido (puede no haber ficha).
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
  v_cliente := coalesce(v_p.cliente_texto, (select razon_social from cuentas where id = v_p.cuenta_id));
  perform crear_notificacion(v_p.solicitado_por, null, 'otro',
    'Central le entregó un file · ' || coalesce(v_cliente, 'cliente'),
    'Cuando lo tenga en la mano, confírmelo con «Recibí el file». Devuélvalo a Central al terminar.', '/files');
end $$;
