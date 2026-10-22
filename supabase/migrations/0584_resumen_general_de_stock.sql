-- ============================================================
-- CRM EFAMEINSA · Migración 0584 · El «Resumen general de stock» sale del almacén
-- ============================================================
-- Reunión Santos–Lesly del 22-10-2026 (audio de las 10:08): Importaciones
-- entrega todos los lunes a las comerciales un «Resumen general de stock»
-- impreso, separado por proveedor (Alliance: Primus y Unimac; GMP; Sailstar…),
-- dentro por tipo (lavadoras, secadoras, calandrias) y con el total por
-- proveedor; el de LG va consolidado por modelo con sus totales («la SMG me
-- dijo que se tiene que consolidar o mostrar los totales por modelo»). Lesly:
-- «todo lo que hemos subido debe salir así… dos documentos: uno las
-- industriales y en el caso del LG así», y «yo solamente cargo mi Excel
-- actualizado y generan el reporte».
--
-- Para armarlo desde el almacén hace falta que cada máquina conserve lo que
-- Importaciones escribe de ella: su ítem (I25014), la descripción tal cual, el
-- modelo, la capacidad y el proveedor. Hasta hoy eso se perdía al subir (solo
-- quedaba «ítem I25014» en la nota). Nunca el costo.

alter table inventario_equipos
  add column if not exists item_importaciones text,
  add column if not exists descripcion        text,
  add column if not exists modelo             text,
  add column if not exists capacidad          text,
  add column if not exists proveedor          text;

comment on column inventario_equipos.item_importaciones is 'El código interno de Importaciones (I25014) de esta máquina, como viene en su Excel (0584).';
comment on column inventario_equipos.descripcion is 'La descripción de la máquina tal como la escribe Importaciones: es la que sale en el Resumen general de stock (0584).';
comment on column inventario_equipos.proveedor is 'Proveedor según Importaciones (ALLIANCES LAUNDRY, GMP, SAILSTAR…): el resumen se agrupa por él (0584).';

-- La subida guarda esos datos y los refresca en las máquinas que ya estaban.
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
    if not v_activo and not (v_codigo = any(v_creados)) and not (v_codigo = any(v_retirados)) then
      v_retirados := v_retirados || v_codigo;
    end if;

    v_serie := upper(nullif(btrim(coalesce(v_f->>'serie', '')), ''));
    if v_serie is null then
      v_ref := jsonb_set(v_ref, array[v_prod::text], to_jsonb(coalesce((v_ref->>v_prod::text)::int, 0) + coalesce((v_f->>'cantidad')::int, 0)));
      continue;
    end if;

    select * into v_inv from inventario_equipos
     where upper(serie) = v_serie and estado <> 'baja' and es_prueba = es_cuenta_prueba()
     limit 1;
    if not found then
      insert into inventario_equipos (producto_id, serie, estado, ubicacion, ingreso_at, nota,
                                      item_importaciones, descripcion, modelo, capacidad, proveedor)
      values (v_prod, v_serie, 'disponible', nullif(btrim(v_f->>'ubicacion'), ''),
              coalesce((v_f->>'ingreso')::date, current_date),
              left('Stock de Importaciones · ' || v_c.archivo || coalesce(' · ítem ' || (v_f->>'item'), ''), 300),
              nullif(btrim(v_f->>'item'), ''), left(v_desc, 600), nullif(btrim(v_f->>'modelo'), ''),
              nullif(btrim(v_f->>'capacidad'), ''), nullif(btrim(v_f->>'proveedor'), ''));
      v_cargadas := v_cargadas + 1;
    elsif v_inv.estado <> 'disponible' then
      v_ocupadas := v_ocupadas || v_serie;
    else
      -- Ya estaba: se refresca lo que Importaciones dice hoy de ella (y el código si cambió).
      update inventario_equipos set
             producto_id = v_prod,
             ubicacion = coalesce(nullif(btrim(v_f->>'ubicacion'), ''), ubicacion),
             item_importaciones = coalesce(nullif(btrim(v_f->>'item'), ''), item_importaciones),
             descripcion = coalesce(left(v_desc, 600), descripcion),
             modelo = coalesce(nullif(btrim(v_f->>'modelo'), ''), modelo),
             capacidad = coalesce(nullif(btrim(v_f->>'capacidad'), ''), capacidad),
             proveedor = coalesce(nullif(btrim(v_f->>'proveedor'), ''), proveedor)
       where id = v_inv.id;
      if v_inv.producto_id <> v_prod then v_movidas := v_movidas + 1; else v_iguales := v_iguales + 1; end if;
    end if;
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
