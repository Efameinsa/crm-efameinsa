-- ============================================================
-- CRM EFAMEINSA · Migración 0013 · Visibilidad por cartera (B7.7)
-- ============================================================
-- Caso de la demo (docs/06): un cliente se reasigna de un comercial a otro
-- (ej. el comercial 8 se va, su cartera pasa al 5) → el nuevo dueño de la
-- cuenta debe poder LEER todo el historial previo de esa cuenta (oportunidades,
-- actividades, cotizaciones, ventas) aunque las haya hecho el comercial
-- anterior. Hoy las policies de SELECT exigen `comercial_id = auth.uid()` en
-- la propia fila, así que el nuevo dueño no ve nada de lo anterior.
--
-- Regla nueva SOLO para SELECT: comercial_id de la fila (o de su oportunidad)
-- = auth.uid()  OR  el dueño ACTUAL de la cuenta (cuentas.comercial_id) =
-- auth.uid(). Los WRITE (insert/update/delete) quedan exactamente como
-- estaban: solo se escribe sobre gestiones propias (comercial_id = auth.uid()
-- en la fila), nunca en gestiones ajenas aunque ahora se vean.
--
-- Nota importante (documentada, no es un bug): el comercial anterior SIGUE
-- viendo las oportunidades que quedaron con su comercial_id — es su gestión
-- histórica real y no se le retira. Lo nuevo es que el dueño actual de la
-- cartera AHORA TAMBIÉN las ve.

-- ------------------------------------------------------------
-- OPORTUNIDADES
-- ------------------------------------------------------------
drop policy oportunidades_comercial on oportunidades;

create policy oportunidades_comercial_select on oportunidades for select to authenticated
  using (
    comercial_id = auth.uid()
    or exists (select 1 from cuentas c where c.id = cuenta_id and c.comercial_id = auth.uid())
  );

create policy oportunidades_comercial_insert on oportunidades for insert to authenticated
  with check (comercial_id = auth.uid());

create policy oportunidades_comercial_update on oportunidades for update to authenticated
  using (comercial_id = auth.uid()) with check (comercial_id = auth.uid());

create policy oportunidades_comercial_delete on oportunidades for delete to authenticated
  using (comercial_id = auth.uid());

-- ------------------------------------------------------------
-- ACTIVIDADES
-- ------------------------------------------------------------
drop policy actividades_por_oportunidad on actividades;

create policy actividades_select on actividades for select to authenticated
  using (exists (
    select 1 from oportunidades o
    where o.id = oportunidad_id
      and (
        o.comercial_id = auth.uid()
        or exists (select 1 from cuentas c where c.id = o.cuenta_id and c.comercial_id = auth.uid())
        or es_backoffice()
      )
  ));

create policy actividades_insert on actividades for insert to authenticated
  with check (exists (
    select 1 from oportunidades o where o.id = oportunidad_id and (o.comercial_id = auth.uid() or es_backoffice())
  ));

create policy actividades_update on actividades for update to authenticated
  using (exists (
    select 1 from oportunidades o where o.id = oportunidad_id and (o.comercial_id = auth.uid() or es_backoffice())
  ))
  with check (exists (
    select 1 from oportunidades o where o.id = oportunidad_id and (o.comercial_id = auth.uid() or es_backoffice())
  ));

create policy actividades_delete on actividades for delete to authenticated
  using (exists (
    select 1 from oportunidades o where o.id = oportunidad_id and (o.comercial_id = auth.uid() or es_backoffice())
  ));

-- ------------------------------------------------------------
-- COTIZACIONES
-- ------------------------------------------------------------
drop policy cotizaciones_comercial on cotizaciones;

create policy cotizaciones_select on cotizaciones for select to authenticated
  using (exists (
    select 1 from oportunidades o
    where o.id = oportunidad_id
      and (
        o.comercial_id = auth.uid()
        or exists (select 1 from cuentas c where c.id = o.cuenta_id and c.comercial_id = auth.uid())
      )
  ));

create policy cotizaciones_insert on cotizaciones for insert to authenticated
  with check (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));

create policy cotizaciones_update on cotizaciones for update to authenticated
  using (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()))
  with check (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));

create policy cotizaciones_delete on cotizaciones for delete to authenticated
  using (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));

-- ------------------------------------------------------------
-- COTIZACION_ITEMS
-- ------------------------------------------------------------
drop policy items_por_cotizacion on cotizacion_items;

create policy items_cotizacion_select on cotizacion_items for select to authenticated
  using (exists (
    select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
    where cz.id = cotizacion_id
      and (
        o.comercial_id = auth.uid()
        or exists (select 1 from cuentas c where c.id = o.cuenta_id and c.comercial_id = auth.uid())
        or es_backoffice()
        or rol_actual() = 'central'
      )
  ));

create policy items_cotizacion_insert on cotizacion_items for insert to authenticated
  with check (exists (
    select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
    where cz.id = cotizacion_id and (o.comercial_id = auth.uid() or es_backoffice())
  ));

create policy items_cotizacion_update on cotizacion_items for update to authenticated
  using (exists (
    select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
    where cz.id = cotizacion_id and (o.comercial_id = auth.uid() or es_backoffice() or rol_actual() = 'central')
  ))
  with check (exists (
    select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
    where cz.id = cotizacion_id and (o.comercial_id = auth.uid() or es_backoffice())
  ));

create policy items_cotizacion_delete on cotizacion_items for delete to authenticated
  using (exists (
    select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
    where cz.id = cotizacion_id and (o.comercial_id = auth.uid() or es_backoffice() or rol_actual() = 'central')
  ));

-- ------------------------------------------------------------
-- VENTAS
-- ------------------------------------------------------------
drop policy ventas_comercial on ventas;

create policy ventas_select on ventas for select to authenticated
  using (exists (
    select 1 from oportunidades o
    where o.id = oportunidad_id
      and (
        o.comercial_id = auth.uid()
        or exists (select 1 from cuentas c where c.id = o.cuenta_id and c.comercial_id = auth.uid())
      )
  ));

create policy ventas_insert on ventas for insert to authenticated
  with check (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));

create policy ventas_update on ventas for update to authenticated
  using (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()))
  with check (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));

create policy ventas_delete on ventas for delete to authenticated
  using (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));
