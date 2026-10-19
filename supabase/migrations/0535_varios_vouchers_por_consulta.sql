-- ═══════════════════════════════════════════════════════════════════════════
-- 0535 · LA CONSULTA DEL PAGO ACEPTA VARIOS VOUCHERS
-- ═══════════════════════════════════════════════════════════════════════════
-- Una comercial, 19-10 (vía Santos): «En pagos, avisar que el cliente ya pagó
-- solo permite poner un voucher. Que permita agregar más vouchers». El cliente
-- suele cancelar en dos o tres depósitos (o manda la constancia y el estado
-- de cuenta). voucher_path sigue siendo el primero (lo que ya existe no
-- cambia); los demás van en vouchers_extra.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.consultas_pago
  add column if not exists vouchers_extra text[] not null default '{}';

drop function if exists public.comercial_consultar_pago(uuid, text, text, text);

create or replace function public.comercial_consultar_pago(
  p_servicio uuid,
  p_tipo text,
  p_voucher text,
  p_nota text default null,
  p_vouchers_extra text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dueno  uuid;
  v_prueba boolean;
  v_id     uuid;
  v_extra  text[] := coalesce(p_vouchers_extra, '{}');
  v_ruta   text;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if p_tipo not in ('comision', 'cancelo') then raise exception 'Tipo de consulta no válido'; end if;

  select i.creado_por, s.es_prueba into v_dueno, v_prueba
    from servicios_postventa s
    left join informes_cierre i on i.id = s.informe_cierre_id
   where s.id = p_servicio;
  if not found or v_prueba <> coalesce(es_cuenta_prueba(), false) then
    raise exception 'Ese pedido no existe';
  end if;
  if v_dueno is distinct from auth.uid()
     and not (coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La consulta del pago la hace el comercial del cierre';
  end if;
  if p_voucher is null or p_voucher !~* ('^pagos-comercial/' || p_servicio::text || '/[^/]+$') then
    raise exception 'Adjunte el voucher del cliente';
  end if;
  if cardinality(v_extra) > 9 then raise exception 'Son 10 vouchers como máximo'; end if;
  foreach v_ruta in array v_extra loop
    if v_ruta is null or v_ruta !~* ('^pagos-comercial/' || p_servicio::text || '/[^/]+$') then
      raise exception 'Uno de los vouchers no tiene una ruta válida';
    end if;
  end loop;

  insert into consultas_pago (servicio_id, tipo, voucher_path, vouchers_extra, nota, creado_por, es_prueba)
  values (p_servicio, p_tipo, p_voucher, v_extra, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), v_prueba)
  returning id into v_id;

  update servicios_postventa
     set pago_solicitado_at = now(), pago_solicitado_por = auth.uid(), updated_at = now()
   where id = p_servicio;

  return v_id;
end $$;

revoke all on function public.comercial_consultar_pago(uuid, text, text, text, text[]) from public;
grant execute on function public.comercial_consultar_pago(uuid, text, text, text, text[]) to authenticated;
