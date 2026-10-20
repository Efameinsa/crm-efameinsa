-- 0541: el N.º de protocolo sale solo y es correlativo (Lesly, 20-10, buzón
-- «PROTOCOLO»: «que el número de protocolo se genere en automático, que siga un
-- correlativo»). Antes se escribía a mano y quedaba de todo («1», «2»,
-- «APROBADO», «LISTO PARA DESPACHO»…).
--
-- Formato 0003-2026: cuatro cifras y el año (Lima); vuelve a 0001 cada año.
-- Las cuentas de práctica llevan su propio contador para no gastar números.
-- Se pone al marcar «Probada y embalada» (máquina del pedido, kit, pedido sin
-- equipos) o «Protocolo terminado» (equipo en stock), y solo si no tiene uno:
-- lo que viene del protocolo de stock o ya estaba anotado no se toca.
-- Una torre: sus partes llevan el número de la principal (ya era así).
-- Un kit de repuestos: todas las piezas llevan el mismo (es una sola hoja).

create table if not exists public.protocolo_correlativo (
  anio int not null,
  es_prueba boolean not null default false,
  ultimo int not null default 0,
  primary key (anio, es_prueba)
);
alter table public.protocolo_correlativo enable row level security;
revoke all on public.protocolo_correlativo from anon, authenticated;

-- Los reales de 2026 escritos a mano llegaron hasta el 2 (COFACO «1», 14-10;
-- «2» el 25-09): el primero automático es el 0003-2026.
insert into public.protocolo_correlativo (anio, es_prueba, ultimo)
values (2026, false, 2) on conflict do nothing;

create or replace function public.protocolo_siguiente_numero(p_es_prueba boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anio int := extract(year from now() at time zone 'America/Lima')::int;
  v_n int;
begin
  insert into protocolo_correlativo (anio, es_prueba, ultimo)
  values (v_anio, coalesce(p_es_prueba, false), 1)
  on conflict (anio, es_prueba) do update set ultimo = protocolo_correlativo.ultimo + 1
  returning ultimo into v_n;
  return lpad(v_n::text, 4, '0') || '-' || v_anio;
end $function$;
revoke all on function public.protocolo_siguiente_numero(boolean) from public, anon, authenticated;

-- Máquina (o pieza) del pedido: al quedar probada sin número, toma el siguiente.
create or replace function public.pedido_equipo_numero_de_protocolo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tipo text;
  v_ref text;
begin
  if new.prueba_lista_at is null or old.prueba_lista_at is not null then return new; end if;
  if btrim(coalesce(new.protocolo_ref, '')) <> '' then return new; end if;
  select tipo_pedido into v_tipo from servicios_postventa where id = new.servicio_id;
  if coalesce(v_tipo, '') in ('revision', 'mantenimiento') then return new; end if;
  -- Kit de repuestos (0517): una sola hoja, un solo número.
  if coalesce(v_tipo, '') = 'repuesto' then
    select pe.protocolo_ref into v_ref from pedido_equipos pe
     where pe.servicio_id = new.servicio_id and pe.id <> new.id
       and pe.prueba_lista_at is not null and btrim(coalesce(pe.protocolo_ref, '')) <> ''
     order by pe.prueba_lista_at desc, pe.orden limit 1;
  end if;
  new.protocolo_ref := coalesce(v_ref, protocolo_siguiente_numero(new.es_prueba));
  return new;
end $function$;

drop trigger if exists ad_numero_de_protocolo on public.pedido_equipos;
create trigger ad_numero_de_protocolo before update of prueba_lista_at on public.pedido_equipos
for each row execute function public.pedido_equipo_numero_de_protocolo();

-- Equipo en stock: al terminar el protocolo sin número, toma el siguiente; y el
-- número ya puesto no se borra al guardar la cabecera.
create or replace function public.protocolo_stock_numero()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if btrim(coalesce(new.protocolo_ref, '')) = '' and btrim(coalesce(old.protocolo_ref, '')) <> '' then
    new.protocolo_ref := old.protocolo_ref;
  end if;
  if new.terminado_at is not null and old.terminado_at is null and btrim(coalesce(new.protocolo_ref, '')) = '' then
    new.protocolo_ref := protocolo_siguiente_numero(new.es_prueba);
  end if;
  return new;
end $function$;

drop trigger if exists ad_numero_de_protocolo on public.protocolos_stock;
create trigger ad_numero_de_protocolo before update on public.protocolos_stock
for each row execute function public.protocolo_stock_numero();

-- Pedido sin equipos (repuesto/accesorio/embalaje, 0353): igual.
create or replace function public.servicio_numero_de_protocolo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.prueba_lista_at is null or old.prueba_lista_at is not null then return new; end if;
  if btrim(coalesce(new.protocolo_prueba_ref, '')) <> '' then return new; end if;
  if coalesce(new.tipo_pedido, '') in ('revision', 'mantenimiento') then return new; end if;
  -- Con equipos, el número va en cada máquina (almacen_probar_equipo lo junta).
  if exists (select 1 from pedido_equipos where servicio_id = new.id) then return new; end if;
  new.protocolo_prueba_ref := protocolo_siguiente_numero(new.es_prueba);
  return new;
end $function$;

drop trigger if exists ad_numero_de_protocolo on public.servicios_postventa;
create trigger ad_numero_de_protocolo before update of prueba_lista_at on public.servicios_postventa
for each row execute function public.servicio_numero_de_protocolo();
