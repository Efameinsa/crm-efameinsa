-- ============================================================
-- CRM EFAMEINSA · Migración 0596 · Empresa del Excel, costo y observación en el almacén
-- ============================================================
-- 23-10-2026, Santos:
--  · «tampoco dice de qué empresa; en un rato vamos a subir Efameinsa, que no se vaya a
--    unir»: cada carga es de una empresa (OPEN / EFAMEINSA); sus máquinas la heredan, la
--    revisión abierta de una no reemplaza la de la otra y «las que no vinieron» se miran
--    solo dentro de esa empresa.
--  · «gerencia dijo que sí deben figurar los costos»: cambia la regla del 21-10. El costo va
--    en una tabla APARTE: inventario_equipos lo lee todo el CRM (comerciales incluidas);
--    inventario_costos, solo operaciones y gerencia.
--  · «un espacio para observación… se pondría desde el CRM de cara a almacén».

alter table stock_cargas add column if not exists empresa text;
update stock_cargas set empresa = 'OPEN' where empresa is null;
-- Todo lo cargado hasta hoy vino del Excel de Open.
update inventario_equipos set empresa = 'OPEN' where empresa is null;
alter table inventario_equipos add column if not exists observacion text;

create table if not exists inventario_costos (
  inventario_id uuid primary key references inventario_equipos(id) on delete cascade,
  costo numeric(14,2) not null,
  carga_id uuid references stock_cargas(id) on delete set null,
  updated_at timestamptz not null default now(),
  es_prueba boolean not null default es_cuenta_prueba()
);
alter table inventario_costos enable row level security;
drop policy if exists inventario_costos_lee on inventario_costos;
create policy inventario_costos_lee on inventario_costos for select to authenticated
  using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
drop policy if exists inventario_costos_escribe_i on inventario_costos;
create policy inventario_costos_escribe_i on inventario_costos for insert to authenticated
  with check (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
drop policy if exists inventario_costos_escribe_u on inventario_costos;
create policy inventario_costos_escribe_u on inventario_costos for update to authenticated
  using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
drop policy if exists inventario_costos_escribe_d on inventario_costos;
create policy inventario_costos_escribe_d on inventario_costos for delete to authenticated
  using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));
grant select, insert, update, delete on inventario_costos to authenticated;
revoke all on inventario_costos from anon;

-- La carga sabe de qué empresa es; la revisión abierta solo se reemplaza dentro de la misma empresa.
drop function if exists stock_carga_guardar(text, text[], jsonb, jsonb);
create or replace function stock_carga_guardar(p_archivo text, p_hojas text[], p_filas jsonb, p_ausentes jsonb default '[]'::jsonb, p_empresa text default 'OPEN')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_emp text := upper(btrim(coalesce(p_empresa, 'OPEN')));
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El stock lo sube operaciones';
  end if;
  if v_emp not in ('OPEN', 'EFAMEINSA') then
    raise exception 'Diga de qué empresa es el Excel: Open o Efameinsa';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El Excel no trae máquinas en las hojas de stock';
  end if;
  update stock_cargas set estado = 'reemplazada'
   where estado = 'revisando' and es_prueba = es_cuenta_prueba() and coalesce(empresa, 'OPEN') = v_emp;
  insert into stock_cargas (archivo, hojas, filas, ausentes, empresa)
  values (left(coalesce(nullif(btrim(p_archivo), ''), 'stock.xlsx'), 200), coalesce(p_hojas, '{}'), p_filas, coalesce(p_ausentes, '[]'::jsonb), v_emp)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function stock_carga_guardar(text, text[], jsonb, jsonb, text) to authenticated;

CREATE OR REPLACE FUNCTION public.stock_carga_subir(p_carga uuid, p_sacar_ausentes boolean DEFAULT false, p_indices integer[] DEFAULT NULL::integer[], p_cerrar boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c stock_cargas%rowtype;
  v_f jsonb;
  v_i int;
  v_filas jsonb;
  v_codigo text;
  v_serie text;
  v_prod uuid;
  v_activo boolean;
  v_desc text;
  v_inv inventario_equipos%rowtype;
  v_inv_id uuid;
  v_costo numeric;
  v_cargadas int := 0;
  v_movidas int := 0;
  v_iguales int := 0;
  v_creados text[] := '{}';
  v_retirados text[] := '{}';
  v_ocupadas text[] := '{}';
  v_sin_decidir int := 0;
  v_sacadas int := 0;
  v_ref jsonb := '{}'::jsonb;
  v_k text;
  v_resultado jsonb;
  v_previo jsonb;
  v_n int;
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El stock lo sube operaciones';
  end if;
  select * into v_c from stock_cargas
   where id = p_carga and estado = 'revisando' and es_prueba = es_cuenta_prueba()
   for update;
  if not found then
    raise exception 'Esta carga ya se cerró o fue reemplazada por un Excel más nuevo';
  end if;
  v_filas := v_c.filas;
  v_n := jsonb_array_length(v_filas);

  for v_i in 0 .. v_n - 1 loop
    v_f := v_filas -> v_i;
    if coalesce(v_f->>'decision', 'pendiente') = 'pendiente' then
      v_sin_decidir := v_sin_decidir + 1;
      continue;
    end if;
    continue when v_f->>'decision' <> 'subir';
    continue when coalesce((v_f->>'subida')::boolean, false);
    continue when p_indices is not null and not (v_i = any(p_indices));
    v_codigo := upper(btrim(v_f->>'codigoFinal'));
    continue when v_codigo is null or v_codigo = '';
    v_desc := nullif(btrim(coalesce(v_f->>'descripcion', '')), '');

    select id, activo into v_prod, v_activo from productos where upper(sku) = v_codigo limit 1;
    if v_prod is null then
      insert into productos (sku, marca, modelo, nombre, segmento, categoria, capacidad, activo, ficha)
      values (
        v_codigo,
        coalesce(nullif(btrim(v_f->>'marca'), ''), case when v_f->>'hoja' ilike '%LG%' then 'LG' else 'SIN MARCA' end),
        coalesce(nullif(btrim(v_f->>'modelo'), ''), v_codigo),
        left(coalesce(v_desc, v_f->>'modelo', v_codigo), 300),
        (case when v_f->>'hoja' ilike '%LG%' then 'semi_industrial' else 'industrial' end)::segmento_producto,
        case when v_desc ilike '%LAVADORA%' or v_desc ilike 'LAV%' then 'lavadora'
             when v_desc ilike '%SECADORA%' then 'secadora'
             when v_desc ilike '%RODILLO%' or v_desc ilike '%CALANDRIA%' then 'planchador'
             else null end,
        nullif(btrim(v_f->>'capacidad'), ''),
        false,
        jsonb_build_object(
          'descripcion_maestro', v_desc,
          'falta_ficha', true,
          'origen', jsonb_build_object('stock_importaciones', v_c.archivo, 'creado_desde_stock_at', now()))
      )
      returning id into v_prod;
      v_activo := false;
      v_creados := v_creados || v_codigo;
    end if;
    if not v_activo and not (v_codigo = any(v_creados)) and not (v_codigo = any(v_retirados)) then
      v_retirados := v_retirados || v_codigo;
    end if;

    v_serie := upper(nullif(btrim(coalesce(v_f->>'serie', '')), ''));
    if v_serie is null then
      v_ref := jsonb_set(v_ref, array[v_prod::text], to_jsonb(coalesce((v_ref->>v_prod::text)::int, 0) + coalesce((v_f->>'cantidad')::int, 0)));
      v_filas := jsonb_set(v_filas, array[v_i::text, 'subida'], 'true'::jsonb);
      continue;
    end if;

    select * into v_inv from inventario_equipos
     where upper(serie) = v_serie and estado <> 'baja' and es_prueba = es_cuenta_prueba()
       -- Un correlativo de caja (1, 2, 3…) solo es la misma máquina dentro del mismo código.
       and (v_serie !~ '^\d{1,3}$' or producto_id = v_prod)
     limit 1;
    if not found then
      insert into inventario_equipos (producto_id, serie, estado, ubicacion, ingreso_at, nota,
                                      item_importaciones, descripcion, modelo, capacidad, proveedor, empresa)
      values (v_prod, v_serie, 'disponible', nullif(btrim(v_f->>'ubicacion'), ''),
              coalesce((v_f->>'ingreso')::date, current_date),
              left('Stock de Importaciones · ' || v_c.archivo || coalesce(' · ítem ' || (v_f->>'item'), ''), 300),
              nullif(btrim(v_f->>'item'), ''), left(v_desc, 600), nullif(btrim(v_f->>'modelo'), ''),
              nullif(btrim(v_f->>'capacidad'), ''), nullif(btrim(v_f->>'proveedor'), ''), coalesce(nullif(btrim(v_f->>'empresa'), ''), v_c.empresa))
      returning id into v_inv_id;
      v_cargadas := v_cargadas + 1;
    elsif v_inv.estado <> 'disponible' then
      v_ocupadas := v_ocupadas || v_serie;
    else
      update inventario_equipos set
             producto_id = v_prod,
             ubicacion = coalesce(nullif(btrim(v_f->>'ubicacion'), ''), ubicacion),
             item_importaciones = coalesce(nullif(btrim(v_f->>'item'), ''), item_importaciones),
             descripcion = coalesce(left(v_desc, 600), descripcion),
             modelo = coalesce(nullif(btrim(v_f->>'modelo'), ''), modelo),
             capacidad = coalesce(nullif(btrim(v_f->>'capacidad'), ''), capacidad),
             proveedor = coalesce(nullif(btrim(v_f->>'proveedor'), ''), proveedor),
             empresa = coalesce(nullif(btrim(v_f->>'empresa'), ''), v_c.empresa, empresa)
       where id = v_inv.id;
      v_inv_id := v_inv.id;
      if v_inv.producto_id <> v_prod then v_movidas := v_movidas + 1; else v_iguales := v_iguales + 1; end if;
    end if;
    -- El costo de Importaciones (gerencia 23-10: «sí deben figurar»), en su tabla de acceso restringido.
    if v_inv_id is not null and (v_f->>'costo') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_costo := (v_f->>'costo')::numeric;
      insert into inventario_costos (inventario_id, costo, carga_id, es_prueba)
      values (v_inv_id, round(v_costo, 2), v_c.id, v_c.es_prueba)
      on conflict (inventario_id) do update set costo = excluded.costo, carga_id = excluded.carga_id, updated_at = now();
    end if;
    v_inv_id := null;
    v_filas := jsonb_set(v_filas, array[v_i::text, 'subida'], 'true'::jsonb);
  end loop;

  for v_k in select jsonb_object_keys(v_ref) loop
    update productos set ficha = coalesce(ficha, '{}'::jsonb) || jsonb_build_object('stock_referencia', (v_ref->>v_k)::int)
     where id = v_k::uuid;
  end loop;

  if p_sacar_ausentes then
    update inventario_equipos i
       set estado = 'despachado', salida_at = now(),
           nota = left(coalesce(i.nota || ' · ', '') || 'Ya no vino en el Excel de stock ' || v_c.archivo, 300)
     where i.estado = 'disponible' and i.es_prueba = es_cuenta_prueba()
       -- Cada Excel es de una empresa: el de Efameinsa nunca saca máquinas de Open (Santos 23-10).
       and coalesce(i.empresa, 'OPEN') = coalesce(v_c.empresa, 'OPEN')
       and exists (select 1 from jsonb_array_elements(v_c.ausentes) a
                    where upper(a->>'serie') = upper(i.serie)
                      and (i.serie !~ '^\d{1,3}$'
                           or (select p.sku from productos p where p.id = i.producto_id) is not distinct from a->>'codigo'));
    get diagnostics v_sacadas = row_count;
  end if;

  -- El resultado se acumula: lo que entró al leer más lo que entra al resolver cada observación.
  v_previo := coalesce(v_c.resultado, '{}'::jsonb);
  v_resultado := jsonb_build_object(
    'cargadas', coalesce((v_previo->>'cargadas')::int, 0) + v_cargadas,
    'movidas', coalesce((v_previo->>'movidas')::int, 0) + v_movidas,
    'iguales', coalesce((v_previo->>'iguales')::int, 0) + v_iguales,
    'creados', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (select jsonb_array_elements_text(coalesce(v_previo->'creados', '[]'::jsonb)) union select unnest(v_creados)) s(x)),
    'retirados', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (select jsonb_array_elements_text(coalesce(v_previo->'retirados', '[]'::jsonb)) union select unnest(v_retirados)) s(x)),
    'ocupadas', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (select jsonb_array_elements_text(coalesce(v_previo->'ocupadas', '[]'::jsonb)) union select unnest(v_ocupadas)) s(x)),
    'sinDecidir', v_sin_decidir,
    'referencia', (select count(*) from jsonb_object_keys(v_ref)) + coalesce((v_previo->>'referencia')::int, 0),
    'sacadas', coalesce((v_previo->>'sacadas')::int, 0) + v_sacadas,
    'ultimaSubidaAt', now());

  update stock_cargas
     set filas = v_filas,
         resultado = v_resultado,
         subida_at = coalesce(subida_at, now()),
         subida_por = coalesce(subida_por, auth.uid()),
         estado = case when p_cerrar or v_sin_decidir = 0 then 'subida' else 'revisando' end
   where id = p_carga;
  return v_resultado;
end $function$;
