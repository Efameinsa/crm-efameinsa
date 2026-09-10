-- Una fila por cliente, no una por venta (corrección de la 0208, mismo día).
--
-- La 0208 devolvía una fila por venta: 1.242 filas. PostgREST corta las
-- respuestas en 1.000 y ENTREGA LAS PRIMERAS MIL SIN DECIR NADA — la pantalla
-- mostraba 563 de 696 clientes y se veía perfectamente normal. Es la misma
-- familia de trampa que la URL larga: la respuesta a medias que parece entera.
--
-- Y además es lo que la pantalla necesita: agrupa por cliente igual. Se agrupa
-- en la base, que sabe hacerlo, y bajan 696 filas.
--
-- Sigue sin viajar el monto (Carlos, 10-09).

drop function if exists ventas_para_el_parque(uuid);

create or replace function ventas_para_el_parque(p_comercial uuid default null)
returns table (cuenta_id uuid, ultima_venta date, ventas integer, equipos text[])
language sql
stable
security definer
set search_path = public
as $$
  select o.cuenta_id,
         max(v.fecha_venta)::date,
         count(*)::integer,
         -- Hasta cuatro descripciones distintas: es lo que entra en la fila y
         -- alcanza para saber de qué se le habla al cliente.
         (array_agg(distinct nullif(btrim(v.equipo_historico), '')))[1:4]
    from ventas v
    join oportunidades o on o.id = v.oportunidad_id
    join cuentas c on c.id = o.cuenta_id
   where v.anulada_at is null
     and o.cuenta_id is not null
     -- Quien ve todo postventa ve la empresa entera; un comercial, su cartera.
     and (
       (select es_backoffice()) or (select puede_postventa())
       or c.comercial_id = (select auth.uid())
     )
     and (p_comercial is null or c.comercial_id = p_comercial)
   group by o.cuenta_id
$$;

comment on function ventas_para_el_parque is
  'Las ventas de la empresa vistas desde postventa, agrupadas por cliente: cuándo fue la última, cuántas y qué se le vendió. SIN el monto, a propósito (gerencia, 10-09). No mueve la cartera.';

revoke all on function ventas_para_el_parque(uuid) from public;
grant execute on function ventas_para_el_parque(uuid) to authenticated;
