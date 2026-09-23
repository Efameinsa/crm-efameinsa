-- 0295 · LAS OBSERVACIONES DE LA PRUEBA EN VIVO CON EL ING. CARLOS
-- (23-09-2026 17:24 y 17:48, recorriendo cuenta por cuenta el pedido de Central).
--
--  1. «Pedido del ERP… en el ERP ya no lo haría. Este segundo paso se retira.»
--     El pedido lo numera el CRM: Central lo genera con un clic y lo imprime
--     (queda como anexo del cierre, que no se toca).
--  2. «En liquidación de Finanzas es acepto y rechazo… porque si pasa a la
--     Central el pedido todo mal, todo el camino está mal.» Central rechaza con
--     motivo y la liquidación vuelve a Finanzas.
--  3. «Postventa, solicita confirmación del pago… una notificación en Finanzas
--     que diga: me solicita confirmar el abono del pedido 55.» El registro a mano
--     con la captura del correo se elimina.
--  4. «Cuando hay comisión… le adjuntamos nosotros normalmente la evidencia.»
--     La observación y el descuento del banco llevan su evidencia.
--  5. «Permíteme hacer mi apertura de manera directa… no hay cotización, no hay
--     cierre, no hay nada… para poder guardar, pide el PIN.» Apertura urgente
--     sin pedido, con el código de gerencia.

alter table public.servicios_postventa
  add column if not exists pedido_generado_at             timestamptz,
  add column if not exists pedido_generado_por            uuid references public.perfiles (id) on delete set null,
  add column if not exists liquidacion_rechazada_at       timestamptz,
  add column if not exists liquidacion_rechazada_por      uuid references public.perfiles (id) on delete set null,
  add column if not exists liquidacion_rechazada_motivo   text,
  add column if not exists liquidacion_rechazada_adjunto  jsonb,
  add column if not exists pago_solicitado_at             timestamptz,
  add column if not exists pago_solicitado_por            uuid references public.perfiles (id) on delete set null,
  add column if not exists pago_observado_adjunto         text;
comment on column public.servicios_postventa.pedido_generado_at is 'Cuándo Central generó el pedido con su número del CRM (0295; el paso del ERP se retiró).';
comment on column public.servicios_postventa.liquidacion_rechazada_motivo is 'Por qué Central devolvió la liquidación a Finanzas (0295). Se limpia cuando Finanzas sube la corregida.';
comment on column public.servicios_postventa.pago_solicitado_at is 'Cuándo postventa le pidió a Finanzas confirmar el abono (0295). Reemplaza el registro a mano con captura.';

alter table public.pagos_pedido
  add column if not exists descuento_adjunto text;
comment on column public.pagos_pedido.descuento_adjunto is 'La evidencia del descuento del banco (comisión), para mostrársela al cliente (0295).';

alter table public.aperturas_llamada
  add column if not exists urgente           boolean not null default false,
  add column if not exists urgente_autorizo  uuid references public.perfiles (id) on delete set null;
comment on column public.aperturas_llamada.urgente is 'Apertura directa, sin cotización ni cierre, autorizada con el código de gerencia (0295).';

-- ── 1 · Central genera el pedido: el número lo pone el CRM ────────────────
create or replace function public.generar_pedido(p_servicio uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
  v_anio text := to_char(now() at time zone 'America/Lima', 'YYYY');
  v_n integer;
  v_numero text;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'El pedido lo genera Central';
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.numero_pedido_erp is not null then return v_s.numero_pedido_erp; end if;

  perform pg_advisory_xact_lock(hashtext('generar_pedido_' || v_anio));
  select coalesce(max(substring(numero_pedido_erp from '^PED-(\d+)-' || v_anio || '$')::integer), 0) + 1
    into v_n
    from servicios_postventa
   where numero_pedido_erp ~ ('^PED-\d+-' || v_anio || '$');
  v_numero := format('PED-%s-%s', lpad(v_n::text, 4, '0'), v_anio);

  update servicios_postventa
     set numero_pedido_erp = v_numero, pedido_generado_at = now(), pedido_generado_por = auth.uid(), updated_at = now()
   where id = p_servicio;
  return v_numero;
end $$;

-- ── 2 · Central rechaza la liquidación: vuelve a Finanzas con el motivo ───
create or replace function public.central_rechazar_liquidacion(p_servicio uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'La liquidación la revisa Central';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Diga qué está mal en la liquidación'; end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.liquidacion_at is not null then raise exception 'La liquidación ya fue aceptada'; end if;
  if v_s.liquidacion_adjunto is null then raise exception 'Finanzas todavía no subió la liquidación'; end if;
  update servicios_postventa
     set liquidacion_rechazada_at = now(),
         liquidacion_rechazada_por = auth.uid(),
         liquidacion_rechazada_motivo = btrim(p_motivo),
         liquidacion_rechazada_adjunto = liquidacion_adjunto,
         liquidacion_adjunto = null,
         liquidacion_subida_at = null,
         liquidacion_subida_por = null,
         updated_at = now()
   where id = p_servicio;
end $$;

-- La corregida limpia el rechazo.
create or replace function public.finanzas_subir_liquidacion(p_servicio uuid, p_path text, p_nombre text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if rol_actual() not in ('finanzas', 'gerencia', 'admin', 'operaciones') then
    raise exception 'La liquidación la sube Finanzas';
  end if;
  if nullif(btrim(coalesce(p_path, '')), '') is null then raise exception 'Falta el archivo de la liquidación'; end if;
  update servicios_postventa
     set liquidacion_adjunto = jsonb_build_object('path', p_path, 'nombre', coalesce(p_nombre, 'liquidacion.pdf')),
         liquidacion_subida_at = now(),
         liquidacion_subida_por = auth.uid(),
         liquidacion_rechazada_at = null,
         liquidacion_rechazada_por = null,
         liquidacion_rechazada_motivo = null,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

-- ── 3 · Postventa le pide a Finanzas que confirme el abono ────────────────
create or replace function public.postventa_solicitar_confirmacion_pago(p_servicio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La confirmación del pago la pide postventa';
  end if;
  update servicios_postventa
     set pago_solicitado_at = now(), pago_solicitado_por = auth.uid(), updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

-- ── 4 · La observación y el descuento llevan su evidencia ─────────────────
drop function if exists public.finanzas_observar_pago(uuid, text);
create or replace function public.finanzas_observar_pago(p_servicio uuid, p_motivo text, p_adjunto text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(es_finanzas(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La observación del pago la hace Finanzas';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba qué pasa con el pago (mínimo una frase)';
  end if;
  if p_adjunto is not null and p_adjunto !~* ('^finanzas/' || p_servicio::text || '/[^/]+$') then
    raise exception 'La evidencia no tiene una ruta válida';
  end if;
  update servicios_postventa
     set pago_observado_at = now(), pago_observado_por = auth.uid(), pago_observado_motivo = btrim(p_motivo),
         pago_observado_adjunto = p_adjunto, updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

drop function if exists public.finanzas_anotar_descuento(uuid, numeric, text);
create or replace function public.finanzas_anotar_descuento(p_servicio uuid, p_monto numeric, p_motivo text, p_adjunto text default null)
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
  if p_adjunto is not null and p_adjunto !~* ('^finanzas/' || p_servicio::text || '/[^/]+$') then
    raise exception 'La evidencia no tiene una ruta válida';
  end if;
  select id into v_pago from pagos_pedido
   where servicio_id = p_servicio and registrado_por = auth.uid() and created_at > now() - interval '10 minutes'
   order by created_at desc limit 1;
  if v_pago is null then raise exception 'Primero confirme el abono'; end if;
  update pagos_pedido set descuento_monto = p_monto, descuento_motivo = btrim(p_motivo), descuento_adjunto = p_adjunto where id = v_pago;
  return v_pago;
end $$;

-- ── 5 · Apertura urgente, sin pedido, con el código de gerencia ───────────
drop function if exists public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid);
create or replace function public.enviar_apertura_llamada(
  p_cuenta uuid,
  p_tipo text,
  p_programada timestamptz,
  p_equipos text,
  p_indicaciones text default null,
  p_contacto text default null,
  p_servicio uuid default null,
  p_atencion uuid default null,
  p_pin_urgente text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_autorizo uuid;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La apertura de llamada la envía postventa';
  end if;
  if p_programada is null then raise exception 'Falta el día y la hora'; end if;
  if nullif(btrim(coalesce(p_equipos, '')), '') is null then raise exception 'Diga qué equipos se revisan'; end if;
  if p_servicio is not null and not exists (select 1 from servicios_postventa where id = p_servicio and cuenta_id = p_cuenta) then
    raise exception 'Ese pedido no es de este cliente';
  end if;
  if p_pin_urgente is not null then
    if p_servicio is not null then raise exception 'La apertura urgente es para lo que todavía no tiene pedido'; end if;
    v_autorizo := validar_codigo_autorizacion(p_pin_urgente, 'gerencia');
  end if;
  insert into aperturas_llamada (cuenta_id, servicio_id, atencion_id, tipo, programada_para, equipos, indicaciones, contacto,
                                 solicitada_por, es_prueba, urgente, urgente_autorizo)
  values (p_cuenta, p_servicio, p_atencion, p_tipo, p_programada, btrim(p_equipos),
          nullif(btrim(coalesce(p_indicaciones, '')), ''), nullif(btrim(coalesce(p_contacto, '')), ''),
          auth.uid(), coalesce(es_cuenta_prueba(), false), v_autorizo is not null, v_autorizo)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.generar_pedido(uuid) from public;
revoke all on function public.central_rechazar_liquidacion(uuid, text) from public;
revoke all on function public.finanzas_subir_liquidacion(uuid, text, text) from public;
revoke all on function public.postventa_solicitar_confirmacion_pago(uuid) from public;
revoke all on function public.finanzas_observar_pago(uuid, text, text) from public;
revoke all on function public.finanzas_anotar_descuento(uuid, numeric, text, text) from public;
revoke all on function public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid, text) from public;
grant execute on function public.generar_pedido(uuid) to authenticated;
grant execute on function public.central_rechazar_liquidacion(uuid, text) to authenticated;
grant execute on function public.finanzas_subir_liquidacion(uuid, text, text) to authenticated;
grant execute on function public.postventa_solicitar_confirmacion_pago(uuid) to authenticated;
grant execute on function public.finanzas_observar_pago(uuid, text, text) to authenticated;
grant execute on function public.finanzas_anotar_descuento(uuid, numeric, text, text) to authenticated;
grant execute on function public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid, text) to authenticated;
