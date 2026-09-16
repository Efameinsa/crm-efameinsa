-- ============================================================
-- CRM EFAMEINSA · Migración 0237 · El comercial se entera, y el rechazo queda escrito
-- ============================================================
-- Reunión del 15-09 (Carlos con Central y por teléfono con Brenda y Lesly).
--
-- 1. BUNGARENA. Central anuló el cierre 018-2026 a las 9:54 con el PIN de
--    gerencia; Brenda no se enteró y llamó a Santos a pedirle que lo anule.
--    Carlos: «lo más importante es que no informa nada al comercial… una
--    notificación saldría, que la Central te ha anulado y el motivo». Al
--    anular, el comercial recibe el aviso con el motivo tal como lo escribió
--    Central.
--
-- 2. LOS RECHAZOS DE GERENCIA. Caso Brenda (lavadora de 17 kg, lista 3 950,
--    cotizada a 3 800, pidió 3 650 y después 3 750; Carlos rechazó dos veces
--    con retroalimentación y el cliente mandó la OC a 3 800). El comercial
--    solo veía en la campanita «Gerencia rechazó un equipo de su
--    cotización» sin decir cuál, y al corregir la cotización «chancaba» el
--    texto de gerencia. Carlos: «que quede como histórico… los rechazados ya
--    no se pueden editar, que genere otro».
--      · `cotizacion_decisiones`: cada aprobación o rechazo de gerencia queda
--        con quién, cuándo, la nota y qué equipos rechazó.
--      · La cotización rechazada ya no se edita: se hace una nueva.
--
-- 3. EJECUTAR SIN LIQUIDACIÓN PIDE CÓDIGO. Tunupa y Gary Group: Central marcó
--    «Pedido ejecutado» sin la liquidación para que postventa avanzara, y
--    postventa aprobó antes de que llegara el segundo check. Carlos: «primero
--    liquidación y luego pedido ejecutado… y ya la orden está para que pida
--    un PIN si es que volvemos a hacer eso». Marcar ejecutado con la
--    liquidación pendiente sigue siendo posible, pero como excepción con el
--    código de gerencia u operaciones, y queda quién la autorizó.
-- ============================================================

-- ── 1. Al anular un cierre, el comercial recibe el aviso ─────────────────
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'anular_cierre';
  v_nueva := replace(v_def,
    $old$  perform set_config('app.anulando_cierre', '', true);$old$,
    $new$  perform set_config('app.anulando_cierre', '', true);

  -- El comercial se entera al toque, con el motivo (0237, caso Bungarena).
  if v_inf.creado_por is not null and v_inf.creado_por <> v_quien then
    perform crear_notificacion(
      v_inf.creado_por, null, 'cierre_anulado',
      format('Central anuló su cierre N.º %s · %s', v_inf.codigo, v_inf.cliente_nombre),
      format('Motivo: %s. Si la venta sigue en pie, emita un cierre nuevo; el correlativo sigue de largo.', btrim(p_motivo)),
      '/comercial/cierres/' || p_informe::text);
  end if;$new$);
  if v_nueva = v_def then raise exception 'anular_cierre: no se encontró el cierre del set_config'; end if;
  execute v_nueva;
end $$;

-- ── 2. El histórico de decisiones de gerencia ────────────────────────────
create table if not exists public.cotizacion_decisiones (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references public.cotizaciones (id) on delete cascade,
  oportunidad_id uuid references public.oportunidades (id) on delete set null,
  decidido_por   uuid references public.perfiles (id),
  decidido_at    timestamptz not null default now(),
  resultado      text not null check (resultado in ('aprobada_gerencia', 'rechazada_gerencia')),
  nota           text,
  -- Los equipos rechazados, con el precio que se pidió y el de lista, para
  -- que la observación se lea sin abrir la cotización.
  rechazados     jsonb not null default '[]'::jsonb,
  aprobados      jsonb not null default '[]'::jsonb
);
create index if not exists ix_cot_decisiones_cot on public.cotizacion_decisiones (cotizacion_id, decidido_at desc);
create index if not exists ix_cot_decisiones_op on public.cotizacion_decisiones (oportunidad_id, decidido_at desc);
comment on table public.cotizacion_decisiones is
  'Cada aprobación o rechazo de gerencia sobre una cotización, con la nota (0237). La cotización rechazada no se edita: queda como histórico y el comercial hace otra.';

alter table public.cotizacion_decisiones enable row level security;
drop policy if exists cot_decisiones_select on public.cotizacion_decisiones;
create policy cot_decisiones_select on public.cotizacion_decisiones for select
  using (
    (select es_backoffice())
    or exists (select 1 from oportunidades o
                where o.id = cotizacion_decisiones.oportunidad_id
                  and (o.comercial_id = (select auth.uid())
                       or exists (select 1 from cuentas c where c.id = o.cuenta_id and c.comercial_id = (select auth.uid()))))
  );
grant select on public.cotizacion_decisiones to authenticated;

-- Lo ya decidido hasta hoy entra al histórico, para que Carlos vea sus
-- observaciones anteriores desde el primer día.
insert into public.cotizacion_decisiones (cotizacion_id, oportunidad_id, decidido_por, decidido_at, resultado, nota, rechazados, aprobados)
select c.id, c.oportunidad_id, c.aprobada_por, c.aprobada_at, c.estado_aprobacion::text, c.nota_gerencia,
       coalesce((select jsonb_agg(jsonb_build_object('descripcion', coalesce(p.marca || ' ' || p.modelo, ci.descripcion), 'precio', ci.precio_unitario, 'lista', ci.precio_lista))
                   from cotizacion_items ci left join productos p on p.id = ci.producto_id
                  where ci.cotizacion_id = c.id and ci.aprobado is false), '[]'::jsonb),
       coalesce((select jsonb_agg(jsonb_build_object('descripcion', coalesce(p.marca || ' ' || p.modelo, ci.descripcion), 'precio', ci.precio_unitario, 'lista', ci.precio_lista))
                   from cotizacion_items ci left join productos p on p.id = ci.producto_id
                  where ci.cotizacion_id = c.id and ci.aprobado is true and ci.requiere_aprobacion), '[]'::jsonb)
  from cotizaciones c
 where c.estado_aprobacion in ('aprobada_gerencia', 'rechazada_gerencia')
   and c.aprobada_at is not null
   and not exists (select 1 from cotizacion_decisiones d where d.cotizacion_id = c.id);

-- resolver_aprobacion_cotizacion deja la decisión en el histórico.
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolver_aprobacion_cotizacion';
  v_nueva := replace(v_def,
    $old$  return v_resultado;
end;$old$,
    $new$  -- El histórico de la decisión (0237): la nota de gerencia no se pierde
  -- aunque el comercial haga otra cotización.
  insert into cotizacion_decisiones (cotizacion_id, oportunidad_id, decidido_por, resultado, nota, rechazados, aprobados)
  select p_cotizacion_id, v_cot.oportunidad_id, auth.uid(), v_resultado::text, nullif(btrim(coalesce(p_nota, '')), ''),
         coalesce((select jsonb_agg(jsonb_build_object('descripcion', coalesce(pr.marca || ' ' || pr.modelo, ci.descripcion), 'precio', ci.precio_unitario, 'lista', ci.precio_lista))
                     from cotizacion_items ci left join productos pr on pr.id = ci.producto_id
                    where ci.cotizacion_id = p_cotizacion_id and ci.id = any(coalesce(p_rechazados, '{}'::uuid[]))), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('descripcion', coalesce(pr.marca || ' ' || pr.modelo, ci.descripcion), 'precio', ci.precio_unitario, 'lista', ci.precio_lista))
                     from cotizacion_items ci left join productos pr on pr.id = ci.producto_id
                    where ci.cotizacion_id = p_cotizacion_id and ci.id = any(coalesce(p_aprobados, '{}'::uuid[]))), '[]'::jsonb);

  return v_resultado;
end;$new$);
  if v_nueva = v_def then raise exception 'resolver_aprobacion_cotizacion: no se encontró el return'; end if;
  execute v_nueva;
end $$;

-- La cotización rechazada no se edita: se hace otra (se parcha la definición
-- viva de editar_cotizacion, nunca se copia).
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'editar_cotizacion';
  v_nueva := replace(v_def,
    $old$  -- Solo el dueño de la oportunidad (o backoffice) la edita.$old$,
    $new$  -- LA RECHAZADA QUEDA COMO HISTÓRICO (Carlos, 15-09; 0237): con el motivo
  -- de gerencia a la vista, y el comercial hace una cotización nueva.
  if v_cot.estado_aprobacion = 'rechazada_gerencia' and coalesce(current_setting('app.corrigiendo_cotizacion', true), '') <> 'si' then
    raise exception 'Gerencia rechazó esta cotización y queda como histórico con su motivo. Haga una cotización nueva con los precios corregidos.';
  end if;

  -- Solo el dueño de la oportunidad (o backoffice) la edita.$new$);
  if v_nueva = v_def then raise exception 'editar_cotizacion: no se encontró el comentario del dueño'; end if;
  execute v_nueva;
end $$;

-- ── 3. Ejecutar sin liquidación: excepción con código ────────────────────
alter table public.servicios_postventa
  add column if not exists ejecutado_sin_liquidacion_autorizo uuid references public.perfiles (id);
comment on column public.servicios_postventa.ejecutado_sin_liquidacion_autorizo is
  'Quién dio el código para marcar «Pedido ejecutado» con la liquidación todavía pendiente (0237).';

-- ── 3b. Qué se vendió decide el circuito (Carlos, 15-09; la pantalla lo usa
--        en la 0239, pero la columna la necesita esta función) ────────────
-- «Debería seleccionarse que es venta de repuesto o venta de equipo… repuesto
-- con entrega en planta o entrega en agencia, y con instalación o sin
-- instalación. Check, check y me despliega todo esto. Porque si no, siempre
-- voy a tener todo este proceso».
alter table public.servicios_postventa
  add column if not exists tipo_pedido text not null default 'equipo'
    check (tipo_pedido in ('equipo', 'repuesto', 'mantenimiento', 'revision')),
  add column if not exists entrega_en text
    check (entrega_en in ('planta', 'agencia', 'cliente')),
  add column if not exists con_instalacion boolean;
comment on column public.servicios_postventa.tipo_pedido is
  'equipo (circuito completo) · repuesto (sin plano ni puesta en marcha salvo con_instalacion) · mantenimiento / revision (programar, ejecutar, informe, cerrar). 0237/0239.';
comment on column public.servicios_postventa.entrega_en is
  'Solo repuestos: planta (el cliente lo recoge), agencia o cliente (se despacha).';

-- Primera lectura del tipo a partir de los renglones del informe de cierre;
-- postventa lo corrige en la ficha del pedido cuando no coincide.
create or replace function public.tipo_pedido_del_informe(p_items jsonb)
returns text
language sql
immutable
as $$
  with v as (
    select coalesce(x->>'tipo', 'equipo') as tipo, lower(coalesce(x->>'descripcion', '')) as d
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
     where coalesce(x->>'bloque', 'venta') = 'venta'
  )
  select case
    when not exists (select 1 from v) then 'equipo'
    when bool_and(tipo = 'repuesto') then 'repuesto'
    when bool_and(tipo = 'servicio') and bool_or(d ~ 'revisi') and not bool_or(d ~ 'manteni') then 'revision'
    when bool_and(tipo = 'servicio') then 'mantenimiento'
    else 'equipo' end
  from v;
$$;

drop function if exists public.liberar_pedido_postventa(uuid, text, boolean, boolean);
create or replace function public.liberar_pedido_postventa(
  p_informe_id uuid,
  p_numero_pedido text default null,
  p_marcar_pedido boolean default true,
  p_marcar_liquidacion boolean default false,
  p_pin text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_informe informes_cierre%rowtype;
  v_servicio_id uuid;
  v_equipos text;
  v_modalidad text;
  v_liq timestamptz;
  v_autorizo uuid;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin') then
    raise exception 'Solo Central puede liberar un pedido a postventa';
  end if;

  select * into v_informe from informes_cierre where id = p_informe_id;
  if v_informe is null then
    raise exception 'Informe de cierre no encontrado';
  end if;
  if v_informe.emitido_at is null then
    raise exception 'El informe todavía es un borrador del comercial';
  end if;

  select id, liquidacion_at into v_servicio_id, v_liq
    from servicios_postventa where informe_cierre_id = p_informe_id limit 1;

  -- PRIMERO LA LIQUIDACIÓN, DESPUÉS EL PEDIDO EJECUTADO (Carlos, 15-09). Si
  -- hay que ejecutar antes —para que postventa pruebe y embale mientras
  -- Finanzas termina—, es con el código de gerencia u operaciones, y queda
  -- quién lo autorizó.
  if p_marcar_pedido and not p_marcar_liquidacion and v_liq is null then
    if nullif(btrim(coalesce(p_pin, '')), '') is null then
      raise exception 'La liquidación todavía no está marcada. Márquela primero, o pida el código de gerencia u operaciones para ejecutar el pedido sin ella.';
    end if;
    v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  end if;

  select string_agg(x->>'descripcion', E'\n') into v_equipos
    from jsonb_array_elements(v_informe.items) x
   where coalesce(x->>'bloque', 'venta') = 'venta';

  v_modalidad := case
    when coalesce(v_informe.entrega_lugar, '') ~* 'agencia|shalom|transport|marvisur|olva|cruz del sur'
      then 'provincia' else 'lima' end;

  if v_servicio_id is null then
    insert into servicios_postventa (
      informe_cierre_id, cuenta_id, cliente_texto, fecha_confirmacion,
      ubicacion, equipo, tipo_servicio, observaciones,
      monto, moneda, forma_pago, modalidad,
      pct_antes_despacho, credito_dias,
      direccion_entrega, despacho_nota, numero_pedido_erp, origen,
      tipo_pedido
    ) values (
      p_informe_id, v_informe.cuenta_id,
      coalesce(v_informe.cliente_doc || ' - ', '') || v_informe.cliente_nombre,
      v_informe.fecha,
      v_informe.entrega_lugar, coalesce(v_equipos, 'Sin detalle'),
      'ENTREGA DE EQUIPO', v_informe.nota_despacho,
      v_informe.monto_total, v_informe.moneda,
      array_to_string(v_informe.modalidad_pago, ' + '), v_modalidad,
      v_informe.pct_antes_despacho, v_informe.credito_dias,
      coalesce(v_informe.entrega_direccion, v_informe.entrega_lugar),
      v_informe.entrega_fecha, p_numero_pedido, 'crm',
      tipo_pedido_del_informe(v_informe.items)
    ) returning id into v_servicio_id;
  elsif p_numero_pedido is not null then
    update servicios_postventa set numero_pedido_erp = p_numero_pedido where id = v_servicio_id;
  end if;

  if p_marcar_pedido then
    update servicios_postventa
       set pedido_ejecutado_at = coalesce(pedido_ejecutado_at, now()),
           pedido_ejecutado_por = coalesce(pedido_ejecutado_por, auth.uid()),
           ejecutado_sin_liquidacion_autorizo = coalesce(ejecutado_sin_liquidacion_autorizo, v_autorizo)
     where id = v_servicio_id;
  end if;

  if p_marcar_liquidacion then
    update servicios_postventa
       set liquidacion_at = coalesce(liquidacion_at, now()),
           liquidacion_por = coalesce(liquidacion_por, auth.uid())
     where id = v_servicio_id;
  end if;

  return v_servicio_id;
end;
$$;
revoke all on function public.liberar_pedido_postventa(uuid, text, boolean, boolean, text) from public;
grant execute on function public.liberar_pedido_postventa(uuid, text, boolean, boolean, text) to authenticated;
