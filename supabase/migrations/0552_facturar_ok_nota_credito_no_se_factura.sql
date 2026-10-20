-- ============================================================
-- CRM EFAMEINSA · Migración 0552 · Un solo circuito para facturar, sin correo
-- ============================================================
-- Reunión de gerencia 20-10-2026 con Jhon (Finanzas) y Brenda (PV2), caso
-- Beneficencia de Huancayo (PED-0022-2026):
--   · La factura E001-840 salió mal (en dólares), se anuló con nota de crédito
--     y se emitió la E001-842. «Falta acá agregar la nota de crédito»: el CRM
--     no tenía dónde. → facturas_pedido.tipo (factura | nota_credito),
--     anula_a, anulada_at/_por/_motivo, y la RPC
--     facturacion_registrar_nota_credito.
--   · Para que Facturación pudiera facturar, Jhon tenía que subir una
--     liquidación «pendiente de factura». «O darle simplemente un check para
--     que le des la orden a que facture.» → el OK de Finanzas a la orden de
--     postventa (finanzas_atender_orden_facturar, sin cambio de firma) basta:
--     /facturacion lista también los pedidos con ese OK y sin factura vigente.
--   · El cruce: facturaron (por correo) antes de que postventa diera la orden,
--     y el pedido salía «atrasado». → la orden nace atendida si ya hay factura
--     vigente, y registrar una factura cierra la orden que estaba abierta.
--   · El caso Lino: «está por facturar y nunca se va a facturar». → «No se
--     factura» con motivo (no_se_factura_*), que lo saca de la lista.
-- ============================================================

alter table facturas_pedido
  add column if not exists tipo text not null default 'factura' check (tipo in ('factura', 'nota_credito')),
  add column if not exists anula_a uuid references facturas_pedido(id),
  add column if not exists motivo text,
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_por uuid references perfiles(id);
comment on column facturas_pedido.tipo is 'factura o nota_credito (0552). Una nota de crédito anula la factura de anula_a.';

alter table servicios_postventa
  add column if not exists no_se_factura_at timestamptz,
  add column if not exists no_se_factura_por uuid references perfiles(id),
  add column if not exists no_se_factura_motivo text;

-- ¿Este pedido tiene una factura vigente (no anulada)?
create or replace function public.pedido_tiene_factura_vigente(p_servicio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from facturas_pedido f
                  where f.servicio_id = p_servicio and f.tipo = 'factura' and f.anulada_at is null)
$$;
grant execute on function public.pedido_tiene_factura_vigente(uuid) to authenticated, service_role;

-- La orden de postventa nace atendida si ya se facturó (el cruce del 16-10).
create or replace function public.postventa_orden_facturar(p_servicio uuid, p_nota text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_ya record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La orden de facturar la da postventa';
  end if;
  select numero, fecha_emision, registrada_por into v_ya
    from facturas_pedido
   where servicio_id = p_servicio and tipo = 'factura' and anulada_at is null
   order by created_at desc limit 1;
  update servicios_postventa
     set orden_facturar_at = now(),
         orden_facturar_por = auth.uid(),
         orden_facturar_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         orden_facturar_atendida_at = case when v_ya.numero is not null then now() end,
         orden_facturar_atendida_por = case when v_ya.numero is not null then v_ya.registrada_por end,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $function$;

-- Registrar una factura cierra la orden de facturar que estuviera abierta.
create or replace function public.factura_atiende_la_orden()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.tipo = 'factura' then
    update servicios_postventa
       set orden_facturar_atendida_at = coalesce(orden_facturar_atendida_at, now()),
           orden_facturar_atendida_por = coalesce(orden_facturar_atendida_por, new.registrada_por),
           no_se_factura_at = null, no_se_factura_por = null, no_se_factura_motivo = null
     where id = new.servicio_id;
  end if;
  return new;
end $function$;
drop trigger if exists zz_factura_atiende_la_orden on facturas_pedido;
create trigger zz_factura_atiende_la_orden after insert on facturas_pedido
  for each row execute function factura_atiende_la_orden();

-- La nota de crédito: anula una factura del mismo pedido.
create or replace function public.facturacion_registrar_nota_credito(
  p_servicio uuid, p_factura uuid, p_numero text, p_fecha date, p_motivo text,
  p_path text default null, p_nombre text default null)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_s servicios_postventa%rowtype;
  v_f facturas_pedido%rowtype;
  v_numero text := upper(regexp_replace(btrim(coalesce(p_numero, '')), '[[:space:]]+', '', 'g'));
begin
  if rol_actual()::text not in ('facturacion', 'finanzas', 'gerencia', 'admin') then
    raise exception 'La nota de crédito la registra Facturación o Finanzas';
  end if;
  if length(v_numero) < 4 then raise exception 'Escriba el número de la nota de crédito (serie y número)'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de emisión'; end if;
  if p_fecha > (now() at time zone 'America/Lima')::date then raise exception 'La fecha de emisión no puede ser futura'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Diga por qué se anula la factura'; end if;
  if p_path is not null and p_path !~* ('^facturas/' || p_servicio::text || '/[^/]+$') then
    raise exception 'La nota de crédito no tiene una ruta válida';
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false) for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  select * into v_f from facturas_pedido where id = p_factura and servicio_id = p_servicio;
  if v_f.id is null or v_f.tipo <> 'factura' then raise exception 'Elija la factura de este pedido que se anula'; end if;
  if v_f.anulada_at is not null then raise exception 'La factura % ya está anulada', v_f.numero; end if;
  if exists (select 1 from facturas_pedido where servicio_id = p_servicio and numero = v_numero) then
    raise exception 'El documento % ya está registrado en este pedido', v_numero;
  end if;

  insert into facturas_pedido (servicio_id, numero, fecha_emision, path, nombre, nota, registrada_por, es_prueba, tipo, anula_a, motivo)
  values (p_servicio, v_numero, p_fecha, p_path, nullif(btrim(coalesce(p_nombre, '')), ''), null, auth.uid(), v_s.es_prueba,
          'nota_credito', v_f.id, btrim(p_motivo));
  update facturas_pedido
     set anulada_at = now(), anulada_por = auth.uid(), motivo = btrim(p_motivo)
   where id = v_f.id;
end $function$;
revoke all on function public.facturacion_registrar_nota_credito(uuid, uuid, text, date, text, text, text) from public;
grant execute on function public.facturacion_registrar_nota_credito(uuid, uuid, text, date, text, text, text) to authenticated;

-- «No se factura» (garantía, sin costo, anulado…): sale de «Por facturar».
create or replace function public.finanzas_no_se_factura(p_servicio uuid, p_motivo text, p_deshacer boolean default false)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if not (rol_actual()::text in ('facturacion', 'finanzas', 'gerencia', 'admin') or coalesce(es_operaciones(), false)) then
    raise exception 'Esto lo decide Finanzas o Facturación';
  end if;
  if not p_deshacer and coalesce(btrim(p_motivo), '') = '' then raise exception 'Diga por qué no se factura'; end if;
  update servicios_postventa
     set no_se_factura_at = case when p_deshacer then null else now() end,
         no_se_factura_por = case when p_deshacer then null else auth.uid() end,
         no_se_factura_motivo = case when p_deshacer then null else btrim(p_motivo) end,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $function$;
revoke all on function public.finanzas_no_se_factura(uuid, text, boolean) from public;
grant execute on function public.finanzas_no_se_factura(uuid, text, boolean) to authenticated;
