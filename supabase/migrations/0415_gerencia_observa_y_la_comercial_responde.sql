-- ============================================================
-- CRM EFAMEINSA · Migración 0415 · Gerencia OBSERVA una cotización sin rechazarla; la comercial responde
-- ============================================================
-- Brenda (C1), 07-10, buzón 9d0a4d04: cuando gerencia observa una cotización
-- el sistema solo permite «rechazarla» (0237: la rechazada es histórico y se
-- hace otra), y ella tiene que rehacerla y poner la respuesta en el
-- seguimiento. Ejemplo: LG GIANT C MAX, rechazada el 07-10 con «¿por qué
-- cotizaciones de manera independiente?». Pide (1) responder a gerencia y
-- (2) que gerencia observe sin rechazar, para que ella actualice la MISMA
-- cotización.
--
-- Diseño chico: la cotización observada NO cambia de estado (sigue
-- `pendiente_gerencia`, así que no es histórico, no cuenta como rechazada y
-- sigue editable porque aún no salió al cliente). Solo se agrega:
--   · `cotizaciones.observacion_estado`: 'observada' (gerencia preguntó, espera
--     a la comercial) | 'respondida' (la comercial contestó, espera a gerencia).
--   · dos clases nuevas en el histórico `cotizacion_decisiones` (0237):
--     'observada' y 'respondida', que ya se muestra a gerencia y a la comercial.
--   · dos funciones: `observar_cotizacion` y `responder_observacion_cotizacion`.
-- Aprobar o rechazar (resolver_aprobacion_cotizacion) limpia la marca.
-- No hay valor nuevo de enum: no hace falta una segunda migración.
-- ============================================================

alter table public.cotizaciones
  add column if not exists observacion_estado text
  check (observacion_estado in ('observada', 'respondida'));

comment on column public.cotizaciones.observacion_estado is
  'Gerencia observó la cotización sin rechazarla (0415): observada = espera a la comercial; respondida = espera a gerencia. null = sin observación abierta.';

-- El histórico acepta las dos clases nuevas (se suelta el check que mira `resultado`).
do $$
declare v_nombre text;
begin
  for v_nombre in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.cotizacion_decisiones'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%resultado%'
  loop
    execute format('alter table public.cotizacion_decisiones drop constraint %I', v_nombre);
  end loop;
end $$;
alter table public.cotizacion_decisiones
  add constraint cotizacion_decisiones_resultado_check
  check (resultado in ('aprobada_gerencia', 'rechazada_gerencia', 'observada', 'respondida'));

-- ── Gerencia observa ─────────────────────────────────────────────────────
create or replace function public.observar_cotizacion(p_cotizacion_id uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cot  cotizaciones%rowtype;
  v_nota text := btrim(coalesce(p_nota, ''));
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then raise exception 'La cotización no existe'; end if;
  if not es_backoffice() then
    raise exception 'Las observaciones sobre una cotización las hace gerencia. Entre con la cuenta de gerencia.';
  end if;
  if v_cot.estado_aprobacion <> 'pendiente_gerencia' then
    raise exception 'Solo se puede observar una cotización que espera a gerencia; esta ya fue resuelta.';
  end if;
  if length(v_nota) < 5 then
    raise exception 'Escriba qué observa, para que la comercial sepa qué corregir o responder.';
  end if;

  update cotizaciones set observacion_estado = 'observada', updated_at = now() where id = p_cotizacion_id;

  insert into cotizacion_decisiones (cotizacion_id, oportunidad_id, decidido_por, resultado, nota)
  values (p_cotizacion_id, v_cot.oportunidad_id, auth.uid(), 'observada', v_nota);
end;
$function$;

-- ── La comercial responde ────────────────────────────────────────────────
create or replace function public.responder_observacion_cotizacion(p_cotizacion_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cot   cotizaciones%rowtype;
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then raise exception 'La cotización no existe'; end if;
  if not exists (select 1 from oportunidades o where o.id = v_cot.oportunidad_id and puede_cotizar_en(o.id)) then
    raise exception 'Solo el comercial dueño de la oportunidad responde a gerencia sobre su cotización.';
  end if;
  if v_cot.estado_aprobacion <> 'pendiente_gerencia' or v_cot.observacion_estado is null then
    raise exception 'Esta cotización no tiene una observación de gerencia esperando respuesta.';
  end if;
  if length(v_texto) < 3 then
    raise exception 'Escriba su respuesta a gerencia.';
  end if;

  update cotizaciones set observacion_estado = 'respondida', updated_at = now() where id = p_cotizacion_id;

  insert into cotizacion_decisiones (cotizacion_id, oportunidad_id, decidido_por, resultado, nota)
  values (p_cotizacion_id, v_cot.oportunidad_id, auth.uid(), 'respondida', v_texto);
end;
$function$;

revoke all on function public.observar_cotizacion(uuid, text) from public;
revoke all on function public.responder_observacion_cotizacion(uuid, text) from public;
grant execute on function public.observar_cotizacion(uuid, text) to authenticated;
grant execute on function public.responder_observacion_cotizacion(uuid, text) to authenticated;

-- ── Aprobar o rechazar cierra la observación ─────────────────────────────
-- Se parcha la definición viva de resolver_aprobacion_cotizacion (nunca se copia).
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolver_aprobacion_cotizacion';
  v_nueva := replace(v_def,
    $old$         aprobada_at       = now(),$old$,
    $new$         aprobada_at       = now(),
         observacion_estado = null,$new$);
  if v_nueva = v_def then raise exception 'resolver_aprobacion_cotizacion: no se encontró aprobada_at = now()'; end if;
  execute v_nueva;
end $$;
