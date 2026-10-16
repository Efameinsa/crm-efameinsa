-- ═══════════════════════════════════════════════════════════════════════════
-- 0520 · EL COMERCIAL LE CONSULTA EL PAGO A FINANZAS, CON EL VOUCHER
-- ═══════════════════════════════════════════════════════════════════════════
-- Katerine, 16-10 (audio): «tú como comercial tienes que preguntarle al área
-- de facturación si es que hay comisión de interplaza… eso regularmente se
-- consultaba mediante correo… ahora la gerencia me indica que ya no, que es
-- por el CRM». Y lo otro: «cuando ya el cliente pagó su saldo… se registraba
-- una llamada y se enviaba un correo a contabilidad con el voucher adjunto,
-- indicando que el cliente ya con esto canceló». El comercial no termina la
-- operación hasta que el cliente termina de pagar.
--
-- Dos consultas, las dos con el voucher:
--   · comision — «¿este abono tuvo comisión interplaza o bancaria?». Finanzas
--     contesta sí (monto + pantallazo, para que el cliente vea que está
--     sustentado) o no.
--   · cancelo  — «el cliente canceló el saldo, aquí está el voucher». Finanzas
--     lo ubica en el banco y confirma el abono (o lo observa).
--
-- La respuesta vuelve al comercial en la campana y queda en «Pagos» del
-- pedido. La consulta marca pago_solicitado_at, así que aparece en la bandeja
-- de Finanzas igual que la que pide postventa (0295).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.consultas_pago (
  id                 uuid primary key default gen_random_uuid(),
  servicio_id        uuid not null references public.servicios_postventa(id) on delete cascade,
  tipo               text not null check (tipo in ('comision', 'cancelo')),
  voucher_path       text not null,
  nota               text,
  creado_por         uuid not null references public.perfiles(id),
  created_at         timestamptz not null default now(),
  respondida_at      timestamptz,
  respondida_por     uuid references public.perfiles(id),
  respuesta          text,
  -- Lo que el banco descontó, si lo hubo, y el pantallazo que lo sustenta.
  comision_monto     numeric(12, 2),
  respuesta_adjunto  text,
  es_prueba          boolean not null default false
);

create index if not exists consultas_pago_servicio_idx on public.consultas_pago (servicio_id, created_at desc);
create index if not exists consultas_pago_abiertas_idx on public.consultas_pago (servicio_id) where respondida_at is null;

alter table public.consultas_pago enable row level security;

drop policy if exists consultas_pago_lectura on public.consultas_pago;
create policy consultas_pago_lectura on public.consultas_pago for select to authenticated
  using (
    creado_por = auth.uid()
    or coalesce(public.es_finanzas(), false)
    or coalesce(public.es_backoffice(), false)
    or coalesce(public.es_operaciones(), false)
  );

revoke all on public.consultas_pago from anon;
grant select on public.consultas_pago to authenticated;
grant all on public.consultas_pago to service_role;

-- ── El comercial consulta ────────────────────────────────────────────────
create or replace function public.comercial_consultar_pago(
  p_servicio uuid,
  p_tipo text,
  p_voucher text,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dueno  uuid;
  v_prueba boolean;
  v_id     uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if p_tipo not in ('comision', 'cancelo') then raise exception 'Tipo de consulta no válido'; end if;

  select i.creado_por, s.es_prueba into v_dueno, v_prueba
    from servicios_postventa s
    left join informes_cierre i on i.id = s.informe_cierre_id
   where s.id = p_servicio;
  if not found or v_prueba <> coalesce(es_cuenta_prueba(), false) then
    raise exception 'Ese pedido no existe';
  end if;
  if v_dueno is distinct from auth.uid()
     and not (coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La consulta del pago la hace el comercial del cierre';
  end if;
  if p_voucher is null or p_voucher !~* ('^pagos-comercial/' || p_servicio::text || '/[^/]+$') then
    raise exception 'Adjunte el voucher del cliente';
  end if;

  insert into consultas_pago (servicio_id, tipo, voucher_path, nota, creado_por, es_prueba)
  values (p_servicio, p_tipo, p_voucher, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), v_prueba)
  returning id into v_id;

  update servicios_postventa
     set pago_solicitado_at = now(), pago_solicitado_por = auth.uid(), updated_at = now()
   where id = p_servicio;

  return v_id;
end $$;

-- ── Finanzas contesta ────────────────────────────────────────────────────
-- p_consulta null = contesta todas las abiertas del pedido (al confirmar u
-- observar el abono, que ya es la respuesta).
create or replace function public.finanzas_responder_consulta_pago(
  p_servicio uuid,
  p_consulta uuid,
  p_respuesta text,
  p_comision numeric default null,
  p_adjunto text default null
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(es_finanzas(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La consulta del pago la contesta Finanzas';
  end if;
  if length(btrim(coalesce(p_respuesta, ''))) < 2 then raise exception 'Escriba la respuesta'; end if;
  if p_comision is not null and p_comision < 0 then raise exception 'La comisión no puede ser negativa'; end if;
  if p_adjunto is not null and p_adjunto !~* ('^finanzas/' || p_servicio::text || '/[^/]+$') then
    raise exception 'El pantallazo no tiene una ruta válida';
  end if;

  return query
  update consultas_pago
     set respondida_at = now(), respondida_por = auth.uid(), respuesta = btrim(p_respuesta),
         comision_monto = nullif(p_comision, 0), respuesta_adjunto = p_adjunto
   where servicio_id = p_servicio
     and respondida_at is null
     and (p_consulta is null or id = p_consulta)
  returning id;

  -- Sin consultas abiertas, el pedido deja de figurar como «solicitado».
  if not exists (select 1 from consultas_pago where servicio_id = p_servicio and respondida_at is null) then
    update servicios_postventa set pago_solicitado_at = null, pago_solicitado_por = null, updated_at = now()
     where id = p_servicio and pago_solicitado_at is not null;
  end if;
end $$;

revoke all on function public.comercial_consultar_pago(uuid, text, text, text) from public;
revoke all on function public.finanzas_responder_consulta_pago(uuid, uuid, text, numeric, text) from public;
grant execute on function public.comercial_consultar_pago(uuid, text, text, text) to authenticated;
grant execute on function public.finanzas_responder_consulta_pago(uuid, uuid, text, numeric, text) to authenticated;
