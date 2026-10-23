-- ============================================================
-- CRM EFAMEINSA · Migración 0595 · El correlativo de caja también es serie
-- ============================================================
-- 23-10-2026, Santos: las mesas BIMAP salían «sin serie»; el Excel de Lesly les
-- pone 1, 2, 3… en SERIE y así se acordó tratarlas: ese número es su serie
-- mientras no haya serie de placa. Un número de 1 a 3 cifras no es único en la
-- empresa (otra marca puede numerar sus cajas igual), así que vale DENTRO de su
-- código: índice aparte, la subida lo busca con su producto, la baja de ausentes
-- mira el código y un pedido no reserva solo un número que comparten dos códigos.

drop index if exists uq_inventario_serie;
create unique index if not exists uq_inventario_serie
  on inventario_equipos (upper(serie), es_prueba) where estado <> 'baja' and serie !~ '^\d{1,3}$';
create unique index if not exists uq_inventario_correlativo
  on inventario_equipos (producto_id, upper(serie), es_prueba) where estado <> 'baja' and serie ~ '^\d{1,3}$';

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

CREATE OR REPLACE FUNCTION public.inventario_sigue_la_serie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
begin
  -- Se quitó, se cambió o se borró la línea: la máquina que tenía vuelve a estar disponible.
  if tg_op in ('UPDATE', 'DELETE') and old.serie is not null and (tg_op = 'DELETE' or new.serie is distinct from old.serie) then
    update inventario_equipos
       set estado = 'disponible', servicio_id = null, pedido_equipo_id = null,
           reservado_para = null, reservado_at = null, reservado_por = null,
           nota = left(coalesce(nota || ' · ', '') || 'Liberada del pedido el ' || to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY'), 300)
     where pedido_equipo_id = old.id and estado = 'reservado';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  -- Se puso una serie: si esa máquina está disponible en el almacén, queda para este pedido.
  if new.serie is not null and coalesce(new.sin_serie, false) = false and (tg_op = 'INSERT' or new.serie is distinct from old.serie)
     -- Un correlativo de caja (1, 2, 3…) que comparten dos códigos no dice qué máquina es: no se reserva sola.
     and (btrim(new.serie) !~ '^\d{1,3}$'
          or (select count(*) from inventario_equipos
               where upper(serie) = upper(btrim(new.serie)) and estado in ('disponible', 'reservado') and es_prueba = new.es_prueba) <= 1) then
    select id, cuenta_id, despachado_at, informe_cierre_id into v_s from servicios_postventa where id = new.servicio_id;
    if v_s.despachado_at is not null then
      -- La serie se registró después de la salida (pasa con pedidos viejos): ya no está en planta.
      update inventario_equipos
         set estado = 'despachado', servicio_id = v_s.id, pedido_equipo_id = new.id,
             salida_at = coalesce(salida_at, v_s.despachado_at), informe_cierre_id = coalesce(informe_cierre_id, v_s.informe_cierre_id)
       where upper(serie) = upper(new.serie) and estado in ('disponible', 'reservado') and es_prueba = new.es_prueba;
    else
      update inventario_equipos
         set estado = 'reservado', servicio_id = v_s.id, pedido_equipo_id = new.id,
             reservado_para = v_s.cuenta_id, reservado_at = now(), reservado_por = auth.uid()
       where upper(serie) = upper(new.serie) and estado = 'disponible' and es_prueba = new.es_prueba;
    end if;
  end if;
  return new;
end $function$;
