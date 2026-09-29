-- 0331 · La factura se marca como enviada al cliente
--
-- 29-09-2026, gerente con Finanzas y Contabilidad (audio de las 11:35): «una
-- es la emisión de la factura y la otra es el envío al cliente. Que no
-- solamente haya sido subida al CRM, sino también un check de enviado».
-- Contabilidad (la cuenta de Facturación) registra la factura como hasta hoy
-- y, cuando la manda al cliente, la marca. Se puede desmarcar si fue un error.

alter table public.facturas_pedido
  add column if not exists enviada_cliente_at timestamptz,
  add column if not exists enviada_cliente_por uuid references public.perfiles(id);

create or replace function public.facturacion_marcar_enviada(p_factura uuid, p_enviada boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_f facturas_pedido%rowtype;
begin
  -- Mismo control que registrar la factura (facturacion_registrar_factura).
  if rol_actual()::text not in ('facturacion', 'finanzas', 'gerencia', 'admin') then
    raise exception 'La factura la marca Facturación';
  end if;
  select * into v_f from facturas_pedido
   where id = p_factura and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_f.id is null then raise exception 'Esa factura no existe'; end if;

  if coalesce(p_enviada, true) then
    update facturas_pedido
       set enviada_cliente_at = coalesce(enviada_cliente_at, now()),
           enviada_cliente_por = coalesce(enviada_cliente_por, auth.uid())
     where id = p_factura;
  else
    update facturas_pedido set enviada_cliente_at = null, enviada_cliente_por = null where id = p_factura;
  end if;
end $$;

revoke all on function public.facturacion_marcar_enviada(uuid, boolean) from public, anon;
grant execute on function public.facturacion_marcar_enviada(uuid, boolean) to authenticated, service_role;
