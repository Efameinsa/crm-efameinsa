-- 0291 · FINANZAS VE LOS EQUIPOS DEL PEDIDO (23-09).
--
-- El pedido que imprime Central (0290) lleva la serie de cada equipo y Finanzas
-- lo recibe para liquidar; la lectura de pedido_equipos no incluía a Finanzas
-- y la hoja le salía sin series. Solo lectura: las series las ponen Central y
-- el almacén.
drop policy if exists pedido_equipos_lectura on public.pedido_equipos;
create policy pedido_equipos_lectura on public.pedido_equipos for select
  using (
    (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)
       or rol_actual() = 'central'::rol_usuario or rol_actual() = 'finanzas'::rol_usuario)
    and es_prueba = coalesce((select es_cuenta_prueba()), false)
  );
