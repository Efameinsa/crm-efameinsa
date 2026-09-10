-- La marca de «no contactar» (0217) viaja con la lista de ventas: si no, «Las
-- ventas de la empresa» le sigue ofreciendo el botón «Ofrecer mantenimiento» a
-- quien pidió que no lo llamen, que es el único caso en que la pantalla haría
-- daño de verdad.

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
  equipos          text[],
  no_contactar     boolean
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
         (array_agg(distinct nullif(btrim(v.equipo_historico), '')))[1:4],
         bool_or(c.no_contactar_at is not null)
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
  'Las ventas de la empresa vistas desde postventa, agrupadas por cliente y separando los cierres del área de los de los comerciales (el orden del barrido que fijó gerencia el 10-09). Trae también si el cliente pidió no ser contactado. SIN el monto, a propósito. No mueve la cartera.';

revoke all on function ventas_para_el_parque(uuid) from public;
grant execute on function ventas_para_el_parque(uuid) to authenticated;
