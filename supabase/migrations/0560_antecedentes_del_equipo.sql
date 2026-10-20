-- ============================================================
-- CRM EFAMEINSA · Migración 0560 · Antecedentes del equipo
-- ============================================================
-- Buzón 20-10-2026, Brenda (PV2): «Antecedentes e historial técnico del
-- equipo — para trabajos en planta puede ser revisión, mantenimiento
-- preventivo y/o correctivo». La solicitud ya es el caso, la identificación
-- es la ficha del equipo (serie, modelo) y la atención y cierre son el
-- informe técnico. Faltaba lo que el técnico pregunta antes de ir y que hoy
-- no se escribe en ningún lado, sobre todo en equipos que NO vendimos:
--   A. compra: fecha, a quién se compró, guía, factura u OC, garantía
--      (vigente / vencida / por verificar);
--   B-D. ¿tuvo mantenimiento, se le compraron repuestos, falló antes?
--      (sí / no / por verificar, con el detalle);
--   E. los papeles: guía/factura/OC, acta de instalación o entrega,
--      informes de mantenimiento anteriores, órdenes de servicio y
--      comprobantes de repuestos, fotos.
-- Una fila por equipo. La escribe postventa (y operaciones/backoffice); la
-- ve quien ya ve el equipo. Lo anterior queda en registro_acciones (0513).
-- ============================================================

create table if not exists equipo_antecedentes (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null unique references equipos_instalados(id) on delete cascade,
  fecha_compra date,
  proveedor text,
  guia_remision text,
  factura_oc text,
  garantia text check (garantia in ('vigente', 'vencida', 'por_verificar')),
  mantenimiento text check (mantenimiento in ('si', 'no', 'por_verificar')),
  mantenimiento_detalle text,
  repuestos text check (repuestos in ('si', 'no', 'por_verificar')),
  repuestos_detalle text,
  fallas text check (fallas in ('si', 'no', 'por_verificar')),
  fallas_detalle text,
  -- [{ path, nombre, tipo, clase, subido_por, subido_at }], en el bucket adjuntos bajo equipos/<id>/
  documentos jsonb not null default '[]',
  actualizado_por uuid references perfiles(id),
  actualizado_at timestamptz not null default now()
);

alter table equipo_antecedentes enable row level security;
-- Lo ve quien ve el equipo: el exists pasa por el RLS de equipos_instalados.
drop policy if exists antecedentes_lee on equipo_antecedentes;
create policy antecedentes_lee on equipo_antecedentes for select to authenticated using (
  exists (select 1 from equipos_instalados e where e.id = equipo_antecedentes.equipo_id)
);

create or replace function public.puede_antecedentes_equipo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(puede_postventa(), false) or coalesce(es_operaciones(), false) or coalesce(es_backoffice(), false)
      or coalesce(rol_actual() in ('gerencia', 'admin'), false)
$$;
grant execute on function public.puede_antecedentes_equipo() to authenticated;

-- p_datos: los campos de A-D (los que vengan se guardan tal cual, vacío = null).
-- p_documentos_nuevos: se SUMAN a los que ya hay. p_quitar: paths a sacar.
create or replace function public.guardar_antecedentes_equipo(
  p_equipo uuid, p_datos jsonb, p_documentos_nuevos jsonb default '[]', p_quitar text[] default '{}')
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_docs jsonb;
  v_nuevos jsonb;
  v_t text;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not puede_antecedentes_equipo() then raise exception 'Los antecedentes del equipo los registra postventa'; end if;
  if not exists (select 1 from equipos_instalados where id = p_equipo) then raise exception 'Ese equipo no existe'; end if;
  foreach v_t in array array['garantia', 'mantenimiento', 'repuestos', 'fallas'] loop
    if nullif(p_datos ->> v_t, '') is not null and p_datos ->> v_t not in ('vigente', 'vencida', 'por_verificar', 'si', 'no') then
      raise exception 'Valor no válido en %', v_t;
    end if;
  end loop;
  if nullif(p_datos ->> 'fecha_compra', '') is not null and (p_datos ->> 'fecha_compra')::date > current_date then
    raise exception 'La fecha de compra no puede ser futura';
  end if;

  select coalesce(jsonb_agg(x || jsonb_build_object('subido_por', auth.uid(), 'subido_at', now())), '[]')
    into v_nuevos
    from jsonb_array_elements(coalesce(p_documentos_nuevos, '[]')) x
   where coalesce(x ->> 'path', '') like 'equipos/' || p_equipo::text || '/%';

  select coalesce(jsonb_agg(d), '[]') into v_docs
    from jsonb_array_elements(coalesce((select documentos from equipo_antecedentes where equipo_id = p_equipo), '[]')) d
   where not (d ->> 'path' = any (coalesce(p_quitar, '{}')));

  insert into equipo_antecedentes as a (
    equipo_id, fecha_compra, proveedor, guia_remision, factura_oc, garantia,
    mantenimiento, mantenimiento_detalle, repuestos, repuestos_detalle, fallas, fallas_detalle,
    documentos, actualizado_por, actualizado_at)
  values (
    p_equipo,
    nullif(p_datos ->> 'fecha_compra', '')::date,
    nullif(btrim(coalesce(p_datos ->> 'proveedor', '')), ''),
    nullif(upper(btrim(coalesce(p_datos ->> 'guia_remision', ''))), ''),
    nullif(upper(btrim(coalesce(p_datos ->> 'factura_oc', ''))), ''),
    nullif(p_datos ->> 'garantia', ''),
    nullif(p_datos ->> 'mantenimiento', ''),
    nullif(btrim(coalesce(p_datos ->> 'mantenimiento_detalle', '')), ''),
    nullif(p_datos ->> 'repuestos', ''),
    nullif(btrim(coalesce(p_datos ->> 'repuestos_detalle', '')), ''),
    nullif(p_datos ->> 'fallas', ''),
    nullif(btrim(coalesce(p_datos ->> 'fallas_detalle', '')), ''),
    v_docs || v_nuevos, auth.uid(), now())
  on conflict (equipo_id) do update set
    fecha_compra = excluded.fecha_compra,
    proveedor = excluded.proveedor,
    guia_remision = excluded.guia_remision,
    factura_oc = excluded.factura_oc,
    garantia = excluded.garantia,
    mantenimiento = excluded.mantenimiento,
    mantenimiento_detalle = excluded.mantenimiento_detalle,
    repuestos = excluded.repuestos,
    repuestos_detalle = excluded.repuestos_detalle,
    fallas = excluded.fallas,
    fallas_detalle = excluded.fallas_detalle,
    documentos = excluded.documentos,
    actualizado_por = auth.uid(),
    actualizado_at = now();
end $function$;

revoke all on function public.guardar_antecedentes_equipo(uuid, jsonb, jsonb, text[]) from public;
grant execute on function public.guardar_antecedentes_equipo(uuid, jsonb, jsonb, text[]) to authenticated;

drop trigger if exists zy_registro_acciones on equipo_antecedentes;
create trigger zy_registro_acciones after insert or update or delete on equipo_antecedentes
  for each row execute function registrar_accion();

grant select on public.equipo_antecedentes to authenticated;
grant all on public.equipo_antecedentes to service_role;
