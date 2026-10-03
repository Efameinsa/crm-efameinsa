-- 0384 — FINANZAS AUTORIZA LA GUÍA Y DICE CON QUÉ COMPROBANTE
--
-- Lesly, 02-10 (lista de mejoras): «las aperturas que se generan en postventa
-- deben llegar a Finanzas para que puedan confirmar y brindar la aprobación
-- para la guía de almacén». Y en la reunión de las 18:21: «que ellos, dándonos
-- un clic, digan sí, procede con la emisión de la guía, y si tiene factura o
-- boleta, nos pongan los números».
--
-- La confirmación ya existía (0308), pero el aviso a Finanzas solo salía
-- cuando postventa además pulsaba «enviar al almacén»; al emitir la apertura
-- le llegaba al almacén y no a Finanzas (Tomy Jiro, PED-0006-2026, 01-10).
-- Eso se arregla en el código. Acá: el comprobante que acompaña a la guía.

alter table public.servicios_postventa
  add column if not exists guia_comprobante_tipo text
    check (guia_comprobante_tipo in ('factura', 'boleta', 'sin_comprobante')),
  add column if not exists guia_comprobante_numero text;

comment on column public.servicios_postventa.guia_comprobante_tipo is
  'Con qué comprobante autorizó Finanzas la guía (0384): factura, boleta o sin comprobante todavía.';
comment on column public.servicios_postventa.guia_comprobante_numero is
  'El número o los números del comprobante (0384), tal como los escribe Finanzas: «F001-1234», «B001-55, B001-56».';

drop function if exists public.finanzas_confirmar_guia(uuid, text);

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
  if rol_actual()::text not in ('finanzas', 'gerencia', 'admin') and not coalesce(es_operaciones(), false) then
    raise exception 'La guía la confirma Finanzas';
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

insert into _migraciones_aplicadas (archivo) values ('0384_finanzas_autoriza_la_guia_con_comprobante.sql')
on conflict do nothing;
