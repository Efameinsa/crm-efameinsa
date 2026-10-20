-- ============================================================
-- CRM EFAMEINSA · Migración 0557 · Orden de recepción y revisión de equipo
-- ============================================================
-- Reunión de gerencia 20-10-2026, Brenda (PV2): «las máquinas que van a
-- llegar… cómo le doy la orden para que las revise». Gerencia: «eso sí
-- deberíamos atacarlo, está bien fácil, ya está conceptualizado como la
-- apertura… es como una derivación de llamada, solo darle otro nombre».
-- La apertura es el equipo que SALE; esto es el que ENTRA (por garantía,
-- reparación o revisión). Nace del caso técnico y la sigue el almacén:
--   pedida (postventa) → recibido (almacén, con fotos del estado al llegar)
--   → revisado (técnico, diagnóstico, fotos) → listo (devolver o cotizar).
-- Cada paso con quién y cuándo; el caso lo muestra.
-- ============================================================

create sequence if not exists recepciones_equipo_seq;

create table if not exists recepciones_equipo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('REC-' || lpad(nextval('recepciones_equipo_seq')::text, 5, '0')),
  atencion_id uuid references atenciones(id),
  cuenta_id uuid references cuentas(id),
  equipo_texto text not null,
  serie text,
  motivo text not null check (motivo in ('garantia', 'reparacion', 'revision', 'otro')),
  llega_por text not null check (llega_por in ('cliente', 'agencia', 'tecnico', 'otro')),
  fecha_estimada date,
  nota text,
  creada_por uuid references perfiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  recibido_at timestamptz,
  recibido_por uuid references perfiles(id),
  recibido_nota text,
  recibido_fotos jsonb not null default '[]',
  revisado_at timestamptz,
  revisado_por uuid references perfiles(id),
  tecnico text,
  diagnostico text,
  repuestos text,
  revisado_fotos jsonb not null default '[]',
  listo_at timestamptz,
  listo_por uuid references perfiles(id),
  resultado text check (resultado in ('devolver', 'cotizar', 'otro')),
  resultado_nota text,
  anulada_at timestamptz,
  anulada_por uuid references perfiles(id),
  anulada_motivo text,
  es_prueba boolean not null default coalesce(es_cuenta_prueba(), false)
);
create index if not exists recepciones_equipo_atencion on recepciones_equipo(atencion_id);
create index if not exists recepciones_equipo_abiertas on recepciones_equipo(listo_at) where listo_at is null and anulada_at is null;

alter table recepciones_equipo enable row level security;
drop policy if exists recepciones_lee on recepciones_equipo;
create policy recepciones_lee on recepciones_equipo for select to authenticated using (
  ((select puede_postventa()) or (select es_almacen()) or (select es_operaciones()) or (select es_backoffice()) or (select rol_actual()) = 'central')
  and es_prueba = (select es_cuenta_prueba())
);

create or replace function public.puede_recepcion_almacen() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(es_almacen(), false) or coalesce(es_operaciones(), false) or coalesce(es_backoffice(), false)
$$;
grant execute on function public.puede_recepcion_almacen() to authenticated;

create or replace function public.crear_recepcion_equipo(
  p_atencion uuid, p_equipo text, p_serie text, p_motivo text, p_llega_por text, p_fecha date, p_nota text)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_a atenciones%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La orden de recepción la da postventa';
  end if;
  select * into v_a from atenciones where id = p_atencion;
  if v_a.id is null then raise exception 'Ese caso no existe'; end if;
  if coalesce(btrim(p_equipo), '') = '' then raise exception 'Diga qué equipo llega'; end if;
  insert into recepciones_equipo (atencion_id, cuenta_id, equipo_texto, serie, motivo, llega_por, fecha_estimada, nota, es_prueba)
  values (p_atencion, v_a.cuenta_id, btrim(p_equipo), nullif(upper(btrim(coalesce(p_serie, ''))), ''), p_motivo, p_llega_por, p_fecha,
          nullif(btrim(coalesce(p_nota, '')), ''), v_a.es_prueba)
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.almacen_recepcion_paso(
  p_id uuid, p_paso text, p_nota text default null, p_fotos jsonb default '[]',
  p_tecnico text default null, p_diagnostico text default null, p_repuestos text default null, p_resultado text default null)
returns void language plpgsql security definer set search_path = public as $function$
declare
  r recepciones_equipo%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  select * into r from recepciones_equipo where id = p_id for update;
  if r.id is null or r.anulada_at is not null then raise exception 'Esa orden de recepción no existe o se anuló'; end if;
  if p_paso = 'recibido' then
    if not puede_recepcion_almacen() then raise exception 'La recepción la registra el almacén'; end if;
    if r.recibido_at is not null then raise exception 'Ya se registró que llegó'; end if;
    if jsonb_array_length(coalesce(p_fotos, '[]')) = 0 then raise exception 'Suba al menos una foto de cómo llegó el equipo'; end if;
    update recepciones_equipo set recibido_at = now(), recibido_por = auth.uid(), recibido_nota = nullif(btrim(coalesce(p_nota, '')), ''), recibido_fotos = p_fotos where id = p_id;
  elsif p_paso = 'revisado' then
    if not puede_recepcion_almacen() then raise exception 'La revisión la registra el almacén'; end if;
    if r.recibido_at is null then raise exception 'Primero registre que el equipo llegó'; end if;
    if coalesce(btrim(p_diagnostico), '') = '' then raise exception 'Escriba el diagnóstico'; end if;
    update recepciones_equipo set revisado_at = now(), revisado_por = auth.uid(), tecnico = nullif(btrim(coalesce(p_tecnico, '')), ''),
           diagnostico = btrim(p_diagnostico), repuestos = nullif(btrim(coalesce(p_repuestos, '')), ''),
           revisado_fotos = coalesce(p_fotos, '[]') where id = p_id;
  elsif p_paso = 'listo' then
    if not (puede_recepcion_almacen() or coalesce(puede_postventa(), false)) then raise exception 'Esto lo marca el almacén o postventa'; end if;
    if r.revisado_at is null then raise exception 'Primero registre la revisión'; end if;
    if coalesce(p_resultado, '') not in ('devolver', 'cotizar', 'otro') then raise exception 'Diga qué sigue: devolver o cotizar'; end if;
    update recepciones_equipo set listo_at = now(), listo_por = auth.uid(), resultado = p_resultado, resultado_nota = nullif(btrim(coalesce(p_nota, '')), '') where id = p_id;
  elsif p_paso = 'anular' then
    if not (coalesce(puede_postventa(), false) or puede_recepcion_almacen()) then raise exception 'No puede anular esta orden'; end if;
    if coalesce(btrim(p_nota), '') = '' then raise exception 'Diga por qué se anula'; end if;
    update recepciones_equipo set anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_nota) where id = p_id;
  else
    raise exception 'Paso desconocido';
  end if;
end $function$;

revoke all on function public.crear_recepcion_equipo(uuid, text, text, text, text, date, text) from public;
grant execute on function public.crear_recepcion_equipo(uuid, text, text, text, text, date, text) to authenticated;
revoke all on function public.almacen_recepcion_paso(uuid, text, text, jsonb, text, text, text, text) from public;
grant execute on function public.almacen_recepcion_paso(uuid, text, text, jsonb, text, text, text, text) to authenticated;

-- Al registro de acciones (0513), como el resto de lo que la gente toca.
drop trigger if exists zy_registro_acciones on recepciones_equipo;
create trigger zy_registro_acciones after insert or update or delete on recepciones_equipo
  for each row execute function registrar_accion();

-- Permisos explícitos (en la base local las tablas nuevas no los heredan).
grant select on public.recepciones_equipo to authenticated;
grant all on public.recepciones_equipo to service_role;
