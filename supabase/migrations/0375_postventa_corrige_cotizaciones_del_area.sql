-- 0375 · Postventa corrige las cotizaciones que hizo en expedientes del área
--
-- 02-10-2026, Gabriela (Postventa 2): quiso corregir la Presu_990-26 de
-- AGRICOLA HUARMEY y le salió «Esta cotización no es suya». La 0323 dejó que
-- cualquiera del área cotice, edite y emita en un expediente de postventa
-- (están a nombre de Rubí), pero la corrección de una cotización ya emitida
-- (0123) siguió preguntando solo por el dueño del expediente o backoffice.
--
-- Solo cambia la comprobación de quién: ahora usa `puede_cotizar_en`, la
-- misma de crear y emitir. Los frenos (cierre emitido, borrador) y el código
-- de autorización siguen igual. `abrir_correccion_cotizacion` y
-- `corregir_cotizacion_emitida` pasan por esta función o por el solicitante,
-- así que no hace falta tocarlas.

CREATE OR REPLACE FUNCTION public.frenos_correccion_cotizacion(p_cotizacion uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cot      cotizaciones;
  v_cierre   record;
  v_equipos  integer := 0;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion;
  if not found then
    return jsonb_build_object('puede', false, 'motivo', 'Esa cotización no existe');
  end if;

  -- La misma regla que para cotizar (0323): el dueño, backoffice, o
  -- cualquiera del área en un expediente de postventa (0375).
  if not puede_cotizar_en(v_cot.oportunidad_id) then
    return jsonb_build_object('puede', false, 'motivo', 'Esta cotización no es suya');
  end if;

  -- Un borrador se edita sin pedirle permiso a nadie: no gastó número.
  if v_cot.correlativo is null or v_cot.enviada_at is null then
    return jsonb_build_object(
      'puede', false,
      'motivo', 'Todavía es un borrador: se edita sin autorización, desde el cotizador');
  end if;

  -- FRENO 1. Cambiar el monto de algo ya vendido descuadra el cierre y el
  -- récord del comercial. Primero se anula el cierre —procedimiento que ya
  -- existe (0114)— y después se corrige.
  select i.id, i.codigo, i.serie into v_cierre
    from informes_cierre i
   where i.cotizacion_id = p_cotizacion
     and i.emitido_at is not null
     and i.anulado_at is null
   limit 1;

  if v_cierre.id is not null then
    -- FRENO 3, que en la práctica viaja con el 1: postventa solo arranca
    -- después del cierre. Cambiar el equipo del papel no cambia la máquina que
    -- va en el camión, así que se dice cuántas ya están comprometidas.
    select count(*) into v_equipos
      from equipos_instalados e where e.informe_cierre_id = v_cierre.id;

    return jsonb_build_object(
      'puede', false,
      'motivo', format(
        'Esta cotización ya tiene el cierre de venta N.º %s emitido%s. Anule primero el cierre y después corrija.',
        v_cierre.codigo,
        case when v_equipos > 0
             then format(', y postventa ya tiene %s equipo(s) con su serie', v_equipos)
             else '' end),
      'cierre_codigo', v_cierre.codigo);
  end if;

  return jsonb_build_object(
    'puede', true,
    'codigo', v_cot.codigo,
    'serie', v_cot.serie,
    'version', v_cot.version,
    'total', v_cot.total,
    'moneda', v_cot.moneda);
end;
$function$;
