-- ============================================================
-- CRM EFAMEINSA · Migración 0174 · Lo anulado no cuenta en NINGUNA métrica
-- ============================================================
-- Reportado por Santos el 05-09: «la señorita Katerine C5 tiene un cierre
-- anulado de ayer, pero todavía le sigue contabilizando en sus métricas
-- semanales».
--
-- La regla es de Carlos y es vieja: «si no lo anulas va a sumar a su record»
-- (28-08, migración 0110). Lo que fallaba no era la anulación: el cierre
-- 011-2026 y su venta quedaron correctamente anulados el 04-09 a las 17:49,
-- la oportunidad volvió a seguimiento y el 014-2026 nuevo ya está emitido.
-- Lo que fallaba era el CONTEO.
--
-- POR QUÉ SE ESCAPÓ. Existe una prueba que vigila esto exactamente
-- (src/lib/ventas-anuladas.test.ts): recorre el código y exige que toda
-- consulta a `ventas` filtre las anuladas o declare por escrito que no. Está
-- verde y hace bien su trabajo — pero SOLO LEE TYPESCRIPT. Las métricas no
-- se calculan en TypeScript: se calculan en funciones y en una vista de la
-- base, donde la prueba no llega. Es el agujero que quedó documentado esta
-- misma mañana en el informe de arquitectura: 5 332 líneas de PL/pgSQL sin
-- una sola prueba automática. Este es el primer caso concreto que produce.
--
-- CUÁNTO SE ESTABA CONTANDO DE MÁS. Katerine, semana del 31-08 al 05-09:
--   se veía   4 ventas · 9 934,07 USD
--   es        3 ventas · 7 684,07 USD
--   la diferencia son los 2 250,00 USD del cierre anulado.
--
-- LOS CUATRO LUGARES, Y A QUÉ PANTALLA ALIMENTA CADA UNO
--   1. v_ventas_detalle        → tablero de gerencia (resumen_gerencia) y el
--                                de marketing (finanzas_marketing): monto
--                                vendido, número de ventas, ticket promedio,
--                                ranking por comercial y vía de adquisición.
--   2. reporte_diario_comercial→ el reporte del día de cada comercial, y la
--                                suma de la semana que sale de él.
--   3. supervision_diaria      → el tablero de supervisión de gerencia. Cuenta
--                                mal DOS cosas: el monto vendido y los
--                                informes emitidos.
--   4. grupo_economico_def     → lo que un cliente lleva comprado, en su ficha
--                                y en la de todas las sedes de su mismo RUC.
--
-- LO QUE NO SE TOCA, A PROPÓSITO
--   · siguiente_correlativo_informe TIENE que ver los anulados: justamente
--     para saltar esos números y no reutilizarlos.
--   · historial_cuenta los muestra tachados: la venta anulada pasó, y el
--     registro del cliente la conserva. Es registro, no métrica.
--   · emitir_informe, corregir_informe_emitido, liberar_pedido_postventa y
--     agregar_adjuntos_cierre_sellado buscan UN informe por su id para
--     actuar sobre él; no cuentan nada.
--
-- Las funciones se parchan sobre la definición VIVA con replace, nunca
-- copiando el cuerpo (crm-no-copiar-funciones-cotizacion: copiarlas revivió
-- reglas ya revertidas tres veces). Cada parche verifica que el fragmento
-- aparezca EXACTAMENTE UNA VEZ antes de tocar nada: si el cuerpo cambió, la
-- migración se detiene en vez de aplicar un parche a ciegas.
-- ============================================================

-- ------------------------------------------------------------
-- Ayuda: parchar una función viva, con verificación
-- ------------------------------------------------------------
create or replace function public._parche_0174(
  p_funcion text,
  p_buscar  text,
  p_poner   text
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
    raise exception '0174: no existe la función %', p_funcion;
  end if;

  if position(p_poner in v_def) > 0 then
    raise notice '0174: % ya estaba parchada, se deja como está', p_funcion;
    return;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, p_buscar, ''))) / length(p_buscar);
  if v_veces <> 1 then
    raise exception '0174: en % el fragmento aparece % veces, se esperaba 1. El cuerpo cambió: revisar a mano.',
      p_funcion, v_veces;
  end if;

  execute replace(v_def, p_buscar, p_poner);
  raise notice '0174: % parchada', p_funcion;
end $function$;


-- ------------------------------------------------------------
-- 1. LA VISTA. De acá come todo el tablero de gerencia.
-- ------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_viewdef('public.v_ventas_detalle'::regclass, true) into v_def;

  if v_def like '%anulada_at%' then
    raise notice '0174: v_ventas_detalle ya filtraba, se deja como está';
  else
    -- La vista no tiene WHERE hoy: la condición se añade al final. Si algún
    -- día lo tuviera, esto fallaría ruidosamente al ejecutar, que es lo que
    -- se quiere.
    execute 'create or replace view public.v_ventas_detalle as '
         || rtrim(btrim(v_def), ';')
         || ' where v.anulada_at is null';
    raise notice '0174: v_ventas_detalle ahora descarta las ventas anuladas';
  end if;
end $$;

comment on view public.v_ventas_detalle is
  'Ventas VIVAS con su comercial, cliente y vía de adquisición. Descarta las anuladas desde la 0174: es la fuente de las métricas, no del registro. Para ver una venta anulada, ir a la tabla ventas o al historial de la cuenta.';


-- ------------------------------------------------------------
-- 2. EL REPORTE DIARIO DEL COMERCIAL
-- ------------------------------------------------------------
select public._parche_0174(
  'reporte_diario_comercial',
  'where o.comercial_id = p_comercial and v.fecha_venta = v_fecha;',
  'where o.comercial_id = p_comercial and v.fecha_venta = v_fecha and v.anulada_at is null;'
);


-- ------------------------------------------------------------
-- 3. LA SUPERVISIÓN DIARIA. Dos cuentas mal: el monto y los informes.
-- ------------------------------------------------------------
select public._parche_0174(
  'supervision_diaria',
  'where o3.comercial_id = p.id and o3.origen = ''crm'' and v.fecha_venta = v_fecha',
  'where o3.comercial_id = p.id and o3.origen = ''crm'' and v.fecha_venta = v_fecha and v.anulada_at is null'
);

select public._parche_0174(
  'supervision_diaria',
  'and (i.emitido_at at time zone ''America/Lima'')::date = v_fecha',
  'and (i.emitido_at at time zone ''America/Lima'')::date = v_fecha and i.anulado_at is null'
);


-- ------------------------------------------------------------
-- 4. LO QUE EL CLIENTE LLEVA COMPRADO, en su ficha y en la de sus sedes
-- ------------------------------------------------------------
select public._parche_0174(
  'grupo_economico_def',
  '(select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id)',
  '(select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id and v.anulada_at is null)'
);

select public._parche_0174(
  'grupo_economico_def',
  '(select coalesce(sum(v.monto_total), 0) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id)',
  '(select coalesce(sum(v.monto_total), 0) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id and v.anulada_at is null)'
);


-- ------------------------------------------------------------
-- La ayuda no se queda viviendo en la base
-- ------------------------------------------------------------
drop function public._parche_0174(text, text, text);
