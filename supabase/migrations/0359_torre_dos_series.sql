-- 0359 · La torre apilable lleva dos series: cada máquina, su fila
--
-- Lesly (operaciones), 30-09-2026 17:07, en el pedido de NINAMANGO (torre LG
-- Giant C: lavadora CWG27MDCRS + secadora CDG27MUCPS): «en el caso de las
-- torres siempre se pone dos series, debería poder permitir poner más series».
--
-- Hasta hoy una unidad del pedido = una serie. En las torres el almacén
-- escribía las dos juntas («604KWAT5N408 / 304KWDJ0V226») y al parque subía UN
-- equipo con una serie doble: postventa no encuentra la secadora por su placa
-- ni lleva su garantía aparte. En el parque histórico cada máquina ya es su
-- propia fila; esto hace lo mismo desde el pedido.
--
-- CÓMO. La segunda máquina es una fila «parte» de la primera (parte_de), con
-- su nombre («Secadora») y su serie, que sube al parque como cualquier otra.
-- No es otra unidad vendida: no cuenta para probar y embalar (la prueba de la
-- torre vale para las dos), ni se decide aparte si va en el despacho (va con
-- su máquina). Sí cuenta como serie del pedido.
-- Nace siempre con serie, así que «código sin serie» y «subir al parque» (que
-- buscan filas sin serie) no la confunden con una unidad pendiente.

alter table public.pedido_equipos
  add column if not exists parte_de uuid references public.pedido_equipos (id) on delete cascade,
  add column if not exists parte_nombre text;

create index if not exists ix_pedido_equipos_parte_de on public.pedido_equipos (parte_de) where parte_de is not null;

comment on column public.pedido_equipos.parte_de is
  'Segunda máquina de la misma unidad (torre apilable: lavadora + secadora), 0359. null = unidad vendida.';

-- ── Agregar la segunda máquina con su serie ─────────────────────────────────
create or replace function public.agregar_parte_del_equipo(p_item uuid, p_nombre text, p_serie text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it     record;
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_serie  text := upper(btrim(coalesce(p_serie, '')));
  v_orden  int;
  v_id     uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa, el almacén o Central registran las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  if v_it.parte_de is not null then raise exception 'Agregue la otra máquina desde la unidad principal'; end if;
  if coalesce(v_it.sin_serie, false) then raise exception 'Ese artículo no lleva serie'; end if;
  if v_it.serie is null then raise exception 'Primero registre la serie de la primera máquina'; end if;
  if v_nombre is null then raise exception 'Diga qué máquina es (ej. Secadora)'; end if;
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;
  if (select count(*) from pedido_equipos where parte_de = p_item) >= 3 then
    raise exception 'Esa unidad ya tiene 4 series: revise si no es otra unidad';
  end if;
  if exists (select 1 from pedido_equipos where servicio_id = v_it.servicio_id and upper(btrim(serie)) = v_serie) then
    raise exception 'La serie % ya está en este pedido', v_serie;
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden from pedido_equipos where servicio_id = v_it.servicio_id;
  insert into pedido_equipos (servicio_id, orden, descripcion, sku, en_este_despacho,
    prueba_lista_at, prueba_lista_por, protocolo_ref, es_prueba, parte_de, parte_nombre)
  values (v_it.servicio_id, v_orden, initcap(v_nombre) || ' · ' || v_it.descripcion, v_it.sku, v_it.en_este_despacho,
    v_it.prueba_lista_at, v_it.prueba_lista_por, v_it.protocolo_ref, v_it.es_prueba, p_item, initcap(v_nombre))
  returning id into v_id;

  -- La serie y el parque, por el mismo camino que cualquier máquina.
  perform registrar_serie_del_equipo(v_id, v_serie);
  return v_id;
end $$;

-- ── Quitar una segunda máquina agregada por error (antes del despacho) ──────
create or replace function public.quitar_parte_del_equipo(p_item uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_it record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa, el almacén o Central corrigen las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null or v_it.parte_de is null then raise exception 'Solo se quita una segunda máquina agregada'; end if;
  if exists (select 1 from servicios_postventa where id = v_it.servicio_id and despachado_at is not null) then
    raise exception 'El pedido ya salió del almacén: corrija la serie con el código de operaciones';
  end if;
  delete from pedido_equipos where id = p_item;
  -- La máquina que subió al parque solo por esta fila se va con ella. Si ya
  -- tiene historia (un caso, un mantenimiento), se queda y se avisa.
  if v_it.equipo_id is not null then
    begin
      delete from equipos_instalados
       where id = v_it.equipo_id and servicio_id = v_it.servicio_id and registrado_en = 'pedido'
         and not exists (select 1 from pedido_equipos where equipo_id = v_it.equipo_id);
    exception when foreign_key_violation then
      raise exception 'Esa máquina ya tiene historia en el parque: corrija la serie con el código de operaciones';
    end;
  end if;
end $$;

-- ── Probar y embalar: la prueba de la unidad vale para sus partes ───────────
CREATE OR REPLACE FUNCTION public.almacen_probar_equipo(p_item uuid, p_protocolo_ref text, p_fotos jsonb DEFAULT '[]'::jsonb, p_nota text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_it.parte_de is not null then raise exception 'La torre se prueba desde su unidad principal'; end if;

  update pedido_equipos
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         protocolo_ref = coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), protocolo_ref),
         protocolo_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), protocolo_nota),
         protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb)
   where id = p_item;

  -- Sus partes (0359) quedan probadas con ella.
  update pedido_equipos pe
     set prueba_lista_at = p.prueba_lista_at, prueba_lista_por = p.prueba_lista_por, protocolo_ref = p.protocolo_ref
    from pedido_equipos p
   where p.id = p_item and pe.parte_de = p_item;

  select count(*) into v_pend from pedido_equipos
   where servicio_id = v_it.servicio_id and en_este_despacho and prueba_lista_at is null and parte_de is null;
  if v_pend > 0 then return false; end if;

  -- Todas las que van están probadas: el pedido queda probado y embalado,
  -- con los protocolos de todas (uno por máquina) y sus fotos. La máquina
  -- que se probó sin fotos no aporta un hueco (0300).
  select string_agg(protocolo_ref, ' · ' order by orden),
         coalesce(jsonb_agg(f order by orden) filter (where f is not null and jsonb_typeof(f) <> 'null'), '[]'::jsonb)
    into v_refs, v_fotos
    from pedido_equipos pe
    left join lateral jsonb_array_elements(pe.protocolo_fotos) f on true
   where pe.servicio_id = v_it.servicio_id and pe.en_este_despacho and pe.parte_de is null;
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
$function$;

-- ── Qué va en el despacho: la parte va con su máquina ───────────────────────
CREATE OR REPLACE FUNCTION public.equipo_va_en_este_despacho(p_item uuid, p_va boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Qué va en el despacho lo decide postventa';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  if v_it.parte_de is not null then raise exception 'Esa máquina va con su unidad principal'; end if;
  if exists (select 1 from servicios_postventa where id = v_it.servicio_id and despachado_at is not null) then
    raise exception 'El pedido ya salió del almacén: lo que va, ya fue';
  end if;
  if not p_va and (select count(*) from pedido_equipos where servicio_id = v_it.servicio_id and en_este_despacho and id <> p_item and parte_de is null) = 0 then
    raise exception 'Algún equipo tiene que ir en el despacho';
  end if;
  update pedido_equipos set en_este_despacho = p_va where id = p_item or parte_de = p_item;
end;
$function$;

revoke all on function public.agregar_parte_del_equipo(uuid, text, text) from public, anon;
revoke all on function public.quitar_parte_del_equipo(uuid) from public, anon;
grant execute on function public.agregar_parte_del_equipo(uuid, text, text) to authenticated, service_role;
grant execute on function public.quitar_parte_del_equipo(uuid) to authenticated, service_role;
