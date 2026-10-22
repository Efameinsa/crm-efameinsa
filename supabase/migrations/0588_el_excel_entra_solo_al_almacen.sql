-- ============================================================
-- CRM EFAMEINSA · Migración 0588 · El Excel entra solo al almacén; la pantalla muestra observaciones
-- ============================================================
-- Santos, 22-10-2026: «subir uno por uno al menos las verdes no tiene sentido:
-- debería marcar todas para subir de una, o que todas suban en automático y
-- solo señale las observaciones». Y Carlos: «yo solamente cargo mi Excel
-- actualizado y generan el reporte».
--
-- Hasta hoy, leer el Excel dejaba todo en «revisando» y hacía falta un botón
-- más («Subir al almacén») que nadie entendía: la pantalla parecía una lista
-- de tareas y lo verde parecía ya subido sin estarlo. Desde esta migración:
--  · al leer el Excel, lo que está claro (código de Lesly, código nuevo que
--    ella escribió) ENTRA al almacén en el acto;
--  · la carga queda abierta solo por las OBSERVACIONES (falta código, revisar,
--    serie con cliente); cuando se resuelve una, entra sola;
--  · cada fila recuerda si ya entró (`subida`), así una decisión no mete dos
--    veces la misma serie, y «No subir» después de entrar la da de baja.
--
-- Misma función, dos parámetros más: p_indices (solo esas filas) y p_cerrar
-- (cerrar la carga aunque queden observaciones). El resultado se acumula.

create or replace function stock_carga_subir(p_carga uuid, p_sacar_ausentes boolean default false, p_indices int[] default null, p_cerrar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $fn$
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
     limit 1;
    if not found then
      insert into inventario_equipos (producto_id, serie, estado, ubicacion, ingreso_at, nota,
                                      item_importaciones, descripcion, modelo, capacidad, proveedor, empresa)
      values (v_prod, v_serie, 'disponible', nullif(btrim(v_f->>'ubicacion'), ''),
              coalesce((v_f->>'ingreso')::date, current_date),
              left('Stock de Importaciones · ' || v_c.archivo || coalesce(' · ítem ' || (v_f->>'item'), ''), 300),
              nullif(btrim(v_f->>'item'), ''), left(v_desc, 600), nullif(btrim(v_f->>'modelo'), ''),
              nullif(btrim(v_f->>'capacidad'), ''), nullif(btrim(v_f->>'proveedor'), ''), nullif(btrim(v_f->>'empresa'), ''));
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
             empresa = coalesce(nullif(btrim(v_f->>'empresa'), ''), empresa)
       where id = v_inv.id;
      if v_inv.producto_id <> v_prod then v_movidas := v_movidas + 1; else v_iguales := v_iguales + 1; end if;
    end if;
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
       and upper(i.serie) in (select upper(a->>'serie') from jsonb_array_elements(v_c.ausentes) a);
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
end $fn$;

revoke all on function stock_carga_subir(uuid, boolean, int[], boolean) from public;
grant execute on function stock_carga_subir(uuid, boolean, int[], boolean) to authenticated;
-- La firma vieja (uuid, boolean) deja de existir: una sola función.
drop function if exists stock_carga_subir(uuid, boolean);

-- ------------------------------------------------------------
-- Decidir una observación la hace entrar en el acto; «No subir» después de
-- entrar la da de baja (queda el rastro; la serie puede volver a cargarse).
create or replace function stock_carga_decidir(p_carga uuid, p_indices int[], p_decision text, p_codigo text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_filas jsonb;
  v_c stock_cargas%rowtype;
  v_i int;
  v_f jsonb;
  v_codigo text := upper(nullif(btrim(coalesce(p_codigo, '')), ''));
  v_bajas int := 0;
  v_cnt int;
  v_res jsonb := jsonb_build_object('ok', true);
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
  select * into v_c from stock_cargas
   where id = p_carga and estado = 'revisando' and es_prueba = es_cuenta_prueba()
   for update;
  if not found then
    raise exception 'Esta carga ya se cerró o fue reemplazada por un Excel más nuevo';
  end if;
  v_filas := v_c.filas;
  foreach v_i in array coalesce(p_indices, '{}') loop
    if v_i < 0 or v_i >= jsonb_array_length(v_filas) then continue; end if;
    v_f := v_filas -> v_i;
    -- Ya había entrado y ahora no debe estar: se da de baja en el almacén.
    if coalesce((v_f->>'subida')::boolean, false) and p_decision <> 'subir' and nullif(btrim(coalesce(v_f->>'serie', '')), '') is not null then
      update inventario_equipos
         set estado = 'baja', nota = left(coalesce(nota || ' · ', '') || 'Quitada de la carga ' || v_c.archivo, 300)
       where upper(serie) = upper(btrim(v_f->>'serie')) and estado = 'disponible' and es_prueba = es_cuenta_prueba();
      get diagnostics v_cnt = row_count;
      v_bajas := v_bajas + v_cnt;
    end if;
    v_filas := jsonb_set(v_filas, array[v_i::text, 'decision'], to_jsonb(p_decision));
    if v_codigo is not null then
      v_filas := jsonb_set(v_filas, array[v_i::text, 'codigoFinal'], to_jsonb(v_codigo));
    end if;
    if p_decision <> 'subir' then
      v_filas := jsonb_set(v_filas, array[v_i::text, 'subida'], 'false'::jsonb);
    end if;
  end loop;
  update stock_cargas set filas = v_filas where id = p_carga;

  if p_decision = 'subir' then
    v_res := stock_carga_subir(p_carga, false, p_indices, false);
  end if;
  return v_res || jsonb_build_object('bajas', v_bajas);
end $fn$;
