-- Primero los cierres de postventa, después los de los comerciales.
--
-- Carlos, 10-09, explicando el orden del barrido y por qué ese y no otro:
--
--   «postventa durante 10 años ha vendido mantenimiento preventivo […] agarra
--    un cliente, lo llama […] ¿por qué hemos empezado por ahí? Porque es más
--    fácil, porque este cliente teóricamente es el que compra mantenimiento
--    preventivo. […] Terminando ese barrido, vamos a decir que son 100 […]
--    ¿ahora qué toca? Venderle o ofrecerle el mantenimiento a todos los demás
--    clientes de toda la empresa, que están fuera de esos 100. ¿Y dónde están
--    los 900?».
--
-- Y Santos, el mismo día: a Ariana se le dan los cierres de postventa del 2020
-- al 2025 y, recién cuando termine eso, los cierres de los comerciales.
--
-- Los dos grupos ya están en la base y se distinguen por el expediente del que
-- salió la venta: `tipo_postventa` no nulo es un cierre del área. Son 250
-- clientes contra 504. Lo único que faltaba era decirlo en la respuesta para
-- que la pantalla pueda separarlos.
--
-- Sigue sin viajar el monto.

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
  de_postventa     integer,
  de_comercial     integer,
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
         count(*) filter (where o.tipo_postventa is not null)::integer,
         count(*) filter (where o.tipo_postventa is null)::integer,
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
  'Las ventas de la empresa vistas desde postventa, agrupadas por cliente y separando las que salieron de un cierre del área de las de los comerciales: ese es el orden del barrido que fijó gerencia el 10-09 (primero los 100, después los 900). SIN el monto, a propósito. No mueve la cartera.';

revoke all on function ventas_para_el_parque(uuid) from public;
grant execute on function ventas_para_el_parque(uuid) to authenticated;
