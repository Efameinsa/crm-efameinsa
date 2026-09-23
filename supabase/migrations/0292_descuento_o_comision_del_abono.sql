-- 0292 · EL DESCUENTO O LA COMISIÓN DEL ABONO (Carlos, 23-09 14:58).
--
-- «Tú me pides que confirme 2 600 y tanto; yo te puedo confirmar, pero nos han
-- descontado 50 dólares de comisión… eso lo ve el comercial: lo cuestiona con
-- el cliente, lo cobra y registra el voucher; postventa vuelve a solicitar.»
-- El abono se confirma NETO (lo que entró); la diferencia queda como saldo, que
-- es lo que ya bloquea el despacho. Esto solo deja escrito cuánto y por qué, y
-- a quién le toca (el comercial).
alter table public.pagos_pedido
  add column if not exists descuento_monto  numeric,
  add column if not exists descuento_motivo text;
comment on column public.pagos_pedido.descuento_monto is 'Lo que el banco descontó (comisión) o faltó en este abono; lo cobra el comercial (0292).';

create or replace function public.finanzas_anotar_descuento(p_servicio uuid, p_monto numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago uuid;
begin
  if not (coalesce(es_finanzas(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El descuento lo anota Finanzas';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Escriba cuánto se descontó'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga por qué se descontó (ej.: comisión del banco)'; end if;
  -- El abono que se acaba de confirmar: el último de este pedido registrado por quien anota.
  select id into v_pago from pagos_pedido
   where servicio_id = p_servicio and registrado_por = auth.uid() and created_at > now() - interval '10 minutes'
   order by created_at desc limit 1;
  if v_pago is null then raise exception 'Primero confirme el abono'; end if;
  update pagos_pedido set descuento_monto = p_monto, descuento_motivo = btrim(p_motivo) where id = v_pago;
  return v_pago;
end $$;
revoke all on function public.finanzas_anotar_descuento(uuid, numeric, text) from public;
grant execute on function public.finanzas_anotar_descuento(uuid, numeric, text) to authenticated;
