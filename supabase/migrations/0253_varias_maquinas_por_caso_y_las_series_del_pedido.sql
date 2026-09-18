-- 18-09-2026, Carlos con Santos (reunión 09:55), por el caso Gary Group:
-- «el cliente ha comprado varias máquinas… ¿no serían cuatro casos? sería
-- mucho rollo; mejor que se pueda agregar». Y el porqué: «este cliente compró
-- 20 máquinas, tienen series; cuando llama por un problema yo tengo que
-- relacionar la serie con el problema».
--
-- Dos cosas:
-- 1. Un caso puede llevar VARIAS máquinas. La principal sigue en
--    atenciones.equipo_id (de ella cuelgan la garantía y el circuito); las
--    demás van en atencion_equipos, y el historial de cada máquina muestra el
--    caso aunque no haya sido la principal.
-- 2. Las series del pedido se registran sin cerrarlo. Gary Group salió el
--    15-09 con guía y ni una serie llegó al parque, y por eso el caso no
--    tenía máquinas que elegir: la puerta para ponerlas era «Cerrar pedido».

create table if not exists atencion_equipos (
  atencion_id uuid not null references atenciones(id) on delete cascade,
  equipo_id uuid not null references equipos_instalados(id) on delete cascade,
  agregado_at timestamptz not null default now(),
  agregado_por uuid references perfiles(id),
  primary key (atencion_id, equipo_id)
);
comment on table atencion_equipos is 'Las otras máquinas de un caso, además de la principal (atenciones.equipo_id) (0253).';
create index if not exists atencion_equipos_equipo_idx on atencion_equipos (equipo_id);

alter table atencion_equipos enable row level security;
-- Se ven con la atención; escriben quienes trabajan atenciones y el almacén.
drop policy if exists atencion_equipos_lectura on atencion_equipos;
create policy atencion_equipos_lectura on atencion_equipos for select to authenticated
  using (exists (select 1 from atenciones a where a.id = atencion_id));
drop policy if exists atencion_equipos_escribe on atencion_equipos;
create policy atencion_equipos_escribe on atencion_equipos for all to authenticated
  using (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false))
  with check (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false));

-- Agregar una máquina al caso: si el caso no tiene principal, esta pasa a
-- serlo (con la garantía verificada, como el clic del panel); si ya la tiene,
-- entra como adicional. Devuelve 'principal' o 'adicional'.
create or replace function public.agregar_equipo_al_caso(p_atencion uuid, p_equipo uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_a record;
  v_eq record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)) then
    raise exception 'Solo postventa o el almacén agregan máquinas a un caso';
  end if;
  select id, cuenta_id, equipo_id into v_a from atenciones where id = p_atencion;
  if v_a.id is null then raise exception 'Ese caso no existe'; end if;
  select id, cuenta_id, garantia_hasta into v_eq from equipos_instalados where id = p_equipo;
  if v_eq.id is null then raise exception 'Esa máquina no está en el parque instalado'; end if;
  if v_a.cuenta_id is not null and v_eq.cuenta_id is not null and v_eq.cuenta_id <> v_a.cuenta_id then
    raise exception 'Esa máquina es de otro cliente';
  end if;

  if v_a.equipo_id is null then
    update atenciones
       set equipo_id = p_equipo,
           en_garantia = case when v_eq.garantia_hasta is null then null else v_eq.garantia_hasta >= current_date end,
           garantia_verificada_at = now(),
           garantia_verificada_por = auth.uid()
     where id = p_atencion;
    return 'principal';
  end if;
  if v_a.equipo_id = p_equipo then return 'principal'; end if;
  insert into atencion_equipos (atencion_id, equipo_id, agregado_por)
  values (p_atencion, p_equipo, auth.uid())
  on conflict do nothing;
  return 'adicional';
end;
$$;

create or replace function public.quitar_equipo_del_caso(p_atencion uuid, p_equipo uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from atencion_equipos
   where atencion_id = p_atencion and equipo_id = p_equipo
     and (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false));
$$;

-- Las series del pedido, sin cerrarlo. Mismo alta que hace «Cerrar pedido»
-- (postventa.ts, cerrarPedido): una ficha por serie con la fecha de la guía
-- como fecha de despacho, y el mantenimiento a seis meses. Devuelve cuántas
-- fichas nuevas hizo.
create or replace function public.registrar_series_del_pedido(p_servicio uuid, p_series text[], p_garantia_meses int default 24)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s record;
  v_serie text;
  v_base date;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)) then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  foreach v_serie in array p_series loop
    v_serie := upper(btrim(coalesce(v_serie, '')));
    if v_serie = '' then continue; end if;
    insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
      fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
      registrado_por, registrado_en)
    values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_s.equipo, v_s.id, v_s.informe_cierre_id,
      v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
      case when v_base is null then null else (v_base + interval '6 months')::date end, v_s.ubicacion,
      auth.uid(), 'pedido')
    on conflict (serie) do update
      set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
          cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
          guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
          fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
