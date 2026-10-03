-- 0366 · El precio en soles sale tal como se escribió
--
-- 01-10-2026, Gabriela (postventa) cotizando mantenimientos en soles
-- (Presu_982-26): escribía S/ 3,950 y el papel salía S/ 3,949.98; S/ 3,500
-- salía 3,500.01. El cotizador trabaja en dólares (0169): lo escrito en soles
-- se dividía entre el cambio, se guardaba redondeado a 2 decimales y el PDF lo
-- volvía a multiplicar. 3950 / 3.63 = 1088.15 → × 3.63 = 3949.98. Además el
-- campo se reescribía con ese valor mientras ella tecleaba.
--
-- Ahora el renglón guarda también el precio en la moneda del documento, tal
-- como se escribió (`precio_impreso`). Si el renglón va «con IGV», es el
-- precio con IGV; si no, el neto. El PDF imprime ese valor y no reconvierte.
-- Los dólares (precio_unitario) se siguen guardando igual: el maestro, el piso
-- y la aprobación de gerencia siguen siendo en dólares.
--
-- crear_cotizacion y editar_cotizacion se parchan sobre la definición viva
-- (nunca una copia: ver 0074/0091/0233), con conteo de fragmentos.

alter table public.cotizacion_items
  add column if not exists precio_impreso numeric(12,2);

comment on column public.cotizacion_items.precio_impreso is
  'Precio en la moneda impresa (soles) tal como lo escribió el comercial; con IGV si el renglón lleva precio_con_igv. Null en cotizaciones en dólares (0366).';

do $$
declare
  v_fn   text;
  v_def  text;
  v_nueva text;
  v_n    int;
begin
  foreach v_fn in array array['crear_cotizacion', 'editar_cotizacion'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_def is null then
      raise exception '0366: no encontré %', v_fn;
    end if;
    if v_def like '%precio_impreso%' then
      continue;
    end if;

    -- 1. La columna en la lista del insert.
    v_n := (length(v_def) - length(replace(v_def, 'precio_unitario, precio_con_igv, bajo_lista', ''))) / length('precio_unitario, precio_con_igv, bajo_lista');
    if v_n <> 1 then
      raise exception '0366: % tiene % listas de columnas del renglón (esperaba 1)', v_fn, v_n;
    end if;
    v_nueva := replace(v_def, 'precio_unitario, precio_con_igv, bajo_lista', 'precio_unitario, precio_con_igv, precio_impreso, bajo_lista');

    -- 2. El valor, justo después de v_con_igv en los values.
    -- [[:space:]] y no \s: en esta base \s no reemplaza nada (09-09).
    v_n := (select count(*) from regexp_matches(v_nueva, 'v_unitario,[[:space:]]+v_con_igv,', 'g'));
    if v_n <> 1 then
      raise exception '0366: % tiene % bloques de values del renglón (esperaba 1)', v_fn, v_n;
    end if;
    v_nueva := regexp_replace(v_nueva, '(v_unitario,[[:space:]]+v_con_igv,)',
      E'\\1 nullif(v_item->>''precio_impreso'', '''')::numeric,');

    execute v_nueva;
  end loop;
end $$;
