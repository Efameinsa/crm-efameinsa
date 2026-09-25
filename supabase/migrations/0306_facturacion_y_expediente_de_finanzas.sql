-- ============================================================
-- CRM EFAMEINSA · Migración 0306 · Facturación, el expediente de Finanzas
-- y las liquidaciones que se van actualizando
-- ============================================================
-- Reunión 25-09 11:44 (gerencia, Central —Yasmín— y Finanzas —Jhon—):
--
--   · Jhon: «ya no me llega nada, llega solamente la alerta». Gerencia: «tiene
--     que tener acceso a esta información… la cotización, la orden de compra,
--     hasta el voucher de pago… todo el expediente», «no puede editar; lo
--     único que va a poder es subir sus liquidaciones, primero una, después
--     otra». Y la cotización del expediente es la que está enlazada al cierre:
--     «puede haber cotizado 20… necesita la última».
--   · Pagos por partes y facturas que llegan después: «subo la liquidación,
--     pendiente factura… luego tiene que actualizar su liquidación con el
--     número de factura». Cada liquidación queda en su historial.
--   · Yasmín: una vez liberado el pedido «ya no tengo acceso a verla» (la
--     liquidación). Gerencia: Central la ve e imprime —la liquidación, la
--     factura— y lleva el expediente físico; Finanzas, en otro edificio, no
--     carga ni imprime nada. El comercial NO ve las liquidaciones.
--   · Los vouchers con que Finanzas confirma: «no tienen que verlos nadie más
--     que Finanzas y gerencia».
--   · Un usuario nuevo, Facturación 1: «similar a Finanzas… ve el expediente,
--     pero no puede editar nada más que subir la información de factura». El
--     facturador revisa que cotización, OC, cierre y pedido estén alineados:
--     «si está mal, para; si está bien, continúa, factura, sube y cierra».
--
-- Lo que agrega:
--   · rol `facturacion` y `es_facturacion()`.
--   · `liquidaciones_pedido`: el historial de liquidaciones de un pedido, con
--     su estado de pago y el número de factura (o «factura pendiente»).
--     `servicios_postventa.liquidacion_adjunto` sigue siendo la vigente (la
--     última), que es la que ya usa el circuito de Central.
--   · `facturas_pedido`: las facturas que registra Facturación.
--   · «Observar» un expediente incongruente (Facturación) y su motivo.
--   · Lectura para Finanzas y Facturación de la cotización enlazada al cierre.
--   · La lectura de archivos: las capturas de Finanzas (`finanzas/…`) solo las
--     abren Finanzas y gerencia; liquidaciones y facturas, las áreas del
--     circuito (no el comercial).
-- ============================================================

alter type public.rol_usuario add value if not exists 'facturacion';

-- Como es_finanzas() (0279): se compara como texto porque el valor nuevo del
-- enum no se puede usar como literal en la misma transacción.
create or replace function public.es_facturacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol::text = 'facturacion' from perfiles where id = auth.uid()), false)
$$;

-- Las áreas del circuito del pedido que leen liquidaciones y facturas.
create or replace function public.ve_documentos_de_finanzas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol::text in ('finanzas', 'facturacion', 'gerencia', 'admin', 'central') or es_operaciones
                     from perfiles where id = auth.uid()), false)
$$;

-- ── Lo que Facturación lee (lo mismo que Finanzas) ─────────────────────────
drop policy if exists servicios_pv_facturacion on public.servicios_postventa;
create policy servicios_pv_facturacion on public.servicios_postventa for select
  using ((select es_facturacion()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists informes_facturacion on public.informes_cierre;
create policy informes_facturacion on public.informes_cierre for select
  using ((select es_facturacion()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists cuentas_facturacion on public.cuentas;
create policy cuentas_facturacion on public.cuentas for select
  using ((select es_facturacion()));

drop policy if exists pedido_equipos_facturacion on public.pedido_equipos;
create policy pedido_equipos_facturacion on public.pedido_equipos for select
  using ((select es_facturacion()));

-- Los abonos: Facturación ve cuánto entró (para saber si factura pagado o por
-- cobrar), no las capturas (esas quedan cerradas en storage, abajo).
drop policy if exists pagos_pedido_facturacion on public.pagos_pedido;
create policy pagos_pedido_facturacion on public.pagos_pedido for select
  using ((select es_facturacion()) and es_prueba = (select es_cuenta_prueba()));

-- ── La cotización del expediente ───────────────────────────────────────────
-- Solo la enlazada a un cierre: Finanzas y Facturación no navegan las
-- cotizaciones de los comerciales, miran la que sostiene la venta.
drop policy if exists cotizaciones_del_cierre_finanzas on public.cotizaciones;
create policy cotizaciones_del_cierre_finanzas on public.cotizaciones for select
  using (((select es_finanzas()) or (select es_facturacion()))
         and exists (select 1 from informes_cierre ic where ic.cotizacion_id = cotizaciones.id));

drop policy if exists items_del_cierre_finanzas on public.cotizacion_items;
create policy items_del_cierre_finanzas on public.cotizacion_items for select
  using (((select es_finanzas()) or (select es_facturacion()))
         and exists (select 1 from informes_cierre ic where ic.cotizacion_id = cotizacion_items.cotizacion_id));

drop policy if exists versiones_del_cierre_finanzas on public.cotizacion_versiones;
create policy versiones_del_cierre_finanzas on public.cotizacion_versiones for select
  using (((select es_finanzas()) or (select es_facturacion()))
         and exists (select 1 from informes_cierre ic where ic.cotizacion_id = cotizacion_versiones.cotizacion_id));

-- ── El historial de liquidaciones ──────────────────────────────────────────
create table if not exists public.liquidaciones_pedido (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_postventa (id) on delete cascade,
  path text not null,
  nombre text not null,
  -- Lo que dice la liquidación del pago: sin pago (se factura para que pague),
  -- a cuenta, o cancelado al 100 %. 'sin_dato' para las de antes de hoy.
  estado_pago text not null default 'sin_dato'
    check (estado_pago in ('sin_dato', 'pendiente_pago', 'pago_parcial', 'cancelado')),
  -- El número de la factura, o null = «factura pendiente».
  factura_numero text,
  nota text,
  subida_por uuid references public.perfiles (id),
  subida_at timestamptz not null default now(),
  es_prueba boolean not null default false
);
comment on table public.liquidaciones_pedido is
  'Cada liquidación que Finanzas subió para un pedido (0306). La última es la vigente (servicios_postventa.liquidacion_adjunto).';
create index if not exists ix_liquidaciones_pedido_servicio on public.liquidaciones_pedido (servicio_id, subida_at desc);

alter table public.liquidaciones_pedido enable row level security;
drop policy if exists liquidaciones_lectura on public.liquidaciones_pedido;
create policy liquidaciones_lectura on public.liquidaciones_pedido for select
  using ((select ve_documentos_de_finanzas()) and es_prueba = (select es_cuenta_prueba()));

-- Las que ya estaban subidas entran como la primera del historial.
insert into public.liquidaciones_pedido (servicio_id, path, nombre, subida_por, subida_at, es_prueba)
select s.id, s.liquidacion_adjunto->>'path', coalesce(s.liquidacion_adjunto->>'nombre', 'liquidacion.pdf'),
       s.liquidacion_subida_por, coalesce(s.liquidacion_subida_at, s.updated_at), s.es_prueba
  from public.servicios_postventa s
 where s.liquidacion_adjunto ? 'path'
   and not exists (select 1 from public.liquidaciones_pedido l where l.servicio_id = s.id and l.path = s.liquidacion_adjunto->>'path');

-- Subir una liquidación: la primera o una actualización (pago a cuenta, la
-- factura que llegó después). Mientras Central no la acepta, es la que Central
-- revisa (como la 0290); después, queda como la vigente y en el historial.
create or replace function public.finanzas_registrar_liquidacion(
  p_servicio uuid,
  p_path text,
  p_nombre text,
  p_estado_pago text,
  p_factura text default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
begin
  if rol_actual()::text not in ('finanzas', 'gerencia', 'admin') and not coalesce(es_operaciones(), false) then
    raise exception 'La liquidación la sube Finanzas';
  end if;
  if nullif(btrim(coalesce(p_path, '')), '') is null then raise exception 'Falta el archivo de la liquidación'; end if;
  if p_path !~* ('^liquidaciones/' || p_servicio::text || '/[^/]+$') then
    raise exception 'La liquidación no tiene una ruta válida';
  end if;
  if coalesce(p_estado_pago, '') not in ('pendiente_pago', 'pago_parcial', 'cancelado') then
    raise exception 'Diga qué dice la liquidación del pago: pendiente, a cuenta o cancelado';
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;

  insert into liquidaciones_pedido (servicio_id, path, nombre, estado_pago, factura_numero, nota, subida_por, es_prueba)
  values (p_servicio, p_path, coalesce(nullif(btrim(p_nombre), ''), 'liquidacion.pdf'), p_estado_pago,
          nullif(upper(btrim(coalesce(p_factura, ''))), ''), nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), v_s.es_prueba);

  update servicios_postventa
     set liquidacion_adjunto = jsonb_build_object('path', p_path, 'nombre', coalesce(nullif(btrim(p_nombre), ''), 'liquidacion.pdf')),
         liquidacion_subida_at = now(),
         liquidacion_subida_por = auth.uid(),
         liquidacion_rechazada_at = case when v_s.liquidacion_at is null then null else liquidacion_rechazada_at end,
         liquidacion_rechazada_por = case when v_s.liquidacion_at is null then null else liquidacion_rechazada_por end,
         liquidacion_rechazada_motivo = case when v_s.liquidacion_at is null then null else liquidacion_rechazada_motivo end,
         updated_at = now()
   where id = p_servicio;
end $$;
revoke all on function public.finanzas_registrar_liquidacion(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.finanzas_registrar_liquidacion(uuid, text, text, text, text, text) to authenticated;

-- ── Las facturas ───────────────────────────────────────────────────────────
create table if not exists public.facturas_pedido (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_postventa (id) on delete cascade,
  numero text not null,
  fecha_emision date not null,
  path text,
  nombre text,
  nota text,
  registrada_por uuid not null references public.perfiles (id),
  created_at timestamptz not null default now(),
  es_prueba boolean not null default false,
  unique (servicio_id, numero)
);
comment on table public.facturas_pedido is 'Las facturas de un pedido, registradas por Facturación (0306).';
create index if not exists ix_facturas_pedido_servicio on public.facturas_pedido (servicio_id);
create index if not exists ix_facturas_pedido_fecha on public.facturas_pedido (created_at desc);

alter table public.facturas_pedido enable row level security;
drop policy if exists facturas_lectura on public.facturas_pedido;
create policy facturas_lectura on public.facturas_pedido for select
  using ((select ve_documentos_de_finanzas()) and es_prueba = (select es_cuenta_prueba()));

-- La observación del facturador: el expediente no está alineado (la OC dice
-- otro RUC, la cotización no es la del cierre…). Se limpia al facturar.
alter table public.servicios_postventa
  add column if not exists facturacion_observada_at timestamptz,
  add column if not exists facturacion_observada_por uuid references public.perfiles (id),
  add column if not exists facturacion_observada_motivo text;
comment on column public.servicios_postventa.facturacion_observada_at is
  'Facturación paró el pedido: el expediente no está alineado (0306). Se limpia al registrar la factura.';

create or replace function public.facturacion_registrar_factura(
  p_servicio uuid,
  p_numero text,
  p_fecha date,
  p_path text default null,
  p_nombre text default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
  v_numero text := upper(regexp_replace(btrim(coalesce(p_numero, '')), '[[:space:]]+', '', 'g'));
begin
  if rol_actual()::text not in ('facturacion', 'finanzas', 'gerencia', 'admin') then
    raise exception 'La factura la registra Facturación';
  end if;
  if length(v_numero) < 4 then raise exception 'Escriba el número de la factura (serie y número)'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de emisión'; end if;
  if p_fecha > (now() at time zone 'America/Lima')::date then raise exception 'La fecha de emisión no puede ser futura'; end if;
  if p_path is not null and p_path !~* ('^facturas/' || p_servicio::text || '/[^/]+$') then
    raise exception 'La factura no tiene una ruta válida';
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if exists (select 1 from facturas_pedido where servicio_id = p_servicio and numero = v_numero) then
    raise exception 'La factura % ya está registrada en este pedido', v_numero;
  end if;

  insert into facturas_pedido (servicio_id, numero, fecha_emision, path, nombre, nota, registrada_por, es_prueba)
  values (p_servicio, v_numero, p_fecha, p_path, nullif(btrim(coalesce(p_nombre, '')), ''),
          nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), v_s.es_prueba);

  update servicios_postventa
     set facturacion_observada_at = null,
         facturacion_observada_por = null,
         facturacion_observada_motivo = null,
         updated_at = now()
   where id = p_servicio;
end $$;
revoke all on function public.facturacion_registrar_factura(uuid, text, date, text, text, text) from public, anon;
grant execute on function public.facturacion_registrar_factura(uuid, text, date, text, text, text) to authenticated;

create or replace function public.facturacion_observar(p_servicio uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if rol_actual()::text not in ('facturacion', 'finanzas', 'gerencia', 'admin') then
    raise exception 'El expediente lo observa Facturación';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Diga qué no está alineado en el expediente'; end if;
  update servicios_postventa
     set facturacion_observada_at = now(),
         facturacion_observada_por = auth.uid(),
         facturacion_observada_motivo = btrim(p_motivo),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;
revoke all on function public.facturacion_observar(uuid, text) from public, anon;
grant execute on function public.facturacion_observar(uuid, text) to authenticated;

-- Central levanta la observación cuando corrigió (o explicó) lo observado.
create or replace function public.facturacion_levantar_observacion(p_servicio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if rol_actual()::text not in ('facturacion', 'finanzas', 'central', 'gerencia', 'admin') and not coalesce(es_operaciones(), false) then
    raise exception 'No puede levantar esta observación';
  end if;
  update servicios_postventa
     set facturacion_observada_at = null,
         facturacion_observada_por = null,
         facturacion_observada_motivo = null,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
end $$;
revoke all on function public.facturacion_levantar_observacion(uuid) from public, anon;
grant execute on function public.facturacion_levantar_observacion(uuid) to authenticated;

-- ── Quién abre qué archivo ─────────────────────────────────────────────────
-- Hasta hoy cualquier sesión podía firmar cualquier ruta del bucket. Las
-- capturas con que Finanzas confirma un abono (`finanzas/…`) quedan para
-- Finanzas y gerencia; las liquidaciones y facturas, para el circuito del
-- pedido (no el comercial). El resto del bucket, como estaba.
drop policy if exists adjuntos_lectura on storage.objects;
create policy adjuntos_lectura on storage.objects for select
  using (
    bucket_id = 'adjuntos'
    and (
      name not like 'finanzas/%' or public.es_finanzas() or public.es_backoffice()
    )
    and (
      (name not like 'liquidaciones/%' and name not like 'facturas/%') or public.ve_documentos_de_finanzas()
    )
  );
