-- CIERRE MASIVO DE LOS PEDIDOS «ANTERIORES AL CIRCUITO» (ítem 10, 22-09).
--
-- Rubí tiene ~59 filas del Excel que ya se entregaron pero nadie les marcó
-- el check porque no traen el flujo digital de los pedidos nacidos en el
-- CRM. Este cierre es a propósito simple: solo entregado + cerrado, con la
-- fecha que ella escoja — y esa fecha SOLO llena `despachado_at` cuando el
-- pedido no traía ya una fecha real de antes (no se pisa un dato bueno con
-- la fecha genérica del cierre masivo).

create or replace function cerrar_pedidos_excel_en_bloque(p_ids uuid[], p_fecha date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_solicitante uuid := auth.uid();
  v_cerrados integer;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo postventa puede cerrar estos pedidos';
  end if;

  update servicios_postventa
     set despachado_at = coalesce(despachado_at, (p_fecha::text || 'T12:00:00-05:00')::timestamptz),
         cerrado_at = now(),
         completado = true
   where id = any(p_ids)
     and origen = 'excel'
     and completado = false;
  get diagnostics v_cerrados = row_count;

  return v_cerrados;
end;
$function$;

revoke all on function cerrar_pedidos_excel_en_bloque(uuid[], date) from public;
grant execute on function cerrar_pedidos_excel_en_bloque(uuid[], date) to authenticated;
