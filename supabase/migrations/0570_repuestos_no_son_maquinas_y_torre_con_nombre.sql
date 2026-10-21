-- 0570 · Los repuestos no son máquinas del cliente; la torre nombra a su lavadora y su secadora
--
-- Reunión del 20-10-2026 15:45, Lino Espíritu. Al abrir la apertura desde el
-- caso, la lista de «equipos del cliente» traía ocho piezas del kit de gas
-- (niples, codos, una reducción bush) con su código como serie y todas
-- llamadas «VALVULA REGULADORA». Gerencia: «no, pero son repuestos esto…
-- la regla es que nada de repuestos, solamente equipos». Al 20-10 había 44
-- fichas de «máquina» que nacieron de pedidos de repuesto, accesorio o embalaje.
--
-- Y en la torre (lavadora + secadora apilable) las dos fichas se llamaban igual
-- que la ficha técnica de la torre, «LAVADORA – SECADORA…»: en el caso no se
-- sabía cuál era cuál. Gerencia: «te va a llegar completo, pero más abajo
-- lavadora, secadora, y tú le pones la serie».
--
-- QUÉ HACE
--   · equipos_instalados.es_repuesto (no se borra nada): la marca la pone un
--     trigger al registrar o cambiar la serie, y se rellena hacia atrás.
--     Las listas de máquinas del caso y de la apertura las dejan fuera.
--   · La unidad principal de una torre se llama «Lavadora · …» en el parque
--     cuando se le agrega la secadora (y se corrige en las que ya están).

alter table public.equipos_instalados add column if not exists es_repuesto boolean not null default false;
comment on column public.equipos_instalados.es_repuesto is
  '0570: nació de un repuesto, accesorio o embalaje (o su «serie» es un código del catálogo): no es una máquina del cliente.';

create or replace function public.parece_repuesto(p_serie text, p_modelo text, p_servicio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
       exists (select 1 from servicios_postventa s where s.id = p_servicio and s.tipo_pedido in ('repuesto', 'accesorio', 'embalaje'))
    or upper(coalesce(p_serie, '')) ~ '^(IM|MD)[A-Z]{0,3}[0-9]{6,}$'
    or exists (select 1 from productos p where upper(p.sku) = upper(btrim(coalesce(p_serie, ''))) and length(btrim(p_serie)) >= 5)
    or upper(btrim(coalesce(p_modelo, ''))) ~ '^(KIT|VALVULA|VÁLVULA|NIPLE|CODO|TEE|REDUCCION|REDUCCIÓN|COCHE|REPUESTO|RESISTENCIA|CERRADURA|TARJETA|MANGUERA|FILTRO|EMPAQUE|CORREA|RODAMIENTO|ABRAZADERA|DUCTO)\M',
    false)
$$;

create or replace function public.marcar_equipo_repuesto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.es_repuesto := parece_repuesto(new.serie, new.modelo_texto, new.servicio_id);
  return new;
end $$;
drop trigger if exists zv_equipo_es_repuesto on public.equipos_instalados;
create trigger zv_equipo_es_repuesto
  before insert or update of serie, modelo_texto, servicio_id on public.equipos_instalados
  for each row execute function public.marcar_equipo_repuesto();

update public.equipos_instalados set es_repuesto = parece_repuesto(serie, modelo_texto, servicio_id)
 where es_repuesto is distinct from parece_repuesto(serie, modelo_texto, servicio_id);

-- La lavadora de la torre, con su nombre (las que ya tienen la secadora registrada).
update public.equipos_instalados e
   set modelo_texto = 'Lavadora · ' || e.modelo_texto
  from pedido_equipos m
 where m.equipo_id = e.id and m.parte_de is null
   and exists (select 1 from pedido_equipos p where p.parte_de = m.id)
   and e.modelo_texto !~* '^(lavadora|secadora) ·';

-- La próxima torre: se nombra sola al agregar la secadora.
CREATE OR REPLACE FUNCTION public.agregar_parte_del_equipo(p_item uuid, p_nombre text, p_serie text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it     record;
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_serie  text := upper(btrim(coalesce(p_serie, '')));
  v_orden  int;
  v_id     uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa, el almacén o Central registran las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item for update;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  if v_it.parte_de is not null then raise exception 'Agregue la otra máquina desde la unidad principal'; end if;
  if coalesce(v_it.sin_serie, false) then raise exception 'Ese artículo no lleva serie'; end if;
  if v_it.serie is null then raise exception 'Primero registre la serie de la primera máquina'; end if;
  if v_nombre is null then raise exception 'Diga qué máquina es (ej. Secadora)'; end if;
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;
  if (select count(*) from pedido_equipos where parte_de = p_item) >= 3 then
    raise exception 'Esa unidad ya tiene 4 series: revise si no es otra unidad';
  end if;
  if exists (select 1 from pedido_equipos where servicio_id = v_it.servicio_id and upper(btrim(serie)) = v_serie) then
    raise exception 'La serie % ya está en este pedido', v_serie;
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden from pedido_equipos where servicio_id = v_it.servicio_id;
  insert into pedido_equipos (servicio_id, orden, descripcion, sku, en_este_despacho,
    prueba_lista_at, prueba_lista_por, protocolo_ref, es_prueba, parte_de, parte_nombre)
  values (v_it.servicio_id, v_orden, initcap(v_nombre) || ' · ' || v_it.descripcion, v_it.sku, v_it.en_este_despacho,
    v_it.prueba_lista_at, v_it.prueba_lista_por, v_it.protocolo_ref, v_it.es_prueba, p_item, initcap(v_nombre))
  returning id into v_id;

  -- La serie y el parque, por el mismo camino que cualquier máquina.
  perform registrar_serie_del_equipo(v_id, v_serie);
  -- 0570: con la secadora registrada, la principal es la lavadora de la torre.
  update equipos_instalados e set modelo_texto = 'Lavadora · ' || e.modelo_texto
   where e.id = v_it.equipo_id and e.modelo_texto !~* '^(lavadora|secadora) ·';
  return v_id;
end $function$;
