-- 0521: DESCUENTO AL FINAL DEL TOTAL de la cotización.
--
-- Katerine (C5, 16-10): «gerencia me indica que se ubique en el final del
-- total una opción de digitar descuento o descuento por paquete especial».
-- Hasta hoy la única forma de bajar el precio era tocar el unitario de cada
-- equipo; un paquete (lavadora + secadora a un precio cerrado) no se podía
-- mostrar como tal.
--
-- Cómo queda:
--   · cotizaciones.descuento_escrito: el monto tal como lo escribió la
--     comercial, en la moneda del papel (dólares o soles, como el renglón 0366);
--   · descuento_con_igv: si ese monto incluye IGV (como el check del renglón, 0233);
--   · descuento_motivo: el rótulo que sale en el PDF («DESCUENTO» o
--     «DESCUENTO POR PAQUETE ESPECIAL»);
--   · descuento_monto: el mismo descuento SIN IGV y en dólares, el que resta
--     del total guardado (embudo, monto de la oportunidad, cierre);
--   · descuento_aprobado: el descuento que gerencia ya firmó.
-- Todo descuento al final pasa por gerencia (como una línea a mano, 0440): el
-- correlativo solo se gasta con el visto bueno. El que ya firmó no se vuelve a
-- pedir mientras no cambie.
--
-- editar_cotizacion y resolver_aprobacion_cotizacion se parchan sobre la
-- definición viva (nunca se copian: ver la nota de la 0091).

alter table public.cotizaciones
  add column if not exists descuento_escrito  numeric(14,2),
  add column if not exists descuento_con_igv  boolean not null default false,
  add column if not exists descuento_motivo   text,
  add column if not exists descuento_monto    numeric(14,2) not null default 0,
  add column if not exists descuento_aprobado numeric(14,2);

do $$ begin
  alter table public.cotizaciones
    add constraint cotizaciones_descuento_check check (descuento_monto >= 0 and coalesce(descuento_escrito, 0) >= 0);
exception when duplicate_object then null; end $$;

comment on column public.cotizaciones.descuento_escrito is 'Descuento al final del total, tal como se escribió (moneda del papel). 0521.';
comment on column public.cotizaciones.descuento_monto is 'Ese descuento sin IGV y en dólares; total = subtotal - descuento_monto. 0521.';
comment on column public.cotizaciones.descuento_aprobado is 'El descuento_monto que gerencia aprobó (no se vuelve a pedir). 0521.';

-- El descuento escrito, pasado a dólares sin IGV.
create or replace function public.descuento_neto_usd(p_escrito numeric, p_con_igv boolean, p_moneda moneda, p_tc numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_escrito, 0) <= 0 then 0
    else round(
      (case when p_con_igv then round(p_escrito / 1.18, 2) else p_escrito end)
      / (case when p_moneda = 'PEN' and coalesce(p_tc, 0) > 0 then p_tc else 1 end), 2)
  end
$$;

-- ── editar_cotizacion: el total descuenta, y el descuento pide gerencia ──
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef('public.editar_cotizacion'::regproc) into v_def;
  if v_def like '%descuento_neto_usd%' then
    raise notice 'editar_cotizacion ya tenía el descuento';
    return;
  end if;
  v_nuevo := v_def;

  -- 1) variable
  if position('v_kit          jsonb;' in v_nuevo) = 0 then raise exception '0521: no encontré la declaración de v_kit'; end if;
  v_nuevo := replace(v_nuevo, 'v_kit          jsonb;', 'v_kit          jsonb;
  v_desc         numeric := 0;   -- descuento al final, sin IGV y en dólares (0521)');

  -- 2) cálculo, justo antes de guardar los totales
  if position('  update cotizaciones set
    subtotal          = v_subtotal,
    total             = v_subtotal,' in v_nuevo) = 0 then raise exception '0521: no encontré el update de totales'; end if;
  v_nuevo := replace(v_nuevo, '  update cotizaciones set
    subtotal          = v_subtotal,
    total             = v_subtotal,', '  -- DESCUENTO AL FINAL (0521): se recalcula con la moneda y el cambio que
  -- quedan; si ya no cabe (se quitaron equipos), se quita. Mientras no sea el
  -- que gerencia ya firmó, pide su visto bueno.
  v_desc := descuento_neto_usd(v_cot.descuento_escrito, v_cot.descuento_con_igv,
    coalesce(p_moneda_impresa, v_cot.moneda_impresa),
    case when p_moneda_impresa is null then v_cot.tipo_cambio
         when p_moneda_impresa = ''PEN'' then coalesce(p_tipo_cambio, v_cot.tipo_cambio) else null end);
  if v_desc >= v_subtotal then v_desc := 0; end if;
  if v_desc > 0 then
    v_hay_requiere := true;
    if v_cot.descuento_aprobado is distinct from v_desc
       and coalesce(current_setting(''app.corrigiendo_cotizacion'', true), '''') <> ''si'' then
      v_hay_requiere_nuevo := true;
    end if;
  end if;

  update cotizaciones set
    subtotal          = v_subtotal,
    total             = v_subtotal - v_desc,
    descuento_monto   = v_desc,
    descuento_escrito = case when v_desc > 0 then descuento_escrito end,
    descuento_motivo  = case when v_desc > 0 then descuento_motivo end,');

  -- 3) el monto de la oportunidad sigue al total con descuento
  if position('update oportunidades set monto_estimado = v_subtotal' in v_nuevo) = 0 then raise exception '0521: no encontré monto_estimado'; end if;
  v_nuevo := replace(v_nuevo, 'update oportunidades set monto_estimado = v_subtotal', 'update oportunidades set monto_estimado = v_subtotal - v_desc');

  execute v_nuevo;
end $$;

-- ── resolver_aprobacion_cotizacion: aprobar firma también el descuento ──
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.resolver_aprobacion_cotizacion'::regproc) into v_def;
  if v_def like '%descuento_aprobado%' then
    raise notice 'resolver_aprobacion_cotizacion ya firmaba el descuento';
    return;
  end if;
  if position('         nota_gerencia     = nullif(btrim(coalesce(p_nota, '''')), '''')
   where id = p_cotizacion_id;' in v_def) = 0 then raise exception '0521: no encontré el update de resolver_aprobacion'; end if;
  v_def := replace(v_def, '         nota_gerencia     = nullif(btrim(coalesce(p_nota, '''')), '''')
   where id = p_cotizacion_id;', '         nota_gerencia     = nullif(btrim(coalesce(p_nota, '''')), ''''),
         -- 0521: el descuento al final queda firmado con la aprobación
         descuento_aprobado = case when v_resultado = ''aprobada_gerencia'' and descuento_monto > 0
                                   then descuento_monto else descuento_aprobado end
   where id = p_cotizacion_id;');
  execute v_def;
end $$;

-- ── emitir_cotizacion: freno de seguridad, sin descuento sin firmar ──
do $$
declare
  v_def text;
  v_ancla text := '  if v_cot.estado_aprobacion = ''rechazada_gerencia'' then
    raise exception ''Gerencia rechazó los precios de esta cotización; corríjala antes de enviarla'';';
begin
  select pg_get_functiondef('public.emitir_cotizacion'::regproc) into v_def;
  if v_def like '%descuento_aprobado%' then
    raise notice 'emitir_cotizacion ya frenaba el descuento';
    return;
  end if;
  if position(v_ancla in v_def) = 0 then raise exception '0521: no encontré el freno de rechazada en emitir_cotizacion'; end if;
  v_def := replace(v_def, v_ancla, '  -- 0521: el descuento al final solo sale con el visto bueno de gerencia.
  if coalesce(v_cot.descuento_monto, 0) > 0 and v_cot.descuento_aprobado is distinct from v_cot.descuento_monto then
    raise exception ''El descuento al final del total pasa por gerencia: pida la aprobación antes de confirmarla'';
  end if;
' || v_ancla);
  execute v_def;
end $$;

-- ── Poner, cambiar o quitar el descuento de un borrador ──
create or replace function public.fijar_descuento_cotizacion(
  p_cotizacion_id uuid,
  p_escrito numeric,
  p_con_igv boolean default false,
  p_motivo text default null
) returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cot  cotizaciones;
  v_desc numeric;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id for update;
  if not found then raise exception 'La cotización no existe'; end if;
  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Duplíquela para hacer una versión nueva.';
  end if;
  if v_cot.estado_aprobacion = 'rechazada_gerencia' then
    raise exception 'Gerencia rechazó esta cotización y queda como histórico con su motivo. Haga una cotización nueva.';
  end if;
  if not exists (select 1 from oportunidades o where o.id = v_cot.oportunidad_id and puede_cotizar_en(o.id)) then
    raise exception 'Solo el comercial dueño de la oportunidad puede editar su cotización';
  end if;
  if coalesce(p_escrito, 0) < 0 then raise exception 'El descuento no puede ser negativo'; end if;

  v_desc := descuento_neto_usd(p_escrito, coalesce(p_con_igv, false), v_cot.moneda_impresa, v_cot.tipo_cambio);
  if v_desc > 0 and v_desc >= coalesce(v_cot.subtotal, 0) then
    raise exception 'El descuento no puede ser igual o mayor que el subtotal de la cotización';
  end if;

  update cotizaciones set
    descuento_escrito = case when v_desc > 0 then round(p_escrito, 2) end,
    descuento_con_igv = case when v_desc > 0 then coalesce(p_con_igv, false) else false end,
    descuento_motivo  = case when v_desc > 0 then coalesce(v_motivo, 'DESCUENTO') end,
    descuento_monto   = v_desc,
    total             = coalesce(subtotal, 0) - v_desc,
    estado_aprobacion = (case
      when v_desc > 0 and descuento_aprobado is distinct from v_desc then 'pendiente_gerencia'
      when v_desc = 0 and estado_aprobacion = 'pendiente_gerencia'
           and not exists (select 1 from cotizacion_items ci where ci.cotizacion_id = p_cotizacion_id and ci.requiere_aprobacion)
        then 'auto_aprobada'
      else estado_aprobacion::text end)::estado_aprobacion,
    aprobada_por = case when v_desc > 0 and descuento_aprobado is distinct from v_desc then null else aprobada_por end,
    aprobada_at  = case when v_desc > 0 and descuento_aprobado is distinct from v_desc then null else aprobada_at end,
    updated_at = now()
  where id = p_cotizacion_id;

  update oportunidades set monto_estimado = coalesce(v_cot.subtotal, 0) - v_desc where id = v_cot.oportunidad_id;
  return v_desc;
end
$$;

revoke all on function public.fijar_descuento_cotizacion(uuid, numeric, boolean, text) from public, anon;
grant execute on function public.fijar_descuento_cotizacion(uuid, numeric, boolean, text) to authenticated;
grant execute on function public.descuento_neto_usd(numeric, boolean, moneda, numeric) to authenticated;
