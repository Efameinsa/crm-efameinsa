-- 0296 · LO QUE ENCONTRÓ LA REVISIÓN DEL CIRCUITO DEL PEDIDO (23-09-2026 noche)
--
--  1. El pedido de confirmación de postventa se «contesta» cuando Finanzas
--     confirma u observa: se limpia pago_solicitado_at. Antes se comparaba con
--     la PRIMERA confirmación y el segundo pedido (el del saldo) quedaba
--     «esperando» para siempre.
--  2. generar_pedido numera aparte lo de práctica (PRUEBA-PED-…): un pedido
--     de práctica ya no se come un número de la serie real.
--  3. finanzas_subir_liquidacion valida la ruta y no deja reemplazar una
--     liquidación que Central ya aceptó.

-- ── 1 · Confirmar el abono contesta el pedido de postventa ────────────────
-- Se parcha la definición viva (nunca copiarla de un archivo viejo).
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.finanzas_confirmar_abono(uuid,numeric,date,text,text,text,text)'::regprocedure) into v_def;
  if position('pago_solicitado_at = null' in v_def) = 0 then
    v_def := replace(v_def, 'pago_observado_motivo = null,', 'pago_observado_motivo = null,
         pago_solicitado_at = null,
         pago_solicitado_por = null,');
    if position('pago_solicitado_at = null' in v_def) = 0 then
      raise exception 'No encontré dónde parchar finanzas_confirmar_abono';
    end if;
    execute v_def;
  end if;
end $$;

-- Observar también es una respuesta.
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
         pago_observado_adjunto = p_adjunto,
         pago_solicitado_at = null, pago_solicitado_por = null,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

-- ── 2 · La numeración de práctica va aparte ────────────────────────────────
create or replace function public.generar_pedido(p_servicio uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
  v_anio text := to_char(now() at time zone 'America/Lima', 'YYYY');
  v_prefijo text;
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

  v_prefijo := case when v_s.es_prueba then 'PRUEBA-PED' else 'PED' end;
  perform pg_advisory_xact_lock(hashtext('generar_pedido_' || v_prefijo || v_anio));
  select coalesce(max(substring(numero_pedido_erp from '^' || v_prefijo || '-(\d+)-' || v_anio || '$')::integer), 0) + 1
    into v_n
    from servicios_postventa
   where es_prueba = v_s.es_prueba
     and numero_pedido_erp ~ ('^' || v_prefijo || '-\d+-' || v_anio || '$');
  v_numero := format('%s-%s-%s', v_prefijo, lpad(v_n::text, 4, '0'), v_anio);

  update servicios_postventa
     set numero_pedido_erp = v_numero, pedido_generado_at = now(), pedido_generado_por = auth.uid(), updated_at = now()
   where id = p_servicio;
  return v_numero;
end $$;

-- ── 3 · La liquidación: ruta propia y no se pisa una aceptada ─────────────
create or replace function public.finanzas_subir_liquidacion(p_servicio uuid, p_path text, p_nombre text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aceptada timestamptz;
begin
  if rol_actual() not in ('finanzas', 'gerencia', 'admin', 'operaciones') then
    raise exception 'La liquidación la sube Finanzas';
  end if;
  if nullif(btrim(coalesce(p_path, '')), '') is null then raise exception 'Falta el archivo de la liquidación'; end if;
  if p_path !~* ('^liquidaciones/' || p_servicio::text || '/[^/]+$') then
    raise exception 'La liquidación no tiene una ruta válida';
  end if;
  select liquidacion_at into v_aceptada from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
  if v_aceptada is not null then raise exception 'Central ya aceptó la liquidación de este pedido'; end if;
  update servicios_postventa
     set liquidacion_adjunto = jsonb_build_object('path', p_path, 'nombre', coalesce(p_nombre, 'liquidacion.pdf')),
         liquidacion_subida_at = now(),
         liquidacion_subida_por = auth.uid(),
         liquidacion_rechazada_at = null,
         liquidacion_rechazada_por = null,
         liquidacion_rechazada_motivo = null,
         updated_at = now()
   where id = p_servicio;
end $$;

revoke all on function public.finanzas_observar_pago(uuid, text, text) from public;
revoke all on function public.generar_pedido(uuid) from public;
revoke all on function public.finanzas_subir_liquidacion(uuid, text, text) from public;
grant execute on function public.finanzas_observar_pago(uuid, text, text) to authenticated;
grant execute on function public.generar_pedido(uuid) to authenticated;
grant execute on function public.finanzas_subir_liquidacion(uuid, text, text) to authenticated;
