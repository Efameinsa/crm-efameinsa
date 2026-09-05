-- ============================================================
-- CRM EFAMEINSA · Migración 0176 · Al emitir, el informe ata su venta
-- ============================================================
-- Brenda, 05-09: emitió su informe el 04-09 a las 18:28 y en su «Mi día» le
-- siguió apareciendo «Ventas sin informe de cierre». Pedía que se lo borraran.
-- No había nada que borrar: el informe 001-2026 de EFAMEINSA existía, la venta
-- también, con la misma cotización y el mismo cliente. Solo faltaba que
-- estuvieran atados.
--
-- QUÉ SE INVESTIGÓ, Y EN QUÉ QUEDÓ. Desde la 0105 hay dos disparadores que
-- atan informe y venta: uno cuando nace la venta, otro cuando se emite el
-- informe. Se comprobó, en transacciones de ensayo revertidas, que HOY ese
-- mecanismo funciona sobre este mismo caso —emitiendo como administrador y
-- emitiendo con la sesión de Brenda, ata en los dos—. Se descartaron una por
-- una: que el disparador no existiera o estuviera apagado; que la ficha del
-- cliente se hubiera movido después de emitir (la oportunidad no se tocó
-- desde las 18:14); que hubiera más de un informe o más de una venta
-- candidata; que la fecha cayera fuera de la ventana de siete días; que
-- `emitir_informe` no tocara `emitido_at`; y que fuera cosa de permisos o de
-- quién es dueño de las funciones.
--
-- NO SE PUDO DETERMINAR POR QUÉ NO SE DISPARÓ ESA VEZ. Queda dicho así, como
-- un hecho sin explicar y no como una causa conocida.
--
-- QUÉ SE HACE ENTONCES. Dejar de depender de que el disparador se dispare.
-- La emisión ata su venta ella misma, explícitamente, antes de devolver el
-- número. Si el disparador ya lo hizo, no hay nada que hacer y no pasa nada:
-- la operación es idempotente. Es la misma decisión de siempre en este
-- sistema —lo que tiene que quedar garantizado no se deja a un efecto
-- lateral—, y cuesta una línea.
--
-- LAS REGLAS DE ATADO NO CAMBIAN, y siguen siendo prudentes: una sola venta
-- del CRM sin informe, un solo informe emitido sin venta, mismo cliente,
-- menos de siete días de diferencia. Si hay dos candidatos por cualquiera de
-- los dos lados, NO SE ADIVINA: se deja suelto y el aviso de «ventas sin
-- informe» sigue avisando, que es lo correcto.
-- ============================================================

-- ------------------------------------------------------------
-- El atado, ahora con nombre propio y llamable
-- ------------------------------------------------------------
create or replace function public.atar_informe_suelto(p_informe uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inf   informes_cierre%rowtype;
  v_venta ventas%rowtype;
  v_n     integer;
begin
  select * into v_inf from informes_cierre where id = p_informe;
  if not found
     or v_inf.venta_id is not null      -- ya está atado
     or v_inf.emitido_at is null        -- todavía es borrador
     or v_inf.anulado_at is not null    -- anulado: no ata nada
     or v_inf.cuenta_id is null then    -- sin cliente no hay por dónde buscar
    return null;
  end if;

  -- Una sola venta candidata.
  select count(*) into v_n
    from ventas v join oportunidades o on o.id = v.oportunidad_id
   where o.cuenta_id = v_inf.cuenta_id
     and v.origen = 'crm' and v.anulada_at is null
     and abs(v.fecha_venta - v_inf.fecha) <= 7
     and not exists (select 1 from informes_cierre x where x.venta_id = v.id);
  if v_n <> 1 then return null; end if;

  select v.* into v_venta
    from ventas v join oportunidades o on o.id = v.oportunidad_id
   where o.cuenta_id = v_inf.cuenta_id
     and v.origen = 'crm' and v.anulada_at is null
     and abs(v.fecha_venta - v_inf.fecha) <= 7
     and not exists (select 1 from informes_cierre x where x.venta_id = v.id);

  -- Y un solo informe compitiendo por esa venta: si el cliente tiene dos
  -- cierres emitidos esa semana, no se elige por él.
  select count(*) into v_n
    from informes_cierre i
   where i.cuenta_id = v_inf.cuenta_id
     and i.emitido_at is not null and i.anulado_at is null and i.venta_id is null
     and abs(i.fecha - v_venta.fecha_venta) <= 7;
  if v_n <> 1 then return null; end if;

  update informes_cierre set venta_id = v_venta.id
   where id = p_informe and venta_id is null;

  return v_venta.id;
end $function$;

comment on function public.atar_informe_suelto(uuid) is
  'Ata un informe emitido con su venta cuando la pareja es única por los dos lados. Idempotente: si ya está atado no hace nada. Mismas reglas que los disparadores de la 0105 (0176).';


-- ------------------------------------------------------------
-- Y la emisión lo hace ella misma, sin depender del disparador
-- ------------------------------------------------------------
do $$
declare
  v_def    text;
  v_buscar text := 'return lpad(v_correlativo::text, 3, ''0'') || ''-'' || v_informe.anio::text;';
  v_poner  text := 'perform atar_informe_suelto(p_id); return lpad(v_correlativo::text, 3, ''0'') || ''-'' || v_informe.anio::text;';
  v_veces  integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_informe';

  if v_def is null then raise exception '0176: no existe emitir_informe'; end if;

  if position('atar_informe_suelto' in v_def) > 0 then
    raise notice '0176: emitir_informe ya ataba, se deja como está';
    return;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, v_buscar, ''))) / length(v_buscar);
  if v_veces <> 1 then
    raise exception '0176: el fragmento aparece % veces en emitir_informe, se esperaba 1. Revisar a mano.', v_veces;
  end if;

  execute replace(v_def, v_buscar, v_poner);
  raise notice '0176: emitir_informe ahora ata su venta antes de devolver el número';
end $$;
