-- 0381 · Central agrega y corrige el inventario de files desde el CRM
--
-- 02-10-2026, Central (vía Santos): «ella también debería poder agregarlos
-- por el sistema para no estar dándome a mí las actualizaciones». Ese día
-- Rubí no encontró PRODECO DEL SUR para pedir: era un cierre del 30-09
-- (OPEN 049-2026) y el inventario de 0372 solo tenía lo del Excel al 23-09.
-- Se agregaron a mano tres files; desde ahora lo hace quien lleva el
-- archivador (lleva_los_files: central, gerencia, admin, operaciones).
--
-- Agregar, corregir (nombre, año, estante, cajón, RUC) y dar de baja (el file
-- ya no está en el archivador). La baja no borra: los préstamos viejos siguen
-- apuntando a la fila. La cuenta de práctica no toca el inventario real.

alter table public.inventario_files
  add column if not exists creado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists actualizado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists actualizado_at timestamptz;

-- Mismo criterio que el buscador: sin tildes, puntos ni espacios.
create or replace function public.inventario_files_clave(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9&]', '', 'g');
$$;

create or replace function public.inventario_files_guardar(
  p_id uuid,
  p_empresa text,
  p_tipo text,
  p_nombre text,
  p_anio integer default null,
  p_estante text default null,
  p_cajon text default null,
  p_documento text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo perfiles%rowtype;
  v_nombre text := upper(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'));
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g'), '');
  v_estante text := nullif(upper(btrim(coalesce(p_estante, ''))), '');
  v_cajon text := nullif(upper(btrim(coalesce(p_cajon, ''))), '');
  v_cuenta uuid;
  v_otro inventario_files%rowtype;
  v_id uuid;
begin
  if not lleva_los_files() then raise exception 'El inventario de files lo lleva Central'; end if;
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if coalesce(v_yo.es_prueba, false) then raise exception 'La cuenta de práctica no cambia el inventario real de files'; end if;
  if p_empresa not in ('efameinsa', 'open') then raise exception 'Elija la empresa: EFAMEINSA u OPEN'; end if;
  if p_tipo not in ('file', 'archivador') then raise exception 'Elija si es file o archivador'; end if;
  if length(v_nombre) < 3 then raise exception 'Escriba el nombre del cliente como figura en el file'; end if;
  if p_anio is not null and (p_anio < 1990 or p_anio > extract(year from now())::int + 1) then raise exception 'El año % no es válido', p_anio; end if;
  if v_doc is not null and length(v_doc) not in (8, 11) then raise exception 'El RUC tiene 11 dígitos y el DNI 8'; end if;

  -- El mismo file dos veces (misma empresa, tipo, nombre y año) confunde a quien pide.
  select * into v_otro
    from inventario_files
   where activo and empresa = p_empresa and tipo = p_tipo
     and inventario_files_clave(nombre) = inventario_files_clave(v_nombre)
     and anio is not distinct from p_anio
     and id is distinct from p_id
   limit 1;
  if v_otro.id is not null then
    raise exception 'Ese file ya está en el inventario: % (%)', v_otro.nombre,
      coalesce(inventario_files_ubicacion(v_otro.estante, v_otro.cajon), 'sin ubicación');
  end if;

  -- La ficha: por RUC/DNI si coincide con una sola; si no, por nombre exacto.
  if v_doc is not null then
    select min(id::text)::uuid into v_cuenta from cuentas where num_doc = v_doc and fusionada_en is null having count(*) = 1;
  end if;
  if v_cuenta is null then
    select min(id::text)::uuid into v_cuenta from cuentas
     where fusionada_en is null and inventario_files_clave(razon_social) = inventario_files_clave(v_nombre) having count(*) = 1;
  end if;

  if p_id is null then
    insert into inventario_files (empresa, tipo, estante, cajon, nombre, anio, documento, cuenta_id, fuente, creado_por)
    values (p_empresa, p_tipo, v_estante, v_cajon, v_nombre, p_anio, v_doc, v_cuenta, 'Agregado en el CRM por ' || v_yo.nombre, v_yo.id)
    returning id into v_id;
  else
    update inventario_files
       set empresa = p_empresa, tipo = p_tipo, estante = v_estante, cajon = v_cajon, nombre = v_nombre,
           anio = p_anio, documento = v_doc, cuenta_id = coalesce(v_cuenta, cuenta_id),
           actualizado_por = v_yo.id, actualizado_at = now()
     where id = p_id and activo
     returning id into v_id;
    if v_id is null then raise exception 'Ese file ya no está en el inventario'; end if;
  end if;
  return v_id;
end $$;

revoke all on function public.inventario_files_guardar(uuid, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.inventario_files_guardar(uuid, text, text, text, integer, text, text, text) to authenticated, service_role;

-- Dar de baja: el file ya no está en el archivador. No se borra.
create or replace function public.inventario_files_baja(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_yo perfiles%rowtype;
begin
  if not lleva_los_files() then raise exception 'El inventario de files lo lleva Central'; end if;
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if coalesce(v_yo.es_prueba, false) then raise exception 'La cuenta de práctica no cambia el inventario real de files'; end if;
  if exists (select 1 from prestamos_file where inventario_id = p_id and anulado_at is null and devuelto_at is null) then
    raise exception 'Ese file está pedido o prestado: espere a que vuelva al archivador';
  end if;
  update inventario_files set activo = false, actualizado_por = v_yo.id, actualizado_at = now() where id = p_id and activo;
  if not found then raise exception 'Ese file ya no está en el inventario'; end if;
end $$;

revoke all on function public.inventario_files_baja(uuid) from public, anon;
grant execute on function public.inventario_files_baja(uuid) to authenticated, service_role;
