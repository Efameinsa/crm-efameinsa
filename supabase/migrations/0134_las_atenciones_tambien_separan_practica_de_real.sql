-- ============================================================
-- CRM EFAMEINSA · Migración 0134 · Las atenciones también separan práctica de real
-- ============================================================
-- EL HUECO. La 0088 dividió en dos mundos las tablas que el área comparte
-- —«es_prueba = es_cuenta_prueba()» en toda política, para que practicar sea
-- inofensivo—. La 0131 creó `atenciones` DESPUÉS, con su columna es_prueba y
-- con el trigger de la 0132 propagándola bien… pero sus tres políticas se
-- escribieron sin la condición. Resultado, encontrado el 31-08 al sembrar la
-- demo de gerencia: la cuenta REAL de postventa veía las atenciones de
-- ejemplo del banco de pruebas en «Mi día» y en su pipeline — cuatro filas
-- sintéticas mezcladas con el trabajo de verdad.
--
-- LA REGLA ES LA DE LA 0088, PALABRA POR PALABRA: una cuenta de práctica ve
-- exactamente lo sintético y nada más; todas las demás ven exactamente lo
-- real y nada más. Se agrega el `and es_prueba = es_cuenta_prueba()` a las
-- tres políticas, sin tocar nada más de su lógica.

drop policy if exists atenciones_lectura on atenciones;
create policy atenciones_lectura on atenciones for select to authenticated
  using (
    (
      coalesce(es_postventa(), false)
      or coalesce(es_backoffice(), false)
      or coalesce(es_operaciones(), false)
      or coalesce(rol_actual() = 'central', false)
      or asignado_a = auth.uid()
    )
    and es_prueba = es_cuenta_prueba()
  );

drop policy if exists atenciones_alta on atenciones;
create policy atenciones_alta on atenciones for insert to authenticated
  with check (
    (
      coalesce(es_postventa(), false)
      or coalesce(es_backoffice(), false)
      or coalesce(es_operaciones(), false)
      or coalesce(rol_actual() = 'central', false)
    )
    and es_prueba = es_cuenta_prueba()
  );

drop policy if exists atenciones_edicion on atenciones;
create policy atenciones_edicion on atenciones for update to authenticated
  using (
    (
      coalesce(es_postventa(), false)
      or coalesce(es_backoffice(), false)
      or coalesce(es_operaciones(), false)
      or asignado_a = auth.uid()
    )
    and es_prueba = es_cuenta_prueba()
  )
  with check (
    (
      coalesce(es_postventa(), false)
      or coalesce(es_backoffice(), false)
      or coalesce(es_operaciones(), false)
      or asignado_a = auth.uid()
    )
    and es_prueba = es_cuenta_prueba()
  );
