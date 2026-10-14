-- 0486 · EL MOTIVO DE LA GUÍA LO DEFINE CONTABILIDAD (audio de Contabilidad, 14-10, Beneficencia de Huancayo)
--
-- «Postventa solicita guía para traslado del equipo… pero cuando uno emite una
-- guía hay diferentes motivos: venta, traslado o consignación. Postventa ordena
-- la salida; Contabilidad aprueba la emisión de la guía y le dice al almacén
-- por qué motivo; el almacén la ejecuta.»
--   venta        → sale el equipo vendido.
--   traslado     → servicios: se devuelve o se recoge un equipo.
--   consignacion → sale por posible venta.
-- Al autorizar la guía ahora se elige el motivo (obligatorio) y el almacén lo
-- ve en el aviso, en la apertura y en el pedido. Lo demás igual que antes.

alter table public.servicios_postventa
  add column if not exists guia_motivo text
  check (guia_motivo in ('venta', 'traslado', 'consignacion'));

comment on column public.servicios_postventa.guia_motivo is
  'Motivo de la guía de salida que define Contabilidad al autorizarla (0486): venta, traslado o consignacion.';

drop function if exists public.finanzas_confirmar_guia(uuid, text, text, text);

create or replace function public.finanzas_confirmar_guia(
  p_servicio uuid,
  p_nota text default null,
  p_comprobante_tipo text default null,
  p_comprobante_numero text default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s servicios_postventa%rowtype;
  v_tipo text := nullif(btrim(coalesce(p_comprobante_tipo, '')), '');
  v_numero text := nullif(btrim(coalesce(p_comprobante_numero, '')), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if rol_actual()::text not in ('facturacion', 'finanzas', 'gerencia', 'admin') and not coalesce(es_operaciones(), false) then
    raise exception 'La guía la autoriza Contabilidad (o Finanzas, si Contabilidad no está)';
  end if;
  if v_motivo is null then
    raise exception 'Diga el motivo de la guía: venta, traslado o consignación';
  end if;
  if v_motivo not in ('venta', 'traslado', 'consignacion') then
    raise exception 'Motivo de guía no válido: venta, traslado o consignación';
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
         guia_motivo = v_motivo,
         updated_at = now()
   where id = p_servicio;
end $function$;

revoke all on function public.finanzas_confirmar_guia(uuid, text, text, text, text) from public, anon;
grant execute on function public.finanzas_confirmar_guia(uuid, text, text, text, text) to authenticated;
