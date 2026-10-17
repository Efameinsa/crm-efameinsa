-- 0534 · LA LIQUIDACIÓN SE GENERA SOLA (reunión 17-10, gerencia con Jhon).
--
-- Gerencia, viendo a Jhon copiar a su plantilla de Excel los datos del pedido:
-- «lo cual no tiene sentido, tiene que ser en automático… va a extraer todos
-- los datos y lo único que tú tienes que hacer ahí, le pones el número de
-- operación». El CRM arma la liquidación con lo que ya tiene (cliente, RUC,
-- pedido, renglones del cierre, series, abonos confirmados con su operación y
-- banco, comisiones, facturas) y Finanzas solo completa lo que no está: la
-- factura de cada abono, la detracción o retención, las letras y una nota.
-- Valida, y la liquidación queda registrada como cualquier otra (Central y
-- Contabilidad reciben el aviso). Cada pago nuevo o factura nueva = otra
-- liquidación (2, 3, 4…), «la misma liquidación seguimos».
--
-- La detracción o retención (servicios): «ha pagado 900, pero 100 se ha
-- retenido… está liquidado y finiquitado. Lo único que está pendiente… cobro
-- de la detracción, pero no quita a que yo, como postventa, continúe mi
-- despacho». Por eso lo retenido cuenta para el despacho.

alter table public.servicios_postventa
  add column if not exists retenido_tipo text,
  add column if not exists retenido_monto numeric,
  add column if not exists retenido_cobrado_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'servicios_postventa_retenido_tipo_check') then
    alter table public.servicios_postventa
      add constraint servicios_postventa_retenido_tipo_check
      check (retenido_tipo is null or retenido_tipo in ('detraccion', 'retencion'));
  end if;
end $$;
comment on column public.servicios_postventa.retenido_monto is
  'Detracción o retención que el cliente no paga a la empresa sino a SUNAT/Banco de la Nación (0534): cuenta como pagado para el despacho.';

alter table public.liquidaciones_pedido
  add column if not exists numero integer,
  add column if not exists generada boolean not null default false,
  add column if not exists datos jsonb;
comment on column public.liquidaciones_pedido.datos is
  'Lo que Finanzas completó al generarla (0534): factura de cada abono, detracción, letras, nota. La siguiente parte de aquí.';

-- Lo retenido cuenta como pagado para el despacho.
create or replace function public.pago_cubre_el_despacho(p_servicio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.informe_cierre_id is null and s.pago_confirmado_at is null and coalesce(s.monto_pagado, 0) = 0 then true
    when coalesce(s.monto, 0) <= 0 then true
    else coalesce(s.monto_pagado, 0) + coalesce(s.retenido_monto, 0) + 0.5
         >= round(s.monto * coalesce(least(greatest(s.pct_antes_despacho, 0), 100), 100) / 100, 2)
  end
  from servicios_postventa s where s.id = p_servicio
$$;

-- Registrar la liquidación generada: la misma regla que la subida a mano
-- (finanzas_registrar_liquidacion) y además su número, lo que Finanzas
-- completó y la detracción o retención del pedido.
create or replace function public.finanzas_registrar_liquidacion_generada(
  p_servicio uuid,
  p_path text,
  p_nombre text,
  p_estado_pago text,
  p_factura text,
  p_nota text,
  p_datos jsonb,
  p_retenido_tipo text,
  p_retenido_monto numeric,
  p_retenido_cobrado boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n integer;
begin
  if p_retenido_tipo is not null and p_retenido_tipo not in ('detraccion', 'retencion') then
    raise exception 'La retención es «detracción» o «retención»';
  end if;
  if p_retenido_tipo is not null and coalesce(p_retenido_monto, 0) <= 0 then
    raise exception 'Escriba el monto de la %', case when p_retenido_tipo = 'detraccion' then 'detracción' else 'retención' end;
  end if;
  perform finanzas_registrar_liquidacion(p_servicio, p_path, p_nombre, p_estado_pago, p_factura, p_nota);

  select id into v_id from liquidaciones_pedido
   where servicio_id = p_servicio and path = p_path order by subida_at desc limit 1;
  select count(*) into v_n from liquidaciones_pedido where servicio_id = p_servicio;
  update liquidaciones_pedido set numero = v_n, generada = true, datos = p_datos where id = v_id;

  update servicios_postventa
     set retenido_tipo = p_retenido_tipo,
         retenido_monto = case when p_retenido_tipo is null then null else round(p_retenido_monto, 2) end,
         retenido_cobrado_at = case
           when p_retenido_tipo is null or not coalesce(p_retenido_cobrado, false) then null
           else coalesce(retenido_cobrado_at, now()) end,
         updated_at = now()
   where id = p_servicio;
  return v_n;
end $$;
revoke all on function public.finanzas_registrar_liquidacion_generada(uuid, text, text, text, text, text, jsonb, text, numeric, boolean) from public, anon;
grant execute on function public.finanzas_registrar_liquidacion_generada(uuid, text, text, text, text, text, jsonb, text, numeric, boolean) to authenticated;
