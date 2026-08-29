-- ============================================================
-- CRM EFAMEINSA · Migración 0117 · El stock del almacén
-- ============================================================
-- Pedido de Darwin del 28-08, cerrando la vuelta del catálogo: «aparte del
-- resto, la parte de inventarios» — cuántas máquinas hay disponibles de cada
-- modelo, con su número de serie, para saber si se puede prometer entrega
-- inmediata al cotizar.
--
-- UNA FILA POR MÁQUINA, NO UN CONTADOR. Un número «hay 3 lavadoras RX135» no
-- sirve acá: cuando la máquina sale, sale UNA, con su serie, y esa serie es el
-- eje de toda la trazabilidad —«trabajamos con el número de serie siendo el
-- patrón para toda la trazabilidad» (Carlos, 27-08)—. La misma serie que hoy
-- está en el almacén es la que mañana va a estar en `equipos_instalados` con su
-- garantía y su historial. Un contador rompería esa cadena en el punto exacto
-- donde importa.
--
-- QUIÉN LO MANTIENE: operaciones. Quién lo mira: todos, porque el comercial
-- necesita saber si puede prometer entrega antes de cotizar, y postventa si hay
-- una máquina para reponer.

do $$ begin
  create type estado_inventario as enum ('disponible', 'reservado', 'despachado', 'baja');
exception when duplicate_object then null; end $$;

create table if not exists inventario_equipos (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references productos(id),
  serie         text not null,
  estado        estado_inventario not null default 'disponible',
  ubicacion     text,
  ingreso_at    date not null default current_date,
  nota          text,

  -- Cuando se aparta para un cliente concreto. No se apartan solas: hoy lo hace
  -- operaciones a pedido del comercial, igual que el resto de los permisos.
  reservado_para uuid references cuentas(id),
  reservado_at   timestamptz,
  reservado_por  uuid references perfiles(id),

  -- Cuando sale del almacén, de qué cierre salió.
  salida_at         timestamptz,
  informe_cierre_id uuid references informes_cierre(id),

  creado_por uuid references perfiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  es_prueba  boolean not null default es_cuenta_prueba()
);

comment on table inventario_equipos is
  'El stock del almacén, una fila por máquina física con su número de serie (migración 0117). La misma serie viaja después a equipos_instalados.';

-- La serie identifica una máquina en el mundo: no puede haber dos. Las dadas de
-- baja quedan fuera del índice para poder recargar una serie corregida.
create unique index if not exists uq_inventario_serie
  on inventario_equipos (upper(serie)) where estado <> 'baja';

create index if not exists ix_inventario_producto on inventario_equipos (producto_id, estado);

drop trigger if exists trg_inventario_updated on inventario_equipos;
create trigger trg_inventario_updated before update on inventario_equipos
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
alter table inventario_equipos enable row level security;

-- Lo ve todo el mundo: el comercial para prometer entrega, postventa para
-- reponer, Central para despachar. Es información de la empresa, no de nadie.
drop policy if exists inventario_lectura on inventario_equipos;
create policy inventario_lectura on inventario_equipos for select to authenticated
using (es_prueba = (select es_cuenta_prueba()));

-- Lo mantiene operaciones. Un comercial no se agrega máquinas.
drop policy if exists inventario_escribe on inventario_equipos;
create policy inventario_escribe on inventario_equipos for all to authenticated
using ((select es_operaciones()) or (select es_backoffice()))
with check ((select es_operaciones()) or (select es_backoffice()));

-- ------------------------------------------------------------
-- Cuánto hay de cada modelo. Va como función porque PostgREST no agrupa, y
-- contar en el navegador obligaría a bajarse el almacén entero a cada pantalla.
create or replace function stock_por_producto()
returns table (producto_id uuid, disponibles integer, reservados integer, despachados integer)
language sql stable security definer set search_path = public as $fn$
  select i.producto_id,
         count(*) filter (where i.estado = 'disponible')::integer,
         count(*) filter (where i.estado = 'reservado')::integer,
         count(*) filter (where i.estado = 'despachado')::integer
    from inventario_equipos i
   where i.es_prueba = es_cuenta_prueba()
   group by i.producto_id;
$fn$;

revoke all on function stock_por_producto() from public;
grant execute on function stock_por_producto() to authenticated;

-- ------------------------------------------------------------
-- Cargar varias máquinas de una vez. El stock llega en una lista de series
-- pegada de un Excel, no de a una: obligar a un formulario por máquina es
-- garantizar que el inventario nunca se cargue.
--
-- Devuelve qué entró y qué no, con el motivo. Una serie repetida no aborta la
-- carga entera —eso haría perder las otras cuarenta— pero se informa.
create or replace function cargar_series_inventario(
  p_producto uuid,
  p_series   text[],
  p_ubicacion text default null,
  p_nota      text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_serie text;
  v_limpia text;
  v_cargadas int := 0;
  v_repetidas text[] := '{}';
  v_invalidas text[] := '{}';
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El inventario lo carga operaciones';
  end if;
  if not exists (select 1 from productos where id = p_producto) then
    raise exception 'Ese equipo no está en el catálogo';
  end if;

  foreach v_serie in array coalesce(p_series, '{}') loop
    v_limpia := btrim(v_serie);
    -- Una serie sin ningún dígito casi siempre es basura pegada del Excel (un
    -- encabezado, un «S/N»): se aparta en vez de ensuciar el almacén. Misma
    -- regla que ya se usó al leer las series de las fichas.
    if v_limpia = '' then
      continue;
    elsif v_limpia !~ '[0-9]' then
      v_invalidas := v_invalidas || v_limpia;
    elsif exists (select 1 from inventario_equipos i
                   where upper(i.serie) = upper(v_limpia) and i.estado <> 'baja') then
      v_repetidas := v_repetidas || v_limpia;
    else
      insert into inventario_equipos (producto_id, serie, ubicacion, nota)
      values (p_producto, v_limpia, p_ubicacion, p_nota);
      v_cargadas := v_cargadas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'cargadas', v_cargadas,
    'repetidas', to_jsonb(v_repetidas),
    'invalidas', to_jsonb(v_invalidas)
  );
end;
$fn$;

revoke all on function cargar_series_inventario(uuid, text[], text, text) from public;
grant execute on function cargar_series_inventario(uuid, text[], text, text) to authenticated;

-- ------------------------------------------------------------
-- Cambiar el estado de una máquina, con la regla de a dónde puede ir cada una.
create or replace function mover_equipo_inventario(
  p_id uuid,
  p_estado text,
  p_cuenta uuid default null,
  p_nota text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_eq record;
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El inventario lo mueve operaciones';
  end if;

  select * into v_eq from inventario_equipos where id = p_id;
  if not found then raise exception 'Esa máquina no está en el inventario'; end if;
  if p_estado not in ('disponible', 'reservado', 'despachado', 'baja') then
    raise exception 'Estado desconocido: %', p_estado;
  end if;
  if p_estado = 'reservado' and p_cuenta is null then
    raise exception 'Para reservar hay que decir para qué cliente';
  end if;

  update inventario_equipos
     set estado = p_estado::estado_inventario,
         reservado_para = case when p_estado = 'reservado' then p_cuenta else null end,
         reservado_at   = case when p_estado = 'reservado' then now() else null end,
         reservado_por  = case when p_estado = 'reservado' then auth.uid() else null end,
         salida_at      = case when p_estado = 'despachado' then coalesce(v_eq.salida_at, now()) else null end,
         nota           = coalesce(p_nota, nota)
   where id = p_id;

  return jsonb_build_object('serie', v_eq.serie, 'estado', p_estado);
end;
$fn$;

revoke all on function mover_equipo_inventario(uuid, text, uuid, text) from public;
grant execute on function mover_equipo_inventario(uuid, text, uuid, text) to authenticated;
