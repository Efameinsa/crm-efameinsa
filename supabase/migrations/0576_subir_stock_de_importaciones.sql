-- ============================================================
-- CRM EFAMEINSA · Migración 0576 · Subir el stock de Importaciones, codificado
-- ============================================================
-- Lesly y el ing. (audios del 21-10-2026): Lesly codificaba a mano el Excel de
-- stock de Importaciones y se le duplicaban códigos. «Subimos esta plantilla y
-- que haya alguna opción que nos diga: a este sí le pertenece este código, a
-- este no… y qué es lo que falta codificar, y que cree el código tentativo. Y
-- que tú veas: esta me gusta, y queda».
--
-- CÓMO VA. La pantalla lee el Excel y propone un código por máquina
-- (src/lib/stock-importaciones.ts). La propuesta se guarda acá, en una
-- «carga», para que Lesly la revise con calma —puede cerrar y volver—. Cuando
-- termina, «Subir al almacén» crea una fila de `inventario_equipos` (0117) por
-- máquina, con su serie. Ese almacén ya es lo que muestran «Stock de equipos»
-- del comercial y el cotizador como «en almacén».
--
-- LOS COSTOS NO ENTRAN. La pantalla no lee la columna COSTO y esta tabla no
-- tiene dónde guardarlo: «no tienen nada que hacer en el CRM esos costos».
--
-- UN CÓDIGO NUEVO = UN PRODUCTO EN PREPARACIÓN. Si Lesly acepta un código
-- tentativo, se crea el producto RETIRADO (activo = false): sin ficha Word ni
-- precio no se puede cotizar (regla del 28-08), pero ya tiene sus máquinas en
-- el almacén. Lesly le pone la ficha y lo activa desde el catálogo.

create table if not exists stock_cargas (
  id           uuid primary key default gen_random_uuid(),
  archivo      text not null,
  hojas        text[] not null default '{}',
  -- Una entrada por máquina: lo que dice el Excel (sin costo), lo que propone
  -- el CRM y lo que decide Lesly (decision: pendiente | subir | no_subir,
  -- codigoFinal).
  filas        jsonb not null,
  -- Máquinas que están disponibles en el almacén y no vinieron en este Excel.
  ausentes     jsonb not null default '[]'::jsonb,
  estado       text not null default 'revisando' check (estado in ('revisando', 'subida', 'reemplazada')),
  resultado    jsonb,
  creada_por   uuid references perfiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  subida_at    timestamptz,
  subida_por   uuid references perfiles(id),
  es_prueba    boolean not null default es_cuenta_prueba()
);

comment on table stock_cargas is
  'Cada Excel de stock de Importaciones subido por operaciones, con la propuesta de código por máquina y la decisión de Lesly (0576). Nunca guarda costos.';

drop trigger if exists trg_stock_cargas_updated on stock_cargas;
create trigger trg_stock_cargas_updated before update on stock_cargas
  for each row execute function set_updated_at();

alter table stock_cargas enable row level security;

drop policy if exists stock_cargas_lectura on stock_cargas;
create policy stock_cargas_lectura on stock_cargas for select to authenticated
using (((select es_operaciones()) or (select es_backoffice())) and es_prueba = (select es_cuenta_prueba()));

revoke all on stock_cargas from anon;
grant select on stock_cargas to authenticated;
grant all on stock_cargas to service_role;

-- ------------------------------------------------------------
-- Guardar la propuesta. Una sola carga «revisando» a la vez: la anterior que
-- no se subió queda reemplazada (sigue ahí para mirar).
create or replace function stock_carga_guardar(p_archivo text, p_hojas text[], p_filas jsonb, p_ausentes jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El stock lo sube operaciones';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El Excel no trae máquinas en las hojas de stock';
  end if;
  update stock_cargas set estado = 'reemplazada'
   where estado = 'revisando' and es_prueba = es_cuenta_prueba();
  insert into stock_cargas (archivo, hojas, filas, ausentes)
  values (left(coalesce(nullif(btrim(p_archivo), ''), 'stock.xlsx'), 200), coalesce(p_hojas, '{}'), p_filas, coalesce(p_ausentes, '[]'::jsonb))
  returning id into v_id;
  return v_id;
end $fn$;

-- ------------------------------------------------------------
-- Decidir sobre varias máquinas a la vez (un grupo de iguales).
create or replace function stock_carga_decidir(p_carga uuid, p_indices int[], p_decision text, p_codigo text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_filas jsonb;
  v_i int;
  v_codigo text := upper(nullif(btrim(coalesce(p_codigo, '')), ''));
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El stock lo sube operaciones';
  end if;
  if p_decision not in ('pendiente', 'subir', 'no_subir') then
    raise exception 'Decisión inválida';
  end if;
  if p_decision = 'subir' and v_codigo is null then
    raise exception 'Para subirla hace falta el código';
  end if;
  if v_codigo is not null and v_codigo !~ '^[A-Z0-9][A-Z0-9\-]{1,24}$' then
    raise exception 'El código solo lleva letras, números y guion (ej. SECU753)';
  end if;

  select filas into v_filas from stock_cargas
   where id = p_carga and estado = 'revisando' and es_prueba = es_cuenta_prueba()
   for update;
  if v_filas is null then
    raise exception 'Esta carga ya se subió o fue reemplazada por un Excel más nuevo';
  end if;

  foreach v_i in array coalesce(p_indices, '{}') loop
    if v_i < 0 or v_i >= jsonb_array_length(v_filas) then continue; end if;
    v_filas := jsonb_set(v_filas, array[v_i::text, 'decision'], to_jsonb(p_decision));
    if v_codigo is not null then
      v_filas := jsonb_set(v_filas, array[v_i::text, 'codigoFinal'], to_jsonb(v_codigo));
    end if;
  end loop;

  update stock_cargas set filas = v_filas where id = p_carga;
  return jsonb_build_object('ok', true);
end $fn$;

-- ------------------------------------------------------------
-- Subir al almacén lo que Lesly marcó «subir».
create or replace function stock_carga_subir(p_carga uuid, p_sacar_ausentes boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_c stock_cargas%rowtype;
  v_f jsonb;
  v_codigo text;
  v_serie text;
  v_prod uuid;
  v_activo boolean;
  v_desc text;
  v_inv inventario_equipos%rowtype;
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
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El stock lo sube operaciones';
  end if;
  select * into v_c from stock_cargas
   where id = p_carga and estado = 'revisando' and es_prueba = es_cuenta_prueba()
   for update;
  if not found then
    raise exception 'Esta carga ya se subió o fue reemplazada por un Excel más nuevo';
  end if;

  for v_f in select value from jsonb_array_elements(v_c.filas) loop
    if coalesce(v_f->>'decision', 'pendiente') = 'pendiente' then
      v_sin_decidir := v_sin_decidir + 1;
      continue;
    end if;
    continue when v_f->>'decision' <> 'subir';

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
    -- Un código retirado recibe sus máquinas, pero no se reactiva solo: eso es
    -- de Lesly en el catálogo, cuando tenga ficha.
    if not v_activo and not (v_codigo = any(v_creados)) and not (v_codigo = any(v_retirados)) then
      v_retirados := v_retirados || v_codigo;
    end if;

    v_serie := upper(nullif(btrim(coalesce(v_f->>'serie', '')), ''));
    if v_serie is null then
      -- Sin serie (coches, accesorios): cuenta como stock de referencia del código.
      v_ref := jsonb_set(v_ref, array[v_prod::text], to_jsonb(coalesce((v_ref->>v_prod::text)::int, 0) + coalesce((v_f->>'cantidad')::int, 0)));
      continue;
    end if;

    select * into v_inv from inventario_equipos
     where upper(serie) = v_serie and estado <> 'baja' and es_prueba = es_cuenta_prueba()
     limit 1;
    if not found then
      insert into inventario_equipos (producto_id, serie, estado, ubicacion, ingreso_at, nota)
      values (v_prod, v_serie, 'disponible', nullif(btrim(v_f->>'ubicacion'), ''),
              coalesce((v_f->>'ingreso')::date, current_date),
              left('Stock de Importaciones · ' || v_c.archivo || coalesce(' · ítem ' || (v_f->>'item'), ''), 300));
      v_cargadas := v_cargadas + 1;
    elsif v_inv.estado <> 'disponible' then
      v_ocupadas := v_ocupadas || v_serie;
    elsif v_inv.producto_id <> v_prod then
      update inventario_equipos set producto_id = v_prod,
             ubicacion = coalesce(nullif(btrim(v_f->>'ubicacion'), ''), ubicacion)
       where id = v_inv.id;
      v_movidas := v_movidas + 1;
    else
      v_iguales := v_iguales + 1;
    end if;
  end loop;

  for v_k in select jsonb_object_keys(v_ref) loop
    update productos set ficha = coalesce(ficha, '{}'::jsonb) || jsonb_build_object('stock_referencia', (v_ref->>v_k)::int)
     where id = v_k::uuid;
  end loop;

  -- Las que estaban disponibles y ya no vienen en el Excel: salieron.
  if p_sacar_ausentes then
    update inventario_equipos i
       set estado = 'despachado', salida_at = now(),
           nota = left(coalesce(i.nota || ' · ', '') || 'Ya no vino en el Excel de stock ' || v_c.archivo, 300)
     where i.estado = 'disponible' and i.es_prueba = es_cuenta_prueba()
       and upper(i.serie) in (select upper(a->>'serie') from jsonb_array_elements(v_c.ausentes) a);
    get diagnostics v_sacadas = row_count;
  end if;

  v_resultado := jsonb_build_object(
    'cargadas', v_cargadas, 'movidas', v_movidas, 'iguales', v_iguales,
    'creados', to_jsonb(v_creados), 'retirados', to_jsonb(v_retirados),
    'ocupadas', to_jsonb(v_ocupadas), 'sinDecidir', v_sin_decidir,
    'referencia', (select count(*) from jsonb_object_keys(v_ref)), 'sacadas', v_sacadas);

  update stock_cargas set estado = 'subida', subida_at = now(), subida_por = auth.uid(), resultado = v_resultado
   where id = p_carga;
  return v_resultado;
end $fn$;

revoke all on function stock_carga_guardar(text, text[], jsonb, jsonb) from public;
revoke all on function stock_carga_decidir(uuid, int[], text, text) from public;
revoke all on function stock_carga_subir(uuid, boolean) from public;
grant execute on function stock_carga_guardar(text, text[], jsonb, jsonb) to authenticated;
grant execute on function stock_carga_decidir(uuid, int[], text, text) to authenticated;
grant execute on function stock_carga_subir(uuid, boolean) to authenticated;

-- La réplica nube ↔ local (piloto 24-09): las tablas nuevas no la heredan.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.stock_cargas';
    execute 'create trigger zz_sync after insert or update or delete on public.stock_cargas for each row execute function sync.capturar(''id'')';
  end if;
end $$;
