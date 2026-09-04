-- ============================================================
-- CRM EFAMEINSA · Migración 0169 · Cotizar en soles
-- ============================================================
-- Pedido de Santos el 04-09-2026: «para todos, que tengan la opción de cotizar
-- en soles; que al momento de cotizar haya una opción para poder hacerlo en
-- soles y automáticamente hacer la conversión».
--
-- CÓMO SE RESUELVE, Y POR QUÉ ASÍ
-- El CRM entero trabaja en dólares: el maestro de precios de Lesly está en
-- dólares, el piso de precio y la aprobación de gerencia comparan dólares, las
-- metas de los comerciales, el panel de gerencia, el estado de resultados y el
-- histórico de precios por cliente son dólares. Convertir lo GUARDADO rompería
-- todo eso de golpe: un ítem de S/ 3.800 comparado contra un piso de US$ 1.000
-- pasaría el control de precio mínimo siempre.
--
-- Por eso la conversión es del DOCUMENTO, no de la contabilidad interna:
--   · `moneda` y todos los importes siguen guardándose en dólares. Ningún
--     tablero, meta ni comparación cambia.
--   · `moneda_impresa` dice en qué moneda se le entregó el papel al cliente.
--   · `tipo_cambio` congela el valor con el que se hizo esa conversión, para
--     que el PDF de dentro de seis meses diga lo mismo que el que se envió
--     —la misma regla del precio congelado en el ítem (0126)—.
-- El PDF y la pantalla multiplican al mostrar. La cotización en soles es, en
-- el fondo, la misma cotización vista con otro lente.
--
-- EL TIPO DE CAMBIO LO FIJA GERENCIA, no el comercial: sale del parámetro
-- `tc_usd_pen` que ya existe (hoy 3.75) y que gerencia mantiene. Es la misma
-- doctrina de los precios: el comercial no inventa el número.
-- ============================================================

alter table cotizaciones
  add column if not exists moneda_impresa moneda not null default 'USD',
  add column if not exists tipo_cambio numeric(6,4);

comment on column cotizaciones.moneda_impresa is
  'Moneda en la que se imprimió el documento para el cliente. Los importes de la fila siguen en dólares (columna moneda): esta solo cambia cómo se muestra.';
comment on column cotizaciones.tipo_cambio is
  'Tipo de cambio USD→PEN congelado al emitir, cuando moneda_impresa es PEN. Nulo en las de dólares.';

alter table cotizaciones drop constraint if exists cotizaciones_tc_coherente;
alter table cotizaciones add constraint cotizaciones_tc_coherente check (
  (moneda_impresa = 'USD' and tipo_cambio is null)
  or (moneda_impresa = 'PEN' and tipo_cambio is not null and tipo_cambio > 0)
);

-- ============================================================
-- Las dos funciones del cotizador reciben la moneda del documento
-- ============================================================
-- Se parchean sobre la definición VIVA con `replace`, nunca copiando el cuerpo
-- entero: copiarlo revivió tres veces reglas que ya se habían revertido
-- (memoria «no copiar crear/editar_cotizacion»). Como cambia la firma, hay que
-- borrar la anterior: dos versiones con parámetros por defecto dejarían la
-- llamada ambigua.
do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'crear_cotizacion' limit 1;
  if v_def is null then raise exception 'No existe la función crear_cotizacion'; end if;
  if v_def like '%p_moneda_impresa%' then
    raise notice 'crear_cotizacion ya recibe la moneda; no se toca';
    return;
  end if;

  v_nuevo := replace(v_def,
    'p_condiciones text DEFAULT NULL::text, p_vigencia_dias integer DEFAULT 15)',
    'p_condiciones text DEFAULT NULL::text, p_vigencia_dias integer DEFAULT 15, p_moneda_impresa moneda DEFAULT ''USD''::moneda, p_tipo_cambio numeric DEFAULT NULL::numeric)');
  if v_nuevo = v_def then raise exception 'No se encontró la firma de crear_cotizacion'; end if;
  v_def := v_nuevo;

  -- La validación, apenas entra: si el papel va en soles, el tipo de cambio es
  -- obligatorio y positivo. Si va en dólares, no se guarda ninguno.
  v_nuevo := replace(v_def,
    E'  if jsonb_array_length(p_items) = 0 then\n    raise exception \'La cotización necesita al menos un producto\';\n  end if;',
    E'  if jsonb_array_length(p_items) = 0 then\n    raise exception \'La cotización necesita al menos un producto\';\n  end if;\n' ||
    E'  if p_moneda_impresa = \'PEN\' and coalesce(p_tipo_cambio, 0) <= 0 then\n' ||
    E'    raise exception \'Para cotizar en soles hace falta el tipo de cambio que fija gerencia\';\n' ||
    E'  end if;');
  if v_nuevo = v_def then raise exception 'No se encontró la validación de items en crear_cotizacion'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def,
    E'    subtotal, total, estado_aprobacion\n  )',
    E'    subtotal, total, estado_aprobacion, moneda_impresa, tipo_cambio\n  )');
  if v_nuevo = v_def then raise exception 'No se encontró la lista de columnas de crear_cotizacion'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def,
    E'    (case when v_alguno_requiere then \'pendiente_gerencia\' else \'auto_aprobada\' end)::estado_aprobacion\n  )\n  returning id into v_cotizacion_id;',
    E'    (case when v_alguno_requiere then \'pendiente_gerencia\' else \'auto_aprobada\' end)::estado_aprobacion,\n' ||
    E'    p_moneda_impresa,\n' ||
    E'    case when p_moneda_impresa = \'PEN\' then p_tipo_cambio end\n  )\n  returning id into v_cotizacion_id;');
  if v_nuevo = v_def then raise exception 'No se encontró el values de crear_cotizacion'; end if;

  drop function if exists crear_cotizacion(uuid, serie_cotizacion, jsonb, text, integer);
  execute v_nuevo;
end $$;

do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'editar_cotizacion' limit 1;
  if v_def is null then raise exception 'No existe la función editar_cotizacion'; end if;
  if v_def like '%p_moneda_impresa%' then
    raise notice 'editar_cotizacion ya recibe la moneda; no se toca';
    return;
  end if;

  v_nuevo := replace(v_def,
    'p_condiciones text DEFAULT NULL::text, p_vigencia_dias integer DEFAULT 15)',
    'p_condiciones text DEFAULT NULL::text, p_vigencia_dias integer DEFAULT 15, p_moneda_impresa moneda DEFAULT NULL::moneda, p_tipo_cambio numeric DEFAULT NULL::numeric)');
  if v_nuevo = v_def then raise exception 'No se encontró la firma de editar_cotizacion'; end if;
  v_def := v_nuevo;

  -- Nulo significa «no la cambies»: el borrador que se guarda cada rato no
  -- tiene por qué reenviar la moneda en cada autoguardado.
  v_nuevo := replace(v_def,
    E'    condiciones       = coalesce(p_condiciones, condiciones),',
    E'    condiciones       = coalesce(p_condiciones, condiciones),\n' ||
    E'    moneda_impresa    = coalesce(p_moneda_impresa, moneda_impresa),\n' ||
    E'    tipo_cambio       = case\n' ||
    E'      when p_moneda_impresa is null then tipo_cambio\n' ||
    E'      when p_moneda_impresa = \'PEN\' then coalesce(p_tipo_cambio, tipo_cambio)\n' ||
    E'      else null end,');
  if v_nuevo = v_def then raise exception 'No se encontró el update de editar_cotizacion'; end if;

  drop function if exists editar_cotizacion(uuid, jsonb, text, integer);
  execute v_nuevo;
end $$;
