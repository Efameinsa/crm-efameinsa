-- ============================================================
-- CRM EFAMEINSA · Migración 0312 · Cerrar un pedido anterior ya entregado
-- ============================================================
-- Rubí, 26-09, en el pedido de Rojas Damián (venta del 02-06, del Excel): «es
-- una venta pasada y no le enviaron plano de preinstalación; ya está usando su
-- lavadora. ¿Cómo podría hacerlo para seguir los pasos? Puedes poner "Postventa
-- no envió" y una opción para poner su nombre: era otra persona».
--
-- El fondo no es el plano: es que un pedido anterior al circuito ya entregado
-- no tiene pasos que seguir. El cierre en bloque (0273) existe, pero vive en
-- «Cola del Excel» y ella estaba dentro de la ficha. Esta función hace lo mismo
-- para UN pedido desde su ficha, y deja escrito quién lo gestionó en su momento
-- y lo que se sabe, para que el registro no mienta («postventa lo envió») ni
-- quede mudo.
--
-- Mismas reglas que la 0273: solo pedidos del Excel sin completar, solo
-- postventa o backoffice, y la fecha de entrega solo llena `despachado_at`
-- cuando no había una fecha real.

create or replace function public.cerrar_pedido_anterior_entregado(p_id uuid, p_fecha date, p_quien text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s record;
  v_quien text := nullif(btrim(coalesce(p_quien, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_linea text;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo postventa puede cerrar estos pedidos';
  end if;
  if v_quien is null then
    raise exception 'Diga quién gestionó la entrega en su momento (nombre o área)';
  end if;
  if p_fecha is null or p_fecha > current_date then
    raise exception 'Ponga la fecha en que se entregó (no puede ser futura)';
  end if;

  select id, origen, completado, cerrado_at, observaciones into v_s
    from servicios_postventa where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'El pedido no existe'; end if;
  if v_s.origen <> 'excel' then
    raise exception 'Este pedido nació en el CRM: se cierra siguiendo sus pasos, no con este atajo';
  end if;
  if v_s.completado or v_s.cerrado_at is not null then raise exception 'Este pedido ya está cerrado'; end if;

  v_linea := format('[%s] Entregado antes del CRM el %s. Lo gestionó: %s.%s Cerrado por %s.',
    to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY'),
    to_char(p_fecha, 'DD-MM-YYYY'),
    v_quien,
    case when v_nota is null then '' else ' ' || v_nota end,
    coalesce((select nombre from perfiles where id = auth.uid()), 'postventa'));

  update servicios_postventa
     set despachado_at = coalesce(despachado_at, (p_fecha::text || 'T12:00:00-05:00')::timestamptz),
         cerrado_at = now(),
         completado = true,
         observaciones = case when coalesce(btrim(observaciones), '') = '' then v_linea else observaciones || E'\n' || v_linea end
   where id = p_id;
end $$;

revoke all on function public.cerrar_pedido_anterior_entregado(uuid, date, text, text) from public, anon;
grant execute on function public.cerrar_pedido_anterior_entregado(uuid, date, text, text) to authenticated;
