-- La misma lista, en un solo viaje.
--
-- La 0209 devolvía el id del cliente y nada más, así que la pantalla tenía que
-- ir a buscar las 386 fichas que faltaban —cuatro viajes más— y encima pedía
-- los servicios y las oportunidades por lotes: catorce idas y vueltas para
-- armar una tabla. Seis segundos, casi todos de latencia.
--
-- Acá viaja también lo que la fila muestra del cliente: cómo se llama, su
-- documento, dónde está y de quién es la cartera. Nada de eso es nuevo para
-- quien la llama —postventa ya puede abrir esas fichas (0109)— y sigue sin
-- viajar el monto, que es lo único que gerencia pidió tapar.

drop function if exists ventas_para_el_parque(uuid);

create or replace function ventas_para_el_parque(p_comercial uuid default null)
returns table (
  cuenta_id        uuid,
  razon_social     text,
  num_doc          text,
  zona             text,
  comercial_codigo text,
  comercial_nombre text,
  ultima_venta     date,
  ventas           integer,
  equipos          text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select o.cuenta_id,
         max(c.razon_social),
         max(c.num_doc),
         coalesce(max(c.distrito), max(c.provincia)),
         max(p.codigo_comercial),
         max(p.nombre),
         max(v.fecha_venta)::date,
         count(*)::integer,
         (array_agg(distinct nullif(btrim(v.equipo_historico), '')))[1:4]
    from ventas v
    join oportunidades o on o.id = v.oportunidad_id
    join cuentas c on c.id = o.cuenta_id
    left join perfiles p on p.id = c.comercial_id
   where v.anulada_at is null
     and o.cuenta_id is not null
     and (
       (select es_backoffice()) or (select puede_postventa())
       or c.comercial_id = (select auth.uid())
     )
     and (p_comercial is null or c.comercial_id = p_comercial)
   group by o.cuenta_id
$$;

comment on function ventas_para_el_parque is
  'Las ventas de la empresa vistas desde postventa, agrupadas por cliente y con lo que la fila muestra de él: cuándo fue la última venta, cuántas, qué se le vendió y de quién es la cartera. SIN el monto, a propósito (gerencia, 10-09). No mueve la cartera.';

revoke all on function ventas_para_el_parque(uuid) from public;
grant execute on function ventas_para_el_parque(uuid) to authenticated;
