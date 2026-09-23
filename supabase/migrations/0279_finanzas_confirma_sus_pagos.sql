-- ============================================================
-- CRM EFAMEINSA · Migración 0279 · Finanzas confirma sus propios pagos
-- ============================================================
-- Gerencia, 23-09-2026, a la pregunta «¿Le creamos una cuenta a John
-- (Finanzas) para que él mismo confirme los pagos?»: «Sí».
--
-- Hasta hoy Finanzas no entraba al CRM: postventa registraba «Finanzas
-- confirmó el pago» copiando lo que John le decía por correo o WhatsApp, y
-- Central le avisaba por WhatsApp. Carlos, 01-09: «Si dice que pagó, yo le
-- envío un mensaje a Finanzas… confírmame el pago, porque yo no tengo
-- acceso»; y el riesgo que motiva todo: «nos mandan vouchers… tipo falso
-- Yape, pero con vouchers». Lo que vale es lo ACREDITADO en el banco.
--
-- Por qué un ROL y no una llave como el almacén: las listas comerciales de
-- gerencia (supervisión, rendimiento) cuentan a todo perfil `comercial`; una
-- cuenta de Finanzas con rol comercial aparecería como vendedor sin
-- actividad. Con rol propio, además, no hereda ninguna política existente:
-- ve solo lo que esta migración le abre.
--
-- Lo que agrega:
--   · rol `finanzas` y `es_finanzas()`.
--   · `pagos_pedido`: cada abono confirmado es una fila (monto, fecha,
--     operación, banco, captura). Un pedido a crédito tiene varios abonos;
--     `servicios_postventa.monto_pagado` sigue siendo el acumulado que ya usa
--     todo el circuito (condición de pago, apertura, cuentas por cobrar).
--   · «Observar» el pago: Finanzas no encuentra el abono o el monto no
--     coincide; queda en el pedido hasta que se confirma.
--   · Lectura para Finanzas de pedidos, cierres, clientes y avisos de Central
--     dirigidos a Finanzas. Escritura solo por las dos funciones de abajo.
-- ============================================================

alter type public.rol_usuario add value if not exists 'finanzas';

-- Se compara como texto: el valor nuevo del enum no se puede usar como
-- literal en la misma transacción en que se crea.
create or replace function public.es_finanzas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol::text = 'finanzas' from perfiles where id = auth.uid()), false)
$$;

-- ── Los abonos ─────────────────────────────────────────────────────────────
create table if not exists public.pagos_pedido (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_postventa (id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  moneda text not null default 'USD',
  fecha_abono date not null,
  operacion text not null,
  medio text not null,
  captura_path text,
  nota text,
  registrado_por uuid not null references public.perfiles (id),
  created_at timestamptz not null default now(),
  es_prueba boolean not null default false
);
comment on table public.pagos_pedido is 'Cada abono que Finanzas confirmó como ACREDITADO en el banco (0279). monto_pagado del pedido es la suma.';
create index if not exists ix_pagos_pedido_servicio on public.pagos_pedido (servicio_id);
create index if not exists ix_pagos_pedido_fecha on public.pagos_pedido (created_at desc);

alter table public.pagos_pedido enable row level security;
drop policy if exists pagos_pedido_lectura on public.pagos_pedido;
create policy pagos_pedido_lectura on public.pagos_pedido for select
  using (((select es_finanzas()) or (select es_backoffice()) or (select es_operaciones())) and es_prueba = (select es_cuenta_prueba()));

-- ── La observación de Finanzas ─────────────────────────────────────────────
alter table public.servicios_postventa
  add column if not exists pago_observado_at timestamptz,
  add column if not exists pago_observado_por uuid references public.perfiles (id),
  add column if not exists pago_observado_motivo text;
comment on column public.servicios_postventa.pago_observado_at is 'Finanzas observó el pago (no encuentra el abono, el monto no coincide…). Se limpia al confirmar un abono (0279).';

-- ── Lo que Finanzas lee ────────────────────────────────────────────────────
drop policy if exists servicios_pv_finanzas on public.servicios_postventa;
create policy servicios_pv_finanzas on public.servicios_postventa for select
  using ((select es_finanzas()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists informes_finanzas on public.informes_cierre;
create policy informes_finanzas on public.informes_cierre for select
  using ((select es_finanzas()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists cuentas_finanzas on public.cuentas;
create policy cuentas_finanzas on public.cuentas for select
  using ((select es_finanzas()));

drop policy if exists avisos_finanzas on public.avisos_derivados;
create policy avisos_finanzas on public.avisos_derivados for select
  using ((select es_finanzas()) and a_finanzas);

-- ── Confirmar un abono ─────────────────────────────────────────────────────
create or replace function public.finanzas_confirmar_abono(
  p_servicio uuid,
  p_monto numeric,
  p_fecha date,
  p_operacion text,
  p_medio text,
  p_captura text default null,
  p_nota text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
  v_nombre text;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(es_finanzas(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Los abonos los confirma Finanzas';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Escriba el monto que entró a la cuenta'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del abono'; end if;
  if p_fecha > (now() at time zone 'America/Lima')::date then raise exception 'La fecha del abono no puede ser futura'; end if;
  if nullif(btrim(coalesce(p_operacion, '')), '') is null then raise exception 'Falta el número de operación del banco'; end if;
  if nullif(btrim(coalesce(p_medio, '')), '') is null then raise exception 'Diga en qué banco o por qué medio entró'; end if;
  if p_captura is not null and p_captura !~* ('^finanzas/' || p_servicio::text || '/[^/]+$') then
    raise exception 'La captura no tiene una ruta válida';
  end if;

  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if exists (select 1 from pagos_pedido where servicio_id = p_servicio and upper(btrim(operacion)) = upper(btrim(p_operacion))) then
    raise exception 'Esa operación ya está registrada en este pedido';
  end if;

  insert into pagos_pedido (servicio_id, monto, moneda, fecha_abono, operacion, medio, captura_path, nota, registrado_por, es_prueba)
  values (p_servicio, round(p_monto, 2), coalesce(v_s.moneda::text, 'USD'), p_fecha, btrim(p_operacion), btrim(p_medio),
          p_captura, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), v_s.es_prueba);

  select nombre into v_nombre from perfiles where id = auth.uid();
  v_total := coalesce(v_s.monto_pagado, 0) + round(p_monto, 2);

  update servicios_postventa
     set monto_pagado = v_total,
         pago_confirmado_at = coalesce(pago_confirmado_at, now()),
         pago_confirmado_por = coalesce(pago_confirmado_por, auth.uid()),
         pago_confirmado_detalle = format('%s (Finanzas) · %s · op. %s · %s', coalesce(v_nombre, 'Finanzas'),
                                          btrim(p_medio), btrim(p_operacion), to_char(p_fecha, 'DD/MM/YYYY')),
         pago_confirmado_captura = coalesce(p_captura, pago_confirmado_captura),
         confirmacion_abono = 'SI',
         pago_observado_at = null,
         pago_observado_por = null,
         pago_observado_motivo = null,
         updated_at = now()
   where id = p_servicio;

  return v_total;
end $$;

revoke all on function public.finanzas_confirmar_abono(uuid, numeric, date, text, text, text, text) from public;
grant execute on function public.finanzas_confirmar_abono(uuid, numeric, date, text, text, text, text) to authenticated;

-- ── Observar el pago ───────────────────────────────────────────────────────
create or replace function public.finanzas_observar_pago(p_servicio uuid, p_motivo text)
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
  update servicios_postventa
     set pago_observado_at = now(), pago_observado_por = auth.uid(), pago_observado_motivo = btrim(p_motivo), updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

revoke all on function public.finanzas_observar_pago(uuid, text) from public;
grant execute on function public.finanzas_observar_pago(uuid, text) to authenticated;
