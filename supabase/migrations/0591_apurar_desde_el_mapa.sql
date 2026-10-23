-- 0591 · «Apurar» desde el mapa del recorrido
--
-- Santos, 23-10-2026: «para caso de cliente se muestre en postventa una sección
-- que diga mapa… lo avanzado en verde suave, la ruta que falta en rojo y
-- palpitando la etapa donde se encuentra atascada, y ahí un botón que diga
-- apurar al área donde está atorado». El mapa también lo ven el comercial
-- (si el pedido nace de una venta suya), Finanzas, Facturación / Contabilidad,
-- el almacén y operaciones.
--
-- El mapa no guarda estado propio: lee los pasos reales del pedido, las etapas
-- del caso y la recepción en planta. Lo único nuevo es el apuro: quién apuró a
-- qué área, en qué paso y cuántas veces. Es la misma sirena de la 0358 (Central
-- a almacén y Finanzas), ahora para cualquier área y desde cualquier pantalla
-- donde esté el mapa. Un apuro cada 15 minutos por área y por recorrido; del
-- 2.º en adelante gerencia también se entera (lo manda la acción del servidor).

create table if not exists apuros_del_mapa (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('pedido', 'caso', 'recepcion')),
  servicio_id  uuid references servicios_postventa (id) on delete cascade,
  atencion_id  uuid references atenciones (id) on delete cascade,
  recepcion_id uuid references recepciones_equipo (id) on delete cascade,
  area         text not null check (area in ('central', 'almacen', 'finanzas', 'contabilidad', 'postventa')),
  paso         text not null,
  etiqueta     text,
  enviado_por  uuid not null references perfiles (id),
  es_prueba    boolean not null default false,
  created_at   timestamptz not null default now(),
  check (num_nonnulls(servicio_id, atencion_id, recepcion_id) = 1)
);
create index if not exists ix_apuros_del_mapa_servicio on apuros_del_mapa (servicio_id, area, created_at desc) where servicio_id is not null;
create index if not exists ix_apuros_del_mapa_atencion on apuros_del_mapa (atencion_id, area, created_at desc) where atencion_id is not null;
create index if not exists ix_apuros_del_mapa_recepcion on apuros_del_mapa (recepcion_id, area, created_at desc) where recepcion_id is not null;

alter table apuros_del_mapa enable row level security;
revoke all on public.apuros_del_mapa from anon;
grant select on public.apuros_del_mapa to authenticated;
grant all on public.apuros_del_mapa to service_role;

-- Piloto local: la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.apuros_del_mapa';
    execute 'create trigger zz_sync after insert or update or delete on public.apuros_del_mapa for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- Lo ve todo el que ve el mapa, dentro de su mundo (real / práctica). El insert solo entra por la función.
drop policy if exists apuros_del_mapa_select on apuros_del_mapa;
create policy apuros_del_mapa_select on apuros_del_mapa for select to authenticated
  using (es_prueba = coalesce(es_cuenta_prueba(), false));

create or replace function apurar_desde_el_mapa(p_tipo text, p_id uuid, p_area text, p_paso text, p_etiqueta text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
  v_cerrado timestamptz;
  v_cliente text;
  v_codigo text;
  v_servicio uuid;
  v_creador uuid;
  v_ultimo timestamptz;
  v_n int;
  v_solo_comercial boolean;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión'; end if;
  if p_tipo not in ('pedido', 'caso', 'recepcion') then raise exception 'Recorrido no válido'; end if;
  if p_area not in ('central', 'almacen', 'finanzas', 'contabilidad', 'postventa') then
    raise exception 'A esa área no se la puede apurar desde el mapa';
  end if;
  if nullif(trim(coalesce(p_paso, '')), '') is null then raise exception 'Falta el paso'; end if;

  -- El comercial puro solo ve (y apura) los pedidos que nacen de una venta suya.
  v_solo_comercial := rol_actual() = 'comercial'::rol_usuario
    and not coalesce(es_postventa(), false) and not coalesce(es_almacen(), false) and not coalesce(es_soporte(), false);

  if p_tipo = 'pedido' then
    select s.cerrado_at, coalesce(nullif(trim(s.cliente_texto), ''), c.razon_social), s.numero_pedido_erp, s.id, i.creado_por
      into v_cerrado, v_cliente, v_codigo, v_servicio, v_creador
      from servicios_postventa s
      left join informes_cierre i on i.id = s.informe_cierre_id
      left join cuentas c on c.id = s.cuenta_id
     where s.id = p_id and s.es_prueba = v_prueba;
    if v_servicio is null then raise exception 'El pedido no existe'; end if;
    if v_solo_comercial and v_creador is distinct from auth.uid() then
      raise exception 'Solo puede apurar los pedidos de sus ventas';
    end if;
    select max(created_at), count(*) + 1 into v_ultimo, v_n
      from apuros_del_mapa where servicio_id = p_id and area = p_area;
  elsif p_tipo = 'caso' then
    if v_solo_comercial then raise exception 'Los casos de postventa los apura postventa'; end if;
    select a.cerrado_at, coalesce(nullif(trim(a.cliente_texto), ''), c.razon_social), a.codigo, a.id
      into v_cerrado, v_cliente, v_codigo, v_servicio
      from atenciones a
      left join cuentas c on c.id = a.cuenta_id
     where a.id = p_id and coalesce(a.es_prueba, false) = v_prueba;
    if v_servicio is null then raise exception 'El caso no existe'; end if;
    select max(created_at), count(*) + 1 into v_ultimo, v_n
      from apuros_del_mapa where atencion_id = p_id and area = p_area;
  else
    if v_solo_comercial then raise exception 'Las recepciones en planta las apura postventa'; end if;
    select coalesce(r.listo_at, r.anulada_at), r.equipo_texto, r.codigo, r.id
      into v_cerrado, v_cliente, v_codigo, v_servicio
      from recepciones_equipo r
     where r.id = p_id and coalesce(r.es_prueba, false) = v_prueba;
    if v_servicio is null then raise exception 'La recepción no existe'; end if;
    select max(created_at), count(*) + 1 into v_ultimo, v_n
      from apuros_del_mapa where recepcion_id = p_id and area = p_area;
  end if;

  if v_cerrado is not null then raise exception 'Este recorrido ya terminó: no hay nada que apurar'; end if;
  if v_ultimo is not null and v_ultimo > now() - interval '15 minutes' then
    raise exception 'Ya se apuró a esta área a las %. Se puede volver a apurar desde las %.',
      to_char(v_ultimo at time zone 'America/Lima', 'HH24:MI'),
      to_char((v_ultimo + interval '15 minutes') at time zone 'America/Lima', 'HH24:MI');
  end if;

  insert into apuros_del_mapa (tipo, servicio_id, atencion_id, recepcion_id, area, paso, etiqueta, enviado_por, es_prueba)
  values (
    p_tipo,
    case when p_tipo = 'pedido' then p_id end,
    case when p_tipo = 'caso' then p_id end,
    case when p_tipo = 'recepcion' then p_id end,
    p_area, trim(p_paso), nullif(trim(coalesce(p_etiqueta, '')), ''), auth.uid(), v_prueba
  );

  return jsonb_build_object('cliente', coalesce(v_cliente, ''), 'codigo', v_codigo, 'aviso_numero', v_n, 'es_prueba', v_prueba);
end;
$$;

revoke all on function apurar_desde_el_mapa(text, uuid, text, text, text) from public, anon;
grant execute on function apurar_desde_el_mapa(text, uuid, text, text, text) to authenticated;
