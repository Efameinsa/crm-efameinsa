-- ============================================================
-- CRM EFAMEINSA · Migración 0313 · La serie se escribe sin el rótulo
-- ============================================================
-- 26-09, pedido de Sierra Travel cerrado por Rubí a las 10:20: la máquina quedó
-- DOS veces en el parque. La serie se cargó en la lista del pedido como
-- «SERIE: 602KWDJ3Y690» (con el rótulo copiado de la guía); la máquina ya estaba
-- fichada desde el 09-09 como «602KWDJ3Y690». El índice único compara
-- upper(btrim(serie)), así que para la base eran dos máquinas distintas: el
-- cierre creó una ficha nueva con garantía y preventivo, y las atenciones del
-- cliente siguieron colgadas de la vieja, sin preventivo.
--
-- 1. limpiar_serie(): quita el rótulo («SERIE:», «N° SERIE», «NRO DE SERIE»,
--    «S/N:») y los espacios de los bordes, y pasa a mayúsculas.
-- 2. Un disparador en equipos_instalados y en pedido_equipos la aplica antes
--    de guardar: el ON CONFLICT del índice ya compara la serie limpia (los
--    disparadores BEFORE corren antes de la verificación de unicidad).
-- 3. Se unen las dos fichas de Sierra Travel en la que usan las atenciones.
--
-- Ojo: en los regex de la base `\s` no funciona; se usa [[:space:]].

create or replace function public.limpiar_serie(p text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      upper(btrim(coalesce(p, ''))),
      '^((N[°ºO.]*|NRO\.?|NUM(ERO)?\.?)[[:space:]]*(DE[[:space:]]*)?)?(SERIE|S/N)[[:space:]]*[:#.-]?[[:space:]]*',
      ''
    ),
    ''
  )
$$;

-- 3. La unión (antes de los disparadores, para no chocar con el índice).
do $$
declare
  v_vieja uuid := '398ebf55-2156-48f1-b256-f4476121bf40';
  v_nueva uuid := '7a7e32ce-741b-4576-bf65-31419626add7';
  v_n record;
begin
  select * into v_n from equipos_instalados where id = v_nueva;
  if v_n.id is null or not exists (select 1 from equipos_instalados where id = v_vieja) then
    raise notice 'La unión de Sierra Travel ya estaba hecha';
    return;
  end if;
  update pedido_equipos set equipo_id = v_vieja, serie = '602KWDJ3Y690' where equipo_id = v_nueva;
  delete from equipos_instalados where id = v_nueva;
  update equipos_instalados e
     set servicio_id = coalesce(e.servicio_id, v_n.servicio_id),
         informe_cierre_id = coalesce(e.informe_cierre_id, v_n.informe_cierre_id),
         cuenta_id = coalesce(e.cuenta_id, v_n.cuenta_id),
         fecha_venta = coalesce(e.fecha_venta, v_n.fecha_venta),
         fecha_despacho = coalesce(e.fecha_despacho, v_n.fecha_despacho),
         guia_remision = coalesce(e.guia_remision, v_n.guia_remision),
         garantia_meses = coalesce(v_n.garantia_meses, e.garantia_meses),
         proximo_mantenimiento = coalesce(v_n.proximo_mantenimiento, e.proximo_mantenimiento),
         ubicacion = coalesce(e.ubicacion, v_n.ubicacion)
   where e.id = v_vieja;
end $$;

-- 2. Los disparadores.
create or replace function public.limpiar_serie_al_guardar()
returns trigger
language plpgsql
as $$
begin
  if new.serie is not null then
    new.serie := limpiar_serie(new.serie);
  end if;
  return new;
end $$;

drop trigger if exists aa_limpiar_serie on public.equipos_instalados;
create trigger aa_limpiar_serie before insert or update of serie on public.equipos_instalados
  for each row execute function public.limpiar_serie_al_guardar();

drop trigger if exists aa_limpiar_serie on public.pedido_equipos;
create trigger aa_limpiar_serie before insert or update of serie on public.pedido_equipos
  for each row execute function public.limpiar_serie_al_guardar();
