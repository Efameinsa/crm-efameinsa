-- ============================================================================
-- 0127 · La llave de gerencia deja de ser ambigua
--
-- QUÉ PASÓ (gerencia, 29-08). El ingeniero abre una cotización con un precio
-- por debajo de lo óptimo, quiere rechazarla y no puede: abajo le sale
-- «Solo gerencia aprueba precios bajo lista».
--
-- QUÉ SE ENCONTRÓ AL MIRARLO. Las dos cuentas de gerencia —kycabrejos y
-- crcabrejos— tienen el rol correcto y pasan el control: se probó entrando con
-- sus sesiones reales contra la cotización que está esperando, y la base las
-- deja pasar. O sea que ese aviso solo puede salir si el clic salió de una
-- sesión que en ese momento NO era de gerencia (la pantalla quedó abierta en
-- una pestaña y en el navegador se entró con otra cuenta, que es rutina acá:
-- el ingeniero revisa entrando con la cuenta de cada quien). El problema real
-- entonces no es el permiso: es que el aviso no dice ni quién está entrando ni
-- qué hacer, y deja a alguien que SÍ tiene la llave creyendo que no la tiene.
--
-- Y AL MIRARLO APARECIÓ ALGO PEOR. `es_backoffice()` devuelve NULL —no false—
-- cuando quien pregunta no tiene perfil, porque `null in ('gerencia','admin')`
-- es null. Y en plpgsql `if not null then` NO entra. Resultado: el control
--
--     if not es_backoffice() then raise exception ...
--
-- deja pasar a quien no tiene perfil. Se comprobó contra producción: una
-- llamada SIN NINGUNA SESIÓN atraviesa el control de gerencia de
-- `resolver_aprobacion_cotizacion` (llega hasta «faltan equipos por decidir»).
-- La clave anónima vive en el navegador de cualquiera, así que eso alcanzaba
-- para aprobar descuentos sin ser nadie. Hay CATORCE funciones con ese mismo
-- control —crear_cotizacion, registrar_venta, emitir_informe, reasignar_cartera
-- y las demás—, y todas se arreglan de una sola vez acá.
--
-- Las políticas RLS que usan `es_backoffice()` no cambian de conducta: en un
-- `using (...)`, null ya se trataba como false.
-- ============================================================================

-- 1. Que la respuesta sea sí o no, nunca «no se sabe».
create or replace function es_backoffice()   -- gerencia o admin: ven todo
returns boolean language sql stable security definer as $$
  select coalesce(rol_actual() in ('gerencia', 'admin'), false)
$$;

-- 2. Y que la negativa diga quién está entrando y qué hacer.
--
-- El aviso largo es a propósito, como el resto de los de la casa: quien lo lee
-- está mirando la pantalla con el cliente esperando, y «no puede» a secas lo
-- deja adivinando si le falta un permiso o si se equivocó de cuenta.
create or replace function resolver_aprobacion_cotizacion(
  p_cotizacion_id uuid,
  p_aprobados     uuid[],
  p_rechazados    uuid[],
  p_nota          text default null
)
returns estado_aprobacion
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cot         cotizaciones%rowtype;
  v_sin_decidir integer;
  v_resultado   estado_aprobacion;
  v_quien       text;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if not es_backoffice() then
    select coalesce(nombre, 'sin nombre') || ' (' || rol::text || ')'
      into v_quien
      from perfiles where id = auth.uid();
    if v_quien is null then
      raise exception 'Su sesión se cerró. Vuelva a entrar con la cuenta de gerencia y la cotización sigue esperando acá.';
    end if;
    raise exception 'Los precios bajo lista los aprueba gerencia, y esta sesión es de %. Cierre sesión y entre con la cuenta de gerencia: la cotización queda esperando.', v_quien;
  end if;

  if v_cot.estado_aprobacion <> 'pendiente_gerencia' then
    raise exception 'Esta cotización ya fue resuelta';
  end if;

  select count(*) into v_sin_decidir
    from cotizacion_items ci
   where ci.cotizacion_id = p_cotizacion_id
     and ci.requiere_aprobacion
     and not (ci.id = any(coalesce(p_aprobados, '{}'::uuid[])))
     and not (ci.id = any(coalesce(p_rechazados, '{}'::uuid[])));
  if v_sin_decidir > 0 then
    raise exception 'Faltan % equipo(s) por aprobar o rechazar', v_sin_decidir;
  end if;

  update cotizacion_items set aprobado = true
   where cotizacion_id = p_cotizacion_id and id = any(coalesce(p_aprobados, '{}'::uuid[]));
  update cotizacion_items set aprobado = false
   where cotizacion_id = p_cotizacion_id and id = any(coalesce(p_rechazados, '{}'::uuid[]));

  v_resultado := (case
    when coalesce(array_length(p_rechazados, 1), 0) > 0 then 'rechazada_gerencia'
    else 'aprobada_gerencia'
  end)::estado_aprobacion;

  update cotizaciones
     set estado_aprobacion = v_resultado,
         aprobada_por      = auth.uid(),
         aprobada_at       = now(),
         nota_gerencia     = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_cotizacion_id;

  return v_resultado;
end;
$fn$;
