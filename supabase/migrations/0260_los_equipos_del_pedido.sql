-- 21-09-2026, reunión de Carlos con postventa mirando el pedido de Ecolav
-- (una lavadora con serie —hay stock— y una secadora sin stock; el cliente
-- quiere que salga solo la lavadora):
--
--   «¿Cómo saben cuál está en stock y cuál no? ¿Dónde dice eso? … Acá tienen
--   que aparecer los dos equipos: en uno la serie, porque hay stock, y el
--   dos sin stock … te tendría que aparecer la opción de qué máquina, la 1 o
--   la 2. Si doy 1, significa parcial, y hacia abajo me arroja la prueba y
--   embalaje solamente del equipo que marqué … El almacén solo tiene para
--   ingresar UN protocolo. Imagínate que el cliente tenga 5 máquinas: cada
--   máquina tiene un protocolo.»
--
-- Hasta hoy el pedido era un solo texto («equipo») y un solo protocolo. Desde
-- acá cada pedido tiene su lista de equipos, uno por unidad vendida en el
-- cierre: con serie (hay stock) o sin ella; va o no va en este despacho; y
-- el almacén prueba y sube el protocolo máquina por máquina. Cuando todas las
-- que van están probadas, el pedido queda «probado y embalado» como antes.

create table if not exists pedido_equipos (
  id                uuid primary key default gen_random_uuid(),
  servicio_id       uuid not null references servicios_postventa (id) on delete cascade,
  orden             int  not null,
  descripcion       text not null,
  sku               text,
  /** La serie leída en la placa. Sin serie = todavía sin stock. */
  serie             text,
  equipo_id         uuid references equipos_instalados (id) on delete set null,
  en_este_despacho  boolean not null default true,
  prueba_lista_at   timestamptz,
  prueba_lista_por  uuid references perfiles (id),
  protocolo_ref     text,
  protocolo_nota    text,
  protocolo_fotos   jsonb not null default '[]'::jsonb,
  es_prueba         boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (servicio_id, orden)
);
comment on table pedido_equipos is 'Los equipos de un pedido, uno por unidad vendida (0260): serie (stock), si va en este despacho y su protocolo de prueba.';
create index if not exists pedido_equipos_servicio on pedido_equipos (servicio_id, orden);

alter table pedido_equipos enable row level security;
drop policy if exists pedido_equipos_lectura on pedido_equipos;
create policy pedido_equipos_lectura on pedido_equipos for select to authenticated
  using (
    (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false))
    and es_prueba = coalesce((select es_cuenta_prueba()), false)
  );
-- Se escribe solo por las funciones de abajo.

-- ── Sembrar la lista desde el cierre (una vez por pedido) ──────────────────
create or replace function public.sembrar_equipos_del_pedido(p_servicio uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s      record;
  v_items  jsonb;
  v_item   jsonb;
  v_n      int := 0;
  v_cant   int;
  v_i      int;
  v_desc   text;
  v_sku    text;
  v_eq     record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)) then
    raise exception 'Solo postventa o el almacén ven los equipos del pedido';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if exists (select 1 from pedido_equipos where servicio_id = p_servicio) then
    return 0;
  end if;

  -- 1. Las líneas del bloque de venta del cierre, una fila por unidad.
  if v_s.informe_cierre_id is not null then
    select items into v_items from informes_cierre where id = v_s.informe_cierre_id;
    if jsonb_typeof(v_items) = 'array' then
      for v_item in select * from jsonb_array_elements(v_items) loop
        if coalesce(v_item->>'bloque', 'venta') <> 'venta' then continue; end if;
        v_desc := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
        if v_desc is null then continue; end if;
        v_cant := greatest(1, least(20, coalesce((v_item->>'cantidad')::numeric, 1)::int));
        v_sku  := nullif(btrim(coalesce(v_item->>'sku', v_item->>'codigo', substring(v_desc from '(?i)C[OÓ]DIGO:\s*([A-Z0-9\-\.]+)'))), '');
        for v_i in 1..v_cant loop
          v_n := v_n + 1;
          insert into pedido_equipos (servicio_id, orden, descripcion, sku, es_prueba)
          values (p_servicio, v_n, v_desc, v_sku, v_s.es_prueba);
        end loop;
      end loop;
    end if;
  end if;

  -- 2. Sin cierre (pedidos anteriores al circuito): un equipo, el texto del pedido.
  if v_n = 0 then
    v_n := 1;
    insert into pedido_equipos (servicio_id, orden, descripcion, es_prueba)
    values (p_servicio, 1, coalesce(nullif(btrim(v_s.equipo), ''), 'Equipo del pedido'), v_s.es_prueba);
  end if;

  -- 3. Las series que ya se registraron en el parque (0253) se enganchan a la
  --    lista, en orden, para no pedirlas dos veces.
  for v_eq in select id, serie from equipos_instalados where servicio_id = p_servicio order by created_at loop
    update pedido_equipos set serie = v_eq.serie, equipo_id = v_eq.id
     where id = (select id from pedido_equipos where servicio_id = p_servicio and serie is null order by orden limit 1);
  end loop;

  -- 4. Si el pedido ya estaba probado (antes de la 0260), todos sus equipos también.
  if v_s.prueba_lista_at is not null then
    update pedido_equipos
       set prueba_lista_at = v_s.prueba_lista_at, prueba_lista_por = v_s.prueba_lista_por, protocolo_ref = v_s.protocolo_prueba_ref
     where servicio_id = p_servicio;
  end if;
  return v_n;
end;
$$;

-- ── La serie de un equipo: nace en el parque y queda enganchada ────────────
create or replace function public.registrar_serie_del_equipo(p_item uuid, p_serie text, p_garantia_meses int default 24)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it    record;
  v_s     record;
  v_serie text;
  v_base  date;
  v_eq    uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)) then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  v_serie := upper(btrim(coalesce(p_serie, '')));
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;
  select * into v_s from servicios_postventa where id = v_it.servicio_id;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
    fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
    registrado_por, registrado_en, es_prueba)
  values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_it.descripcion, v_s.id, v_s.informe_cierre_id,
    v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
    case when v_base is null then null else (v_base + interval '6 months')::date end, v_s.ubicacion,
    auth.uid(), 'pedido', v_s.es_prueba)
  on conflict (serie) do update
    set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
        cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
        modelo_texto = coalesce(equipos_instalados.modelo_texto, excluded.modelo_texto),
        guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
        fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho)
  returning id into v_eq;

  update pedido_equipos set serie = v_serie, equipo_id = v_eq where id = p_item;
  return v_eq;
end;
$$;

-- ── Va o no va en este despacho (parcial) ─────────────────────────────────
create or replace function public.equipo_va_en_este_despacho(p_item uuid, p_va boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Qué va en el despacho lo decide postventa';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  if exists (select 1 from servicios_postventa where id = v_it.servicio_id and despachado_at is not null) then
    raise exception 'El pedido ya salió del almacén: lo que va, ya fue';
  end if;
  if not p_va and (select count(*) from pedido_equipos where servicio_id = v_it.servicio_id and en_este_despacho and id <> p_item) = 0 then
    raise exception 'Algún equipo tiene que ir en el despacho';
  end if;
  update pedido_equipos set en_este_despacho = p_va where id = p_item;
end;
$$;

-- ── El almacén prueba máquina por máquina ─────────────────────────────────
create or replace function public.almacen_probar_equipo(p_item uuid, p_protocolo_ref text, p_fotos jsonb default '[]'::jsonb, p_nota text default null)
returns boolean  -- true cuando con esta ya están todas las que van y el pedido queda probado y embalado
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it   record;
  v_pend int;
  v_refs text;
  v_fotos jsonb;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;

  update pedido_equipos
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         protocolo_ref = coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), protocolo_ref),
         protocolo_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), protocolo_nota),
         protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb)
   where id = p_item;

  select count(*) into v_pend from pedido_equipos where servicio_id = v_it.servicio_id and en_este_despacho and prueba_lista_at is null;
  if v_pend > 0 then return false; end if;

  -- Todas las que van están probadas: el pedido queda probado y embalado,
  -- con los protocolos de todas (uno por máquina) y sus fotos.
  select string_agg(protocolo_ref, ' · ' order by orden), coalesce(jsonb_agg(f order by orden), '[]'::jsonb)
    into v_refs, v_fotos
    from pedido_equipos pe
    left join lateral jsonb_array_elements(pe.protocolo_fotos) f on true
   where pe.servicio_id = v_it.servicio_id and pe.en_este_despacho;
  update servicios_postventa
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         prueba_embalaje = 'SI',
         protocolo_prueba_ref = coalesce(v_refs, protocolo_prueba_ref),
         protocolo_fotos = case when jsonb_typeof(v_fotos) = 'array' and jsonb_array_length(v_fotos) > 0 then v_fotos else protocolo_fotos end,
         updated_at = now()
   where id = v_it.servicio_id;
  return true;
end;
$$;

revoke all on function public.sembrar_equipos_del_pedido(uuid) from public;
revoke all on function public.registrar_serie_del_equipo(uuid, text, int) from public;
revoke all on function public.equipo_va_en_este_despacho(uuid, boolean) from public;
revoke all on function public.almacen_probar_equipo(uuid, text, jsonb, text) from public;
grant execute on function public.sembrar_equipos_del_pedido(uuid) to authenticated;
grant execute on function public.registrar_serie_del_equipo(uuid, text, int) to authenticated;
grant execute on function public.equipo_va_en_este_despacho(uuid, boolean) to authenticated;
grant execute on function public.almacen_probar_equipo(uuid, text, jsonb, text) to authenticated;
