-- ============================================================
-- CRM EFAMEINSA · Migración 0233 · El renglón puede pactarse CON IGV incluido
-- ============================================================
-- Reunión 14-09 (audio de Carlos revisando Aprobaciones). La venta se cerró
-- en cifras redondas con IGV: «3.600 la lavadora, 1.600 la secadora: 8.800».
-- Para meterlas al cotizador la comercial divide a mano entre 1,18 y tipea el
-- neto a dos decimales. Se le fue un dedo (1.355,92 por 1.355,93) y el
-- borrador de Brenda salió en 8.799,99; «la otra vez con Katherine también,
-- con Brenda también… mejor un check y te calcula».
--
-- QUÉ CAMBIA
--   · `cotizacion_items.precio_con_igv`: el precio unitario negociado CON IGV.
--     Cuando viene, el NETO lo calcula la base (round(bruto / 1,18, 2)) y no
--     el comercial: se acabó el dedazo. `precio_unitario` sigue siendo el neto
--     a dos decimales que siempre se imprimió.
--   · La comparación con el precio de lista tolera USD 1 en esos renglones:
--     3.600 con IGV son 3.050,85 netos, y contra una lista de 3.051 eso NO es
--     un descuento que gerencia tenga que aprobar, es redondeo.
--   · Los informes de cierre: `importe_informe_con_igv()` suma los importes
--     brutos exactos de los renglones pactados con IGV, y la corrección del
--     cierre emitido recalcula `monto_total` con ella (no con neto × 1,18,
--     que por dos lavadoras de 3.600 devuelve 7.200,01).
--
-- El total con IGV de un documento con renglones pactados es la SUMA DE LOS
-- IMPORTES BRUTOS; el IGV es lo que falta entre subtotal y total. Un documento
-- sin renglones pactados se calcula exactamente como antes.
--
-- Las funciones vivas se parchan con replace y verificación de cuántas veces
-- aparece el fragmento (patrón 0174/0232); nunca copiando el cuerpo
-- (crm-no-copiar-funciones-cotizacion: copiarlas revivió reglas 3 veces).
-- ============================================================

alter table cotizacion_items
  add column if not exists precio_con_igv numeric(12,2)
    check (precio_con_igv is null or precio_con_igv >= 0);

comment on column cotizacion_items.precio_con_igv is
  'Precio unitario negociado CON IGV incluido, cuando el renglón se pactó así (0233). El neto (precio_unitario) lo calcula la base: round(precio_con_igv / 1.18, 2). NULL = se cotizó neto, como siempre.';

-- ------------------------------------------------------------
-- Ayuda: parchar una función viva reemplazando TODAS las apariciones,
-- solo si aparecen exactamente las veces esperadas.
-- ------------------------------------------------------------
create or replace function public._parche_0233(
  p_funcion text,
  p_buscar  text,
  p_poner   text,
  p_veces   integer
) returns void
language plpgsql
as $function$
declare
  v_def   text;
  v_veces integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_funcion;
  if v_def is null then
    raise exception '0233: no existe la función %', p_funcion;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, p_buscar, ''))) / length(p_buscar);
  if v_veces = p_veces then
    execute replace(v_def, p_buscar, p_poner);
    raise notice '0233: % parchada (% reemplazos)', p_funcion, v_veces;
  elsif position(p_poner in v_def) > 0 then
    raise notice '0233: % ya tenía el parche, se deja como está', p_funcion;
  else
    raise exception '0233: en % el fragmento aparece % veces, se esperaban %. El cuerpo cambió: revisar a mano. Fragmento: %',
      p_funcion, v_veces, p_veces, left(p_buscar, 60);
  end if;
end $function$;

-- ------------------------------------------------------------
-- 1. crear_cotizacion
-- ------------------------------------------------------------
-- a) variables
select public._parche_0233('crear_cotizacion',
  $q$  v_subtotal          numeric(12,2) := 0;$q$,
  $q$  v_subtotal          numeric(12,2) := 0;
  v_con_igv           numeric;   -- precio pactado con IGV (0233)
  v_unitario          numeric;   -- el neto que se guarda e imprime$q$, 1);

-- b) el neto sale de v_unitario en las 4 lecturas (bajo_lista, subtotal, insert)
select public._parche_0233('crear_cotizacion',
  $q$(v_item->>'precio_unitario')::numeric$q$,
  $q$v_unitario$q$, 4);

-- c) se calcula al arrancar cada vuelta (dos bucles)
select public._parche_0233('crear_cotizacion',
  $q$    v_precio_piso := null;$q$,
  $q$    v_precio_piso := null;
    v_con_igv := nullif(v_item->>'precio_con_igv', '')::numeric;
    v_unitario := case when v_con_igv is not null then round(v_con_igv / 1.18, 2)
                       else (v_item->>'precio_unitario')::numeric end;$q$, 2);

-- d) tolerancia de USD 1 cuando se pactó con IGV (dos bucles)
select public._parche_0233('crear_cotizacion',
  $q$v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso;$q$,
  $q$v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);$q$, 2);

-- e) la columna nueva en el insert
select public._parche_0233('crear_cotizacion',
  $q$precio_lista, precio_unitario, bajo_lista, requiere_aprobacion, color$q$,
  $q$precio_lista, precio_unitario, precio_con_igv, bajo_lista, requiere_aprobacion, color$q$, 1);
select public._parche_0233('crear_cotizacion',
  $q$      v_precio_piso,
      v_unitario,
      v_bajo_lista,$q$,
  $q$      v_precio_piso,
      v_unitario,
      v_con_igv,
      v_bajo_lista,$q$, 1);

-- ------------------------------------------------------------
-- 2. editar_cotizacion (mismo parche; un solo bucle)
-- ------------------------------------------------------------
select public._parche_0233('editar_cotizacion',
  $q$  v_descripcion  text;$q$,
  $q$  v_descripcion  text;
  v_con_igv      numeric;   -- precio pactado con IGV (0233)
  v_unitario     numeric;   -- el neto que se guarda e imprime$q$, 1);

select public._parche_0233('editar_cotizacion',
  $q$(v_item->>'precio_unitario')::numeric$q$,
  $q$v_unitario$q$, 4);

select public._parche_0233('editar_cotizacion',
  $q$    v_precio_piso := null;$q$,
  $q$    v_precio_piso := null;
    v_con_igv := nullif(v_item->>'precio_con_igv', '')::numeric;
    v_unitario := case when v_con_igv is not null then round(v_con_igv / 1.18, 2)
                       else (v_item->>'precio_unitario')::numeric end;$q$, 1);

select public._parche_0233('editar_cotizacion',
  $q$v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso;$q$,
  $q$v_bajo_lista := v_precio_piso is not null and v_unitario < v_precio_piso - (case when v_con_igv is not null then 1 else 0 end);$q$, 1);

select public._parche_0233('editar_cotizacion',
  $q$precio_lista, precio_unitario, bajo_lista, requiere_aprobacion, color, aprobado$q$,
  $q$precio_lista, precio_unitario, precio_con_igv, bajo_lista, requiere_aprobacion, color, aprobado$q$, 1);
select public._parche_0233('editar_cotizacion',
  $q$      v_precio_piso,
      v_unitario,
      v_bajo_lista,$q$,
  $q$      v_precio_piso,
      v_unitario,
      v_con_igv,
      v_bajo_lista,$q$, 1);

-- ------------------------------------------------------------
-- 3. El importe CON IGV de un informe de cierre
-- ------------------------------------------------------------
create or replace function public.importe_informe_con_igv(p_items jsonb)
returns numeric
language sql
immutable
as $function$
  select coalesce(round(sum(
           case when nullif(i->>'precio_con_igv', '') is not null
                then (i->>'cantidad')::numeric * (i->>'precio_con_igv')::numeric
                else (i->>'cantidad')::numeric * (i->>'precio_unitario')::numeric * 1.18
           end), 2), 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where coalesce(i->>'bloque', 'venta') <> 'gratuito'
$function$;

comment on function public.importe_informe_con_igv(jsonb) is
  'Total CON IGV de los renglones vendidos: importe bruto exacto de los pactados con IGV, neto × 1,18 de los demás (0233). Es lo que se cobra.';

-- La corrección del cierre emitido recalcula el monto con la misma regla.
select public._parche_0233('corregir_informe_emitido',
  $q$v_monto   := round(v_sin_igv * 1.18, 2);$q$,
  $q$v_monto   := importe_informe_con_igv(v_items);$q$, 1);

drop function public._parche_0233(text, text, text, integer);
