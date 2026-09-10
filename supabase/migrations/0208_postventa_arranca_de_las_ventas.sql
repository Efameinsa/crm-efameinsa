-- ============================================================
-- Postventa arranca de las ventas de la empresa (gerencia, 10-09)
-- ============================================================
-- Carlos, definiendo por dónde empieza a trabajar el área:
--
--   «yo como postventa tendría que tener acá todas las ventas de todos los
--    comerciales, correcto, todas las ventas de la empresa, por decirlo así,
--    para yo comenzar a atender […] terminando ese barrido […] ¿y dónde están
--    los 900? Yo como postventa tendría que tener la vista».
--
-- Hoy no la tiene. `oportunidades_servicios_select` le deja ver solo lo que
-- tiene `tipo_postventa`, así que las ventas de los comerciales no existen para
-- ella: la pantalla del parque salía de las máquinas fichadas —310 clientes— y
-- la empresa le ha vendido a 696.
--
-- LO QUE NO SE ABRE: EL MONTO. Carlos, en la misma reunión: «¿puedes hacer el
-- corte que solamente tenga la información básica? […] que salga solamente la
-- descripción de la cotización, del producto y todo eso, pero que no salga el
-- monto». Por eso esto NO es una política sobre `ventas` —una política abre la
-- fila entera, con `monto_total` adentro— sino una función que devuelve las
-- cuatro columnas que sirven para llamar: a quién, cuándo, qué y con qué serie.
--
-- Y NO MUEVE NADA. Ver la venta no es tomar el cliente: la cartera sigue siendo
-- de quien vendió (0080). Lo que postventa abre es la oportunidad de
-- mantenimiento, con `ofrecer_mantenimiento` de siempre.

create or replace function ventas_para_el_parque(p_comercial uuid default null)
returns table (cuenta_id uuid, fecha_venta date, equipo text, serie text)
language sql
stable
security definer
set search_path = public
as $$
  select o.cuenta_id, v.fecha_venta, v.equipo_historico, v.serie
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
   order by v.fecha_venta desc
   limit 5000
$$;

comment on function ventas_para_el_parque is
  'Las ventas de la empresa vistas desde postventa, para saber a quién ofrecerle mantenimiento: cliente, cuándo, qué equipo y qué serie. SIN el monto, a propósito (gerencia, 10-09). No mueve la cartera.';

revoke all on function ventas_para_el_parque(uuid) from public;
grant execute on function ventas_para_el_parque(uuid) to authenticated;
