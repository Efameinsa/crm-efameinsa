-- La última gestión POR CLIENTE, en una fila por cliente.
--
-- Hermana de la 0194, por el mismo motivo y con la misma trampa detrás. Desde
-- que «Las ventas de la empresa» arranca de las ventas (0208/0209) la pantalla
-- mira 696 clientes y no 310: pedir sus actividades con `in(...)` por lotes
-- traía las 2.880 filas SIETE veces para quedarse con una por cliente, y la
-- página tardaba seis segundos.
--
-- Acá se hace lo que la base sabe hacer: `distinct on` por cuenta. 696 filas.
--
-- Los permisos no se aflojan: son las mismas condiciones de la 0194 —el dueño
-- de la oportunidad, el dueño de la cuenta, backoffice, Central y postventa
-- sobre las oportunidades de servicio—, más la de la 0109 para que postventa
-- vea la gestión comercial de un cliente que sí puede mirar. Se excluyen las
-- notas: una nota no es una llamada, y lo que la pantalla contesta es «¿quién
-- habló con este cliente por última vez?».

create or replace function public.ultima_gestion_de_cuentas(p_ids uuid[])
returns table (cuenta_id uuid, realizada_at timestamptz, tipo text, quien text, codigo text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (o.cuenta_id)
         o.cuenta_id, a.realizada_at, a.tipo::text, p.nombre, p.codigo_comercial
    from actividades a
    join oportunidades o on o.id = a.oportunidad_id
    left join perfiles p on p.id = a.realizada_por
   where o.cuenta_id = any(p_ids)
     and a.tipo <> 'nota'
     and (
          o.comercial_id = auth.uid()
       or exists (select 1 from cuentas c where c.id = o.cuenta_id and c.comercial_id = auth.uid())
       or coalesce(es_backoffice(), false)
       or coalesce(rol_actual() = 'central', false)
       or coalesce(puede_postventa(), false)
     )
   order by o.cuenta_id, a.realizada_at desc
$$;

comment on function public.ultima_gestion_de_cuentas(uuid[]) is
  'La última gestión de cada cliente —de quien sea, comercial o postventa—, en una fila por cliente. Es lo que evita la llamada cruzada en «Las ventas de la empresa» (gerencia, 10-09).';

revoke all on function public.ultima_gestion_de_cuentas(uuid[]) from public;
grant execute on function public.ultima_gestion_de_cuentas(uuid[]) to authenticated;
