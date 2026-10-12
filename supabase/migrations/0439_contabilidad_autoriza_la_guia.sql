-- 0439 — LA APERTURA LA AUTORIZA CONTABILIDAD; FINANZAS, SI CONTABILIDAD NO ESTÁ
--
-- Buzón, Jhon (Finanzas), 12-10: «la apertura lo autoriza Contabilidad,
-- Finanzas podría autorizar si en caso no esté Contabilidad (Facturación)».
-- En el CRM, Contabilidad es la cuenta de Facturación (0306, 0331). Hasta acá
-- solo Finanzas (y gerencia/operaciones) podía confirmar la guía; ahora
-- también Contabilidad. Lo demás (comprobante obligatorio, una sola vez, la
-- serie de práctica) queda igual que en la 0384.

create or replace function public.finanzas_confirmar_guia(
  p_servicio uuid,
  p_nota text default null,
  p_comprobante_tipo text default null,
  p_comprobante_numero text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s servicios_postventa%rowtype;
  v_tipo text := nullif(btrim(coalesce(p_comprobante_tipo, '')), '');
  v_numero text := nullif(btrim(coalesce(p_comprobante_numero, '')), '');
begin
  if rol_actual()::text not in ('facturacion', 'finanzas', 'gerencia', 'admin') and not coalesce(es_operaciones(), false) then
    raise exception 'La guía la autoriza Contabilidad (o Finanzas, si Contabilidad no está)';
  end if;
  if v_tipo is null then
    raise exception 'Diga con qué comprobante sale: factura, boleta o sin comprobante todavía';
  end if;
  if v_tipo not in ('factura', 'boleta', 'sin_comprobante') then
    raise exception 'Comprobante no válido: factura, boleta o sin comprobante';
  end if;
  if v_tipo in ('factura', 'boleta') and v_numero is null then
    raise exception 'Escriba el número de la %', v_tipo;
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.apertura_despacho_at is null then raise exception 'Postventa todavía no emitió la apertura de este pedido'; end if;
  if v_s.guia_confirmada_at is not null then raise exception 'La guía de este pedido ya fue confirmada'; end if;
  update servicios_postventa
     set guia_confirmada_at = now(),
         guia_confirmada_por = auth.uid(),
         guia_confirmada_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         guia_comprobante_tipo = v_tipo,
         guia_comprobante_numero = case when v_tipo = 'sin_comprobante' then null else v_numero end,
         updated_at = now()
   where id = p_servicio;
end $$;

grant execute on function public.finanzas_confirmar_guia(uuid, text, text, text) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0439_contabilidad_autoriza_la_guia.sql')
on conflict do nothing;
