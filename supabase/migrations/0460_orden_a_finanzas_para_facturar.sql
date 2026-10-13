-- 0460 · LA ORDEN A FINANZAS PARA FACTURAR Y COBRAR (reunión de postventa 13-10 11:20)
--
-- Carlos, con AGROCASAGRANDE (2.ª visita de puesta en marcha que el cierre
-- cobra aparte): «el 99 % me paga primero y luego lo atiendo; el 1 % es este
-- tipo: voy, viajo, invierto y luego te cobro. En esa segunda alternativa
-- termino todo, te envío el informe y le digo: oye Finanzas, ahora sí procede a
-- facturar y cobrar. Tenemos que tener esa parte». Hoy postventa le manda un
-- correo a Contabilidad «sin más detalles».
--
-- Es el último paso del circuito de los pedidos que no se cobran completos
-- antes de salir (crédito, o adelanto con saldo después): postventa da la
-- orden desde el pedido y a Finanzas le llega con el cliente, el cierre y lo
-- que falta cobrar. Finanzas la marca atendida. Aparte de la confirmación de
-- abono (0295), que sigue igual para cada pago.

alter table public.servicios_postventa
  add column if not exists orden_facturar_at timestamptz,
  add column if not exists orden_facturar_por uuid references public.perfiles(id),
  add column if not exists orden_facturar_nota text,
  add column if not exists orden_facturar_atendida_at timestamptz,
  add column if not exists orden_facturar_atendida_por uuid references public.perfiles(id);

comment on column public.servicios_postventa.orden_facturar_at is
  'Postventa terminó el servicio y le ordenó a Finanzas facturar y cobrar el saldo (0460).';
comment on column public.servicios_postventa.orden_facturar_atendida_at is
  'Finanzas atendió la orden de facturar (0460).';

create or replace function public.postventa_orden_facturar(p_servicio uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La orden de facturar la da postventa';
  end if;
  update servicios_postventa
     set orden_facturar_at = now(),
         orden_facturar_por = auth.uid(),
         orden_facturar_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         -- Volver a darla (se corrigió algo) la deja pendiente otra vez.
         orden_facturar_atendida_at = null,
         orden_facturar_atendida_por = null,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

create or replace function public.finanzas_atender_orden_facturar(p_servicio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(es_finanzas(), false) or rol_actual() = 'facturacion' or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La orden de facturar la atiende Finanzas';
  end if;
  update servicios_postventa
     set orden_facturar_atendida_at = now(), orden_facturar_atendida_por = auth.uid(), updated_at = now()
   where id = p_servicio and orden_facturar_at is not null;
  if not found then raise exception 'Ese pedido no tiene una orden de facturar'; end if;
end $$;

revoke all on function public.postventa_orden_facturar(uuid, text) from public;
revoke all on function public.finanzas_atender_orden_facturar(uuid) from public;
grant execute on function public.postventa_orden_facturar(uuid, text) to authenticated;
grant execute on function public.finanzas_atender_orden_facturar(uuid) to authenticated;
