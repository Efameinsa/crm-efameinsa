-- «PREVENTIVOS POR VENDER» NO TARDABA: FALLABA.
--
-- Santos, 08-09: «la vista de preventivos por vender se demora mucho en
-- cargar». Medido con su sesión: 11 segundos, de los cuales 9 se los llevaba
-- UNA consulta que además devolvía CERO filas — y no porque no hubiera datos:
-- las mismas filas, leídas sin RLS, son 530 y tardan 433 ms.
--
-- La causa: la pantalla pedía las actividades de las 500 oportunidades con un
-- `in(...)` de 500 UUID. PostgREST arma eso como GET, y la URL le quedaba de
-- 18.580 caracteres: el pedido no llega, muere solo después de nueve segundos
-- y supabase-js devuelve `data: null`. Como el código lo lee igual que «no hay
-- resultados», la columna «última gestión» salía vacía SIN UN SOLO ERROR a la
-- vista. Es la misma trampa que ya costó caro tres veces en este repositorio.
--
-- La función arregla las dos cosas de un saque:
--   · El arreglo de ids viaja en el CUERPO de un POST: no hay URL que reventar.
--   · Devuelve UNA fila por oportunidad (`distinct on`), no las 2.000 que había
--     que ordenar y descartar en JavaScript: 251 filas en 123 ms.
--
-- Los permisos no se aflojan: repite las mismas condiciones que las políticas
-- de `actividades` —el dueño de la oportunidad, el dueño de la cuenta,
-- backoffice, Central, y postventa sobre las oportunidades de servicio—, así
-- que nadie ve una gestión que antes no pudiera ver.

create or replace function public.ultima_gestion_de_oportunidades(p_ids uuid[])
returns table (oportunidad_id uuid, realizada_at timestamptz, nota text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (a.oportunidad_id) a.oportunidad_id, a.realizada_at, a.nota
    from actividades a
    join oportunidades o on o.id = a.oportunidad_id
   where a.oportunidad_id = any(p_ids)
     and (
          o.comercial_id = auth.uid()
       or exists (select 1 from cuentas c where c.id = o.cuenta_id and c.comercial_id = auth.uid())
       or coalesce(es_backoffice(), false)
       or coalesce(rol_actual() = 'central', false)
       or (coalesce(puede_postventa(), false) and o.tipo_postventa is not null)
     )
   order by a.oportunidad_id, a.realizada_at desc
$$;

comment on function public.ultima_gestion_de_oportunidades(uuid[]) is
  'La última gestión de cada oportunidad, en una fila por oportunidad. Existe porque pedirlas con in(500 ids) arma una URL de 18 KB que PostgREST no responde: la pantalla esperaba 9 segundos y se quedaba sin la columna, sin avisar (08-09).';

revoke all on function public.ultima_gestion_de_oportunidades(uuid[]) from public;
grant execute on function public.ultima_gestion_de_oportunidades(uuid[]) to authenticated;
