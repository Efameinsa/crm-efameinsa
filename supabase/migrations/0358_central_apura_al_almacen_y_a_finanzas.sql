-- 0358 · Central apura al almacén (series) y a Finanzas (liquidación) desde el cierre
--
-- Central, 30-09-2026 16:46 (pantallazo de un cierre «Por liberar»): «favor
-- acoplar botón de alerta con alarma, notificación y todo, para apresurar a
-- almacén y a liquidaciones Finanzas, que se apuren en hacer su gestión».
--
-- La sirena a Finanzas de la 0298 solo vale con el pedido ya liberado (paso 4);
-- en los pasos 1 (series) y 3 (liquidación) Central no tenía cómo apurar más
-- que por WhatsApp. Esta es la misma sirena, en esos dos pasos:
--   · almacén: cuando Central ya le pidió las series y falta alguna.
--   · Finanzas: cuando el pedido ya tiene número (antes Finanzas no lo ve en
--     «Liquidar») y la liquidación no está subida.
-- Queda registrado (quién, cuándo, cuántas veces) y el pedido lleva la marca
-- para que la tarjeta diga «Apurado 16:50 · 2 veces». Un apuro cada 10 minutos
-- por área, para que la sirena no pierda fuerza. Del 2.º en adelante gerencia
-- también se entera (lo manda la acción del servidor, como en la 0298).

alter table servicios_postventa
  add column if not exists apuro_almacen_at  timestamptz,
  add column if not exists apuro_almacen_n   int not null default 0,
  add column if not exists apuro_finanzas_at timestamptz,
  add column if not exists apuro_finanzas_n  int not null default 0;

create table if not exists apuros_de_central (
  id          uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios_postventa (id) on delete cascade,
  area        text not null check (area in ('almacen', 'finanzas')),
  enviado_por uuid not null references perfiles (id),
  mensaje     text,
  created_at  timestamptz not null default now()
);
create index if not exists ix_apuros_de_central_servicio on apuros_de_central (servicio_id, area, created_at desc);

alter table apuros_de_central enable row level security;
revoke all on public.apuros_de_central from anon;
grant select on public.apuros_de_central to authenticated;
grant all on public.apuros_de_central to service_role;

-- Piloto local (29-09): la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.apuros_de_central';
    execute 'create trigger zz_sync after insert or update or delete on public.apuros_de_central for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- Lo leen quien lo envió y las áreas del circuito. El insert solo entra por la función.
drop policy if exists apuros_de_central_select on apuros_de_central;
create policy apuros_de_central_select on apuros_de_central for select to authenticated
  using (
    enviado_por = auth.uid()
    or rol_actual() in ('central'::rol_usuario, 'finanzas'::rol_usuario, 'operaciones'::rol_usuario, 'gerencia'::rol_usuario, 'admin'::rol_usuario)
    or coalesce(es_almacen(), false)
  );

create or replace function apurar_desde_central(p_servicio uuid, p_area text, p_mensaje text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_n int;
  v_ultimo timestamptz;
  v_faltan int := 0;
  v_motivo text := nullif(trim(coalesce(p_mensaje, '')), '');
begin
  if not (rol_actual() in ('central'::rol_usuario, 'operaciones'::rol_usuario) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo Central, operaciones o gerencia pueden apurar al almacén o a Finanzas';
  end if;
  if p_area not in ('almacen', 'finanzas') then raise exception 'Área no válida'; end if;

  select * into v_s
    from servicios_postventa
   where id = p_servicio
     and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'El pedido no existe'; end if;
  if v_s.cerrado_at is not null then raise exception 'Este pedido ya está cerrado: no hay nada que apurar'; end if;

  if p_area = 'almacen' then
    if v_s.series_pedidas_at is null then
      raise exception 'Todavía no le pidió las series al almacén: use «Pedir series al almacén»';
    end if;
    select count(*) into v_faltan from pedido_equipos where servicio_id = p_servicio and serie is null;
    if v_faltan = 0 then raise exception 'El almacén ya puso todas las series'; end if;
    v_ultimo := v_s.apuro_almacen_at;
  else
    if v_s.numero_pedido_erp is null then
      raise exception 'Primero genere el pedido (paso 2): sin número, Finanzas no lo ve en «Liquidar»';
    end if;
    if v_s.liquidacion_at is not null then raise exception 'La liquidación ya está aceptada'; end if;
    -- Al rechazarla, Central borra el PDF (0295): con PDF, la pelota es de Central.
    if v_s.liquidacion_adjunto is not null then
      raise exception 'Finanzas ya subió la liquidación: le toca a usted aceptarla o rechazarla';
    end if;
    v_ultimo := v_s.apuro_finanzas_at;
  end if;

  if v_ultimo is not null and v_ultimo > now() - interval '10 minutes' then
    raise exception 'Ya los apuró a las %. Podrá volver a apurar desde las %.',
      to_char(v_ultimo at time zone 'America/Lima', 'HH24:MI'),
      to_char((v_ultimo + interval '10 minutes') at time zone 'America/Lima', 'HH24:MI');
  end if;

  insert into apuros_de_central (servicio_id, area, enviado_por, mensaje)
  values (p_servicio, p_area, auth.uid(), v_motivo);

  if p_area = 'almacen' then
    v_n := coalesce(v_s.apuro_almacen_n, 0) + 1;
    update servicios_postventa set apuro_almacen_at = now(), apuro_almacen_n = v_n where id = p_servicio;
  else
    v_n := coalesce(v_s.apuro_finanzas_n, 0) + 1;
    update servicios_postventa set apuro_finanzas_at = now(), apuro_finanzas_n = v_n where id = p_servicio;
  end if;

  return jsonb_build_object(
    'servicio_id', v_s.id,
    'cliente', regexp_replace(coalesce(v_s.cliente_texto, 'Cliente'), '^[0-9]{8,11}[[:space:]]*-[[:space:]]*', ''),
    'numero_pedido', v_s.numero_pedido_erp,
    'es_prueba', coalesce(v_s.es_prueba, false),
    'faltan', v_faltan,
    'aviso_numero', v_n
  );
end;
$$;

revoke all on function apurar_desde_central(uuid, text, text) from public, anon;
grant execute on function apurar_desde_central(uuid, text, text) to authenticated, service_role;
