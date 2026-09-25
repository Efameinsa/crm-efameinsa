-- 0304 · El almacén y operaciones también pasan contactos a Central (25-09).
--
-- Lesly: «en la vista de almacén no tiene para registrar una llamada y se
-- envíe a la Central». Al almacén también le llaman clientes directo; como
-- con comercial y postventa, lo que entra se registra una vez y va a la cola
-- de Central, que lo deriva. La cuenta del almacén ya podía (su rol es
-- comercial); operaciones (Lesly) no, porque la regla solo aceptaba el rol
-- comercial. Mismas condiciones: entra sin asignar, en triaje y a nombre de
-- quien lo registra. Leerlo ya se podía (leads_comercial_ve_los_suyos).

drop policy if exists leads_almacen_operaciones_registra on public.leads;
create policy leads_almacen_operaciones_registra on public.leads
  as permissive
  for insert
  to authenticated
  with check (
    ((select es_almacen()) or (select es_operaciones()))
    and estado = 'pendiente_triaje'::estado_lead
    and asignado_a is null
    and recibido_por = (select auth.uid())
  );
