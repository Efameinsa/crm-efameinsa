-- 0301 · El servicio de embalaje tiene su propio circuito (reunión 25-09).
--
-- Lesly y Ruby, 25-09: «tenemos equipos, tenemos servicios y tenemos
-- repuestos… el servicio se parte en dos: mantenimiento, que sube un informe,
-- y embalaje, que es lo mismo que un repuesto: solamente una foto». El pedido
-- de TUNUPA (embalaje en jaula de madera) había entrado como «mantenimiento»
-- porque sus ítems son de tipo servicio, y pedía «Mantenimiento ejecutado,
-- con informe» y datos de máquina (ciclos, fecha, hora) que no existen. El de
-- GILBERTO (un eje de tambor) había entrado como «equipo» y pedía la
-- videollamada de preinstalación.
--
-- · Nuevo tipo 'embalaje': recorrido corto, como el repuesto (listo y
--   embalado → dirección, apertura y despacho → cierre con las fotos de la
--   salida, que el almacén ya sube: mínimo 3). Sin plano, sin preinstalación
--   y sin informe.
-- · El clasificador reconoce «embalaje / jaula / enjaulado» en los servicios.
-- · Se corrigen los dos pedidos mal clasificados que salieron en la reunión.

alter table public.servicios_postventa drop constraint if exists servicios_postventa_tipo_pedido_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_tipo_pedido_check
  check (tipo_pedido = any (array['equipo', 'repuesto', 'mantenimiento', 'revision', 'embalaje']));

create or replace function public.tipo_pedido_del_informe(p_items jsonb)
 returns text
 language sql
 immutable
as $function$
  with v as (
    select coalesce(x->>'tipo', 'equipo') as tipo, lower(coalesce(x->>'descripcion', '')) as d
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
     where coalesce(x->>'bloque', 'venta') = 'venta'
  )
  select case
    when not exists (select 1 from v) then 'equipo'
    when bool_and(tipo = 'repuesto') then 'repuesto'
    -- 0301: el embalaje (jaula, enjaulado) es un servicio que se cierra con fotos, no con informe.
    when bool_and(tipo = 'servicio') and bool_and(d ~ '(embala|jaula|enjaul)') then 'embalaje'
    when bool_and(tipo = 'servicio') and bool_or(d ~ 'revisi') and not bool_or(d ~ 'manteni') then 'revision'
    when bool_and(tipo = 'servicio') then 'mantenimiento'
    else 'equipo' end
  from v;
$function$;

-- TUNUPA: embalaje en jaula de madera (entró como mantenimiento).
update public.servicios_postventa
   set tipo_pedido = 'embalaje', entrega_en = null, con_instalacion = null, updated_at = now()
 where id = '4a7a2e68-b070-4870-b49f-5d94c478ac67' and tipo_pedido = 'mantenimiento';

-- GILBERTO: eje de tambor K115 (entró como equipo). Sale por agencia, sin instalación.
update public.servicios_postventa
   set tipo_pedido = 'repuesto', updated_at = now()
 where id = '503f58b0-c621-4422-8bc1-dfb031557eb3' and tipo_pedido = 'equipo';
